package com.myphone.assistant.voice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.SpeechRecognizer
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.myphone.assistant.AssistantBrain
import com.myphone.assistant.MainActivity
import com.myphone.assistant.Prefs
import com.myphone.assistant.R
import com.myphone.assistant.command.Command
import com.myphone.assistant.command.CommandParser

/**
 * Keeps listening in the background for "Hello my phone".
 *
 * "Hello my phone, open YouTube" runs the command straight away; "Hello my phone" alone
 * makes the assistant answer "Yes?" and wait for the command.
 */
class WakeWordService : Service(), VoiceListener.Callback {

    companion object {
        private const val ACTION_STOP = "com.myphone.assistant.STOP"
        private const val ACTION_LISTEN_NOW = "com.myphone.assistant.LISTEN_NOW"
        private const val CHANNEL_ID = "wake_word"
        private const val NOTIFICATION_ID = 1

        @Volatile
        var isRunning = false
            private set

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, WakeWordService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, WakeWordService::class.java))
        }

        /** Skip the wake phrase and take a command right now (mic button while the service runs). */
        fun listenNow(context: Context) {
            context.startService(Intent(context, WakeWordService::class.java).setAction(ACTION_LISTEN_NOW))
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var listener: VoiceListener
    private lateinit var speaker: Speaker
    private lateinit var brain: AssistantBrain
    private var awaitingCommand = false
    private var speaking = false

    private val listenRunnable = Runnable {
        if (isRunning && !speaking) listener.start(Prefs.language(this))
    }

    override fun onCreate() {
        super.onCreate()
        listener = VoiceListener(this, this)
        speaker = Speaker(this)
        brain = AssistantBrain(this)
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_ID, getString(R.string.wake_channel), NotificationManager.IMPORTANCE_LOW),
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(), type)
        } catch (e: RuntimeException) {
            // Microphone permission missing or the app is not allowed to start a foreground service now.
            stopSelf()
            return START_NOT_STICKY
        }
        val firstStart = !isRunning
        isRunning = true
        when {
            intent?.action == ACTION_LISTEN_NOW -> promptForCommand()
            firstStart -> listenSoon(0)
        }
        return START_STICKY
    }

    override fun onResults(matches: List<String>) {
        if (awaitingCommand) {
            awaitingCommand = false
            respond(matches)
            return
        }
        val afterWake = matches.mapNotNull(CommandParser::afterWakePhrase)
        when {
            afterWake.isEmpty() -> listenSoon(150)
            afterWake.all { it.isBlank() } -> promptForCommand()
            else -> respond(afterWake.filter { it.isNotBlank() })
        }
    }

    override fun onError(error: Int) {
        when (error) {
            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                awaitingCommand = false
                listenSoon(150)
            }
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_CLIENT -> {
                listener.reset()
                listenSoon(1000)
            }
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> stopSelf()
            else -> listenSoon(2000)
        }
    }

    private fun promptForCommand() {
        awaitingCommand = true
        say("Yes?")
    }

    private fun respond(alternatives: List<String>) {
        speaking = true
        handler.removeCallbacks(listenRunnable)
        listener.cancel()
        brain.handle(alternatives) { reply ->
            if (!isRunning) return@handle
            if (reply.command is Command.Stop) {
                say("Okay, I'll stop listening.") { stopSelf() }
            } else {
                say(reply.message)
            }
        }
    }

    private fun say(text: String, then: (() -> Unit)? = null) {
        speaking = true
        handler.removeCallbacks(listenRunnable)
        listener.cancel()
        speaker.speak(text) {
            speaking = false
            if (then != null) then() else listenSoon(300)
        }
    }

    private fun listenSoon(delayMs: Long) {
        handler.removeCallbacks(listenRunnable)
        handler.postDelayed(listenRunnable, delayMs)
    }

    private fun notification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_mic)
        .setContentTitle(getString(R.string.wake_notification_title))
        .setContentText(getString(R.string.wake_notification_text))
        .setOngoing(true)
        .setContentIntent(
            PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE),
        )
        .addAction(
            0,
            getString(R.string.stop),
            PendingIntent.getService(
                this,
                1,
                Intent(this, WakeWordService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE,
            ),
        )
        .build()

    override fun onDestroy() {
        isRunning = false
        handler.removeCallbacksAndMessages(null)
        listener.reset()
        speaker.shutdown()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
