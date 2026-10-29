package com.myphone.assistant.voice

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** Text-to-speech that calls back on the main thread when it has finished talking. */
class Speaker(context: Context) : TextToSpeech.OnInitListener {

    private val main = Handler(Looper.getMainLooper())
    private val tts = TextToSpeech(context.applicationContext, this)
    private val callbacks = ConcurrentHashMap<String, () -> Unit>()
    private val pending = mutableListOf<Pair<String, (() -> Unit)?>>()
    private var state = State.INITIALIZING
    private val english = Locale.forLanguageTag("en-IN")
    private val telugu = Locale.forLanguageTag("te-IN")
    private var hasTelugu = false

    private enum class State { INITIALIZING, READY, FAILED }

    override fun onInit(status: Int) {
        main.post {
            if (status == TextToSpeech.SUCCESS) {
                if (tts.isLanguageAvailable(english) >= TextToSpeech.LANG_AVAILABLE) tts.language = english
                hasTelugu = tts.isLanguageAvailable(telugu) >= TextToSpeech.LANG_AVAILABLE
                tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) = Unit
                    override fun onDone(utteranceId: String?) = finish(utteranceId)

                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) = finish(utteranceId)
                    override fun onError(utteranceId: String?, errorCode: Int) = finish(utteranceId)
                })
                state = State.READY
            } else {
                state = State.FAILED
            }
            val queued = pending.toList()
            pending.clear()
            queued.forEach { (text, done) -> speak(text, done) }
        }
    }

    fun speak(text: String, onDone: (() -> Unit)? = null) {
        when (state) {
            State.INITIALIZING -> pending.add(text to onDone)
            State.FAILED -> onDone?.let { done -> main.post { done() } }
            State.READY -> {
                val id = UUID.randomUUID().toString()
                onDone?.let { callbacks[id] = it }
                // Claude may answer in Telugu script; the English voice can't read it.
                tts.language = if (hasTelugu && text.any { it in '\u0C00'..'\u0C7F' }) telugu else english
                if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) == TextToSpeech.ERROR) finish(id)
            }
        }
    }

    fun stop() {
        tts.stop()
        callbacks.keys.toList().forEach(::finish)
    }

    fun shutdown() {
        callbacks.clear()
        tts.shutdown()
    }

    private fun finish(id: String?) {
        val done = id?.let(callbacks::remove) ?: return
        main.post { done() }
    }
}
