package com.myphone.assistant.system

import android.content.Context
import android.content.Intent
import com.myphone.assistant.command.FuzzyMatcher

/** Finds installed apps by their spoken name. */
class AppLauncher(private val context: Context) {

    data class AppEntry(val label: String, val packageName: String)

    private var cache: List<AppEntry>? = null

    fun installedApps(): List<AppEntry> = cache ?: run {
        val pm = context.packageManager
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        @Suppress("DEPRECATION")
        pm.queryIntentActivities(launcher, 0)
            .map { AppEntry(it.loadLabel(pm).toString(), it.activityInfo.packageName) }
            .filter { it.packageName != context.packageName }
            .distinctBy { it.packageName }
            .also { cache = it }
    }

    fun find(name: String): AppEntry? = FuzzyMatcher.best(name, installedApps()) { it.label }

    fun launchIntent(app: AppEntry): Intent? = context.packageManager.getLaunchIntentForPackage(app.packageName)

    fun invalidate() {
        cache = null
    }
}
