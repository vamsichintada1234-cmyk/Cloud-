package com.myphone.assistant

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.inputmethod.EditorInfo
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.myphone.assistant.command.Command
import com.myphone.assistant.command.CommandParser
import com.myphone.assistant.databinding.ActivityMainBinding
import com.myphone.assistant.system.PhoneAccessibilityService
import com.myphone.assistant.voice.Speaker
import com.myphone.assistant.voice.VoiceListener
import com.myphone.assistant.voice.WakeWordService

class MainActivity : AppCompatActivity(), VoiceListener.Callback {

    private lateinit var binding: ActivityMainBinding
    private lateinit var listener: VoiceListener
    private lateinit var speaker: Speaker
    private lateinit var brain: AssistantBrain
    private var listening = false

    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        refreshStatus()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        listener = VoiceListener(this, this)
        speaker = Speaker(this)
        brain = AssistantBrain(this)

        binding.micButton.setOnClickListener { onMicPressed() }
        binding.runButton.setOnClickListener { runTypedCommand() }
        binding.commandInput.setOnEditorActionListener { _, actionId, _ ->
            (actionId == EditorInfo.IME_ACTION_GO).also { if (it) runTypedCommand() }
        }
        binding.wakeSwitch.setOnCheckedChangeListener { button, checked ->
            if (!button.isPressed) return@setOnCheckedChangeListener
            if (checked) startWakeWord() else WakeWordService.stop(this)
        }
        binding.accessibilityButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        binding.languageGroup.check(
            if (Prefs.language(this) == Prefs.TELUGU) R.id.languageTelugu else R.id.languageEnglish,
        )
        binding.languageGroup.setOnCheckedChangeListener { _, id ->
            Prefs.setLanguage(this, if (id == R.id.languageTelugu) Prefs.TELUGU else Prefs.ENGLISH_INDIA)
        }

        ConversationLog.onChanged = ::renderLog
        renderLog()
        requestMissingPermissions()

        if (savedInstanceState == null && launchedAsAssistant(intent)) onMicPressed()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (launchedAsAssistant(intent)) onMicPressed()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    override fun onDestroy() {
        ConversationLog.onChanged = null
        listener.reset()
        speaker.shutdown()
        super.onDestroy()
    }

    private fun launchedAsAssistant(intent: Intent?) =
        intent?.action == Intent.ACTION_ASSIST || intent?.action == Intent.ACTION_VOICE_COMMAND

    private fun onMicPressed() {
        if (!granted(Manifest.permission.RECORD_AUDIO)) {
            requestMissingPermissions()
            return
        }
        // Only one recognizer can use the mic; let the background service take the command.
        if (WakeWordService.isRunning) {
            WakeWordService.listenNow(this)
            return
        }
        if (listening) {
            listener.cancel()
            setListening(false)
            return
        }
        if (!listener.isAvailable()) {
            binding.statusText.setText(R.string.no_recognizer)
            return
        }
        speaker.stop()
        listener.start(Prefs.language(this))
        setListening(true)
    }

    private fun runTypedCommand() {
        val text = binding.commandInput.text.toString().trim()
        if (text.isEmpty()) return
        binding.commandInput.text.clear()
        handle(listOf(text))
    }

    private fun handle(alternatives: List<String>) {
        val reply = brain.handle(alternatives)
        binding.statusText.text = reply.message
        if (reply.command is Command.Stop) speaker.stop() else speaker.speak(reply.message)
    }

    override fun onListeningStarted() {
        binding.statusText.setText(R.string.listening)
    }

    override fun onPartialResult(text: String) {
        binding.statusText.text = text
    }

    override fun onResults(matches: List<String>) {
        setListening(false)
        // Saying the wake phrase here is optional: "hello my phone open youtube" == "open youtube".
        val commands = matches.map { CommandParser.afterWakePhrase(it) ?: it }
        handle(commands)
    }

    override fun onError(error: Int) {
        setListening(false)
        binding.statusText.text = VoiceListener.describe(error)
    }

    private fun setListening(value: Boolean) {
        listening = value
        binding.micButton.setText(if (value) R.string.stop else R.string.tap_to_speak)
        if (!value && binding.statusText.text == getString(R.string.listening)) {
            binding.statusText.setText(R.string.ready)
        }
    }

    private fun startWakeWord() {
        if (!granted(Manifest.permission.RECORD_AUDIO)) {
            binding.wakeSwitch.isChecked = false
            requestMissingPermissions()
            return
        }
        if (listening) {
            listener.cancel()
            setListening(false)
        }
        WakeWordService.start(this)
        Toast.makeText(this, R.string.wake_started, Toast.LENGTH_SHORT).show()
    }

    private fun refreshStatus() {
        binding.wakeSwitch.isChecked = WakeWordService.isRunning
        val accessibilityOn = PhoneAccessibilityService.isEnabled(this)
        binding.accessibilityStatus.setText(
            if (accessibilityOn) R.string.accessibility_on else R.string.accessibility_off,
        )
        binding.accessibilityButton.setText(
            if (accessibilityOn) R.string.accessibility_manage else R.string.accessibility_enable,
        )
        val missing = missingPermissions()
        binding.permissionStatus.text = if (missing.isEmpty()) {
            getString(R.string.permissions_ok)
        } else {
            getString(R.string.permissions_missing, missing.joinToString { it.substringAfterLast('.') })
        }
    }

    private fun requestMissingPermissions() {
        val missing = missingPermissions()
        if (missing.isNotEmpty()) permissionLauncher.launch(missing.toTypedArray())
    }

    private fun missingPermissions(): List<String> {
        val wanted = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.CALL_PHONE,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) wanted += Manifest.permission.POST_NOTIFICATIONS
        return wanted.filterNot(::granted)
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun renderLog() {
        binding.logText.text = ConversationLog.all()
            .asReversed()
            .joinToString("\n\n") { "${it.speaker}: ${it.text}" }
            .ifEmpty { getString(R.string.examples) }
    }
}
