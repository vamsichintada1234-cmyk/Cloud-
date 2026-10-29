package com.myphone.assistant

import android.content.Context

object Prefs {
    const val ENGLISH_INDIA = "en-IN"
    const val TELUGU = "te-IN"

    private fun prefs(context: Context) = context.getSharedPreferences("assistant", Context.MODE_PRIVATE)

    fun language(context: Context): String = prefs(context).getString("language", ENGLISH_INDIA) ?: ENGLISH_INDIA

    fun setLanguage(context: Context, tag: String) {
        prefs(context).edit().putString("language", tag).apply()
    }

    fun claudeApiKey(context: Context): String? = prefs(context).getString("claude_api_key", null)

    fun setClaudeApiKey(context: Context, key: String?) {
        prefs(context).edit().putString("claude_api_key", key?.trim()?.ifEmpty { null }).apply()
    }
}
