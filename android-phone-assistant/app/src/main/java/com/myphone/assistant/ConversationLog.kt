package com.myphone.assistant

import android.os.Handler
import android.os.Looper

/** Shared history so the screen also shows commands handled by the background service. */
object ConversationLog {
    const val YOU = "You"
    const val ASSISTANT = "My Phone"

    data class Entry(val speaker: String, val text: String)

    private val entries = ArrayDeque<Entry>()
    private val main = Handler(Looper.getMainLooper())

    var onChanged: (() -> Unit)? = null

    fun add(speaker: String, text: String) {
        main.post {
            entries.addLast(Entry(speaker, text))
            while (entries.size > 50) entries.removeFirst()
            onChanged?.invoke()
        }
    }

    fun all(): List<Entry> = entries.toList()
}
