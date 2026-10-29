package com.myphone.assistant.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/** Thin wrapper around [SpeechRecognizer]. Must be used from the main thread. */
class VoiceListener(private val context: Context, private val callback: Callback) {

    interface Callback {
        fun onListeningStarted() {}
        fun onPartialResult(text: String) {}
        fun onResults(matches: List<String>)
        fun onError(error: Int)
    }

    private var recognizer: SpeechRecognizer? = null

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) = callback.onListeningStarted()
        override fun onBeginningOfSpeech() = Unit
        override fun onRmsChanged(rmsdB: Float) = Unit
        override fun onBufferReceived(buffer: ByteArray?) = Unit
        override fun onEndOfSpeech() = Unit
        override fun onEvent(eventType: Int, params: Bundle?) = Unit

        override fun onError(error: Int) = callback.onError(error)

        override fun onPartialResults(partialResults: Bundle?) {
            matches(partialResults).firstOrNull()?.let(callback::onPartialResult)
        }

        override fun onResults(results: Bundle?) {
            val matches = matches(results)
            if (matches.isEmpty()) callback.onError(SpeechRecognizer.ERROR_NO_MATCH) else callback.onResults(matches)
        }
    }

    fun isAvailable() = SpeechRecognizer.isRecognitionAvailable(context)

    fun start(languageTag: String) {
        val r = recognizer ?: SpeechRecognizer.createSpeechRecognizer(context).also {
            it.setRecognitionListener(listener)
            recognizer = it
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        }
        r.startListening(intent)
    }

    fun cancel() {
        recognizer?.cancel()
    }

    /** Throws the recognizer away; the next [start] creates a fresh one. Fixes "busy" errors. */
    fun reset() {
        recognizer?.destroy()
        recognizer = null
    }

    private fun matches(bundle: Bundle?): List<String> =
        bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty().filter { it.isNotBlank() }

    companion object {
        fun describe(error: Int) = when (error) {
            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I didn't hear anything."
            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network problem. Check the internet."
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is needed."
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "The recognizer is busy, try again."
            SpeechRecognizer.ERROR_AUDIO -> "Microphone error."
            else -> "Speech error ($error)."
        }
    }
}
