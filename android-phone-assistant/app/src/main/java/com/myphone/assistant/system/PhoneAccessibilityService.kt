package com.myphone.assistant.system

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ComponentName
import android.content.Context
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.myphone.assistant.command.FuzzyMatcher
import com.myphone.assistant.command.GlobalAction
import com.myphone.assistant.command.ScrollDirection

/**
 * Gives the assistant "hands": press back/home, open notifications, take screenshots,
 * lock the screen, tap buttons by their text, type into fields and scroll any app.
 * The user must switch it on in Settings > Accessibility.
 */
class PhoneAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: PhoneAccessibilityService? = null
            private set

        fun isEnabled(context: Context): Boolean {
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            ) ?: return false
            val me = ComponentName(context, PhoneAccessibilityService::class.java)
            return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
        }
    }

    override fun onServiceConnected() {
        instance = this
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    /** Returns false if the action is not supported on this Android version. */
    fun perform(action: GlobalAction): Boolean {
        val code = when (action) {
            GlobalAction.BACK -> GLOBAL_ACTION_BACK
            GlobalAction.HOME -> GLOBAL_ACTION_HOME
            GlobalAction.RECENTS -> GLOBAL_ACTION_RECENTS
            GlobalAction.NOTIFICATIONS -> GLOBAL_ACTION_NOTIFICATIONS
            GlobalAction.QUICK_SETTINGS -> GLOBAL_ACTION_QUICK_SETTINGS
            GlobalAction.POWER_DIALOG -> GLOBAL_ACTION_POWER_DIALOG
            GlobalAction.SCREENSHOT ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) GLOBAL_ACTION_TAKE_SCREENSHOT else return false
            GlobalAction.LOCK_SCREEN ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) GLOBAL_ACTION_LOCK_SCREEN else return false
        }
        return performGlobalAction(code)
    }

    /** Taps the on-screen element whose text or description best matches [label]. */
    fun click(label: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val node = root.findAccessibilityNodeInfosByText(label).firstOrNull { it.isVisibleToUser }
            ?: FuzzyMatcher.best(label, allNodes(root).filter { it.isVisibleToUser && nodeLabel(it).isNotBlank() }) { nodeLabel(it) }
            ?: return false

        var target: AccessibilityNodeInfo? = node
        while (target != null && !target.isClickable) target = target.parent
        if (target?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) return true

        val bounds = Rect().also { node.getBoundsInScreen(it) }
        return tap(bounds.exactCenterX(), bounds.exactCenterY())
    }

    /** Types into the focused text field, or the first one on screen. */
    fun type(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val field = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.takeIf { it.isEditable }
            ?: allNodes(root).firstOrNull { it.isEditable }
            ?: return false
        field.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    /** "Scroll down" shows content further down, so the finger swipes upwards. */
    fun scroll(direction: ScrollDirection): Boolean {
        val metrics = resources.displayMetrics
        val w = metrics.widthPixels.toFloat()
        val h = metrics.heightPixels.toFloat()
        val (from, to) = when (direction) {
            ScrollDirection.DOWN -> (w / 2 to h * 0.75f) to (w / 2 to h * 0.25f)
            ScrollDirection.UP -> (w / 2 to h * 0.25f) to (w / 2 to h * 0.75f)
            ScrollDirection.LEFT -> (w * 0.2f to h / 2) to (w * 0.8f to h / 2)
            ScrollDirection.RIGHT -> (w * 0.8f to h / 2) to (w * 0.2f to h / 2)
        }
        val path = Path().apply {
            moveTo(from.first, from.second)
            lineTo(to.first, to.second)
        }
        return gesture(path, 350)
    }

    private fun tap(x: Float, y: Float): Boolean = gesture(Path().apply { moveTo(x, y) }, 60)

    private fun gesture(path: Path, durationMs: Long): Boolean {
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        return dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    private fun nodeLabel(node: AccessibilityNodeInfo): String =
        (node.text ?: node.contentDescription ?: "").toString()

    private fun allNodes(root: AccessibilityNodeInfo): List<AccessibilityNodeInfo> {
        val out = mutableListOf<AccessibilityNodeInfo>()
        val queue = ArrayDeque<AccessibilityNodeInfo>().apply { add(root) }
        while (queue.isNotEmpty() && out.size < 2000) {
            val node = queue.removeFirst()
            out.add(node)
            for (i in 0 until node.childCount) node.getChild(i)?.let(queue::add)
        }
        return out
    }
}
