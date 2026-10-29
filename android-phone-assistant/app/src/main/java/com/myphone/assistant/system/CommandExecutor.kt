package com.myphone.assistant.system

import android.Manifest
import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.provider.AlarmClock
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.myphone.assistant.command.Command
import com.myphone.assistant.command.GlobalAction
import com.myphone.assistant.command.MessageApp
import com.myphone.assistant.command.PhoneNumbers
import com.myphone.assistant.command.SearchApp
import com.myphone.assistant.command.SettingsPanel
import com.myphone.assistant.command.VolumeAction
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Carries out a [Command] on the phone and returns what the assistant should say back. */
class CommandExecutor(private val context: Context) {

    private val apps = AppLauncher(context)
    private val contacts = ContactsHelper(context)

    fun execute(command: Command): String = when (command) {
        is Command.Call -> call(command.target)
        is Command.OpenApp -> openApp(command.appName)
        is Command.SearchIn -> search(command.app, command.query)
        is Command.Navigate -> navigate(command.place)
        is Command.SendMessage -> sendMessage(command)
        is Command.SetAlarm -> setAlarm(command.hour, command.minute)
        is Command.SetTimer -> setTimer(command.seconds)
        is Command.Flashlight -> flashlight(command.on)
        is Command.Volume -> volume(command.action)
        is Command.OpenSettings -> openSettings(command.panel)
        is Command.Global -> withAccessibility { if (it.perform(command.action)) globalReply(command.action) else "That isn't supported on this phone." }
        is Command.Scroll -> withAccessibility { if (it.scroll(command.direction)) "Scrolling." else "I couldn't scroll here." }
        is Command.Click -> withAccessibility { if (it.click(command.text)) "Tapped ${command.text}." else "I couldn't find ${command.text} on the screen." }
        is Command.Type -> withAccessibility { if (it.type(command.text)) "Typed it." else "I couldn't find a text box to type in." }
        Command.TakePhoto -> if (launch(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA))) "Opening the camera." else "I couldn't open the camera."
        Command.TellTime -> "It's ${SimpleDateFormat("h:mm a", Locale.ENGLISH).format(Date())}."
        Command.TellDate -> "Today is ${SimpleDateFormat("EEEE, d MMMM yyyy", Locale.ENGLISH).format(Date())}."
        Command.Battery -> battery()
        Command.Stop -> "Okay."
        is Command.Unknown -> unknown(command.text)
    }

    private fun call(target: String): String {
        val (name, number) = if (PhoneNumbers.looksLikeNumber(target)) {
            target to target
        } else {
            if (!granted(Manifest.permission.READ_CONTACTS)) return "Please allow contacts permission so I can find $target."
            val contact = contacts.find(target) ?: return "I couldn't find $target in your contacts."
            contact.name to contact.number
        }
        val action = if (granted(Manifest.permission.CALL_PHONE)) Intent.ACTION_CALL else Intent.ACTION_DIAL
        return if (launch(Intent(action, Uri.fromParts("tel", number, null)))) "Calling $name." else "I couldn't place the call."
    }

    private fun openApp(spoken: String): String {
        val special = when (spoken) {
            "camera" -> Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)
            "phone", "dialer", "dial pad", "dialpad" -> Intent(Intent.ACTION_DIAL)
            "contacts" -> Intent(Intent.ACTION_VIEW, ContactsContract.Contacts.CONTENT_URI)
            "settings" -> Intent(Settings.ACTION_SETTINGS)
            else -> null
        }
        if (special != null && launch(special)) return "Opening $spoken."

        val app = apps.find(spoken) ?: run {
            apps.invalidate()
            apps.find(spoken)
        } ?: return "I couldn't find an app called $spoken."
        val intent = apps.launchIntent(app) ?: return "I can't open ${app.label}."
        return if (launch(intent)) "Opening ${app.label}." else "I couldn't open ${app.label}."
    }

    private fun search(app: SearchApp, query: String): String {
        val q = Uri.encode(query)
        val opened = when (app) {
            SearchApp.YOUTUBE ->
                launch(Intent(Intent.ACTION_SEARCH).setPackage("com.google.android.youtube").putExtra(SearchManager.QUERY, query)) ||
                    view("https://www.youtube.com/results?search_query=$q")
            SearchApp.GOOGLE ->
                launch(Intent(Intent.ACTION_WEB_SEARCH).putExtra(SearchManager.QUERY, query)) ||
                    view("https://www.google.com/search?q=$q")
            SearchApp.PLAY_STORE -> view("market://search?q=$q") || view("https://play.google.com/store/search?q=$q")
            SearchApp.MAPS -> view("geo:0,0?q=$q")
            SearchApp.SPOTIFY -> view("spotify:search:$q") || view("https://open.spotify.com/search/$q")
            SearchApp.AMAZON -> view("https://www.amazon.in/s?k=$q")
            SearchApp.FLIPKART -> view("https://www.flipkart.com/search?q=$q")
            SearchApp.WIKIPEDIA -> view("https://en.wikipedia.org/wiki/Special:Search?search=$q")
        }
        return if (opened) "Searching ${app.label} for $query." else "I couldn't open ${app.label}."
    }

    private fun navigate(place: String): String {
        val q = Uri.encode(place)
        return if (view("google.navigation:q=$q") || view("geo:0,0?q=$q")) "Starting directions to $place." else "I couldn't open maps."
    }

    private fun sendMessage(cmd: Command.SendMessage): String {
        val (name, number) = if (PhoneNumbers.looksLikeNumber(cmd.contact)) {
            cmd.contact to PhoneNumbers.compact(cmd.contact)
        } else {
            if (!granted(Manifest.permission.READ_CONTACTS)) return "Please allow contacts permission so I can find ${cmd.contact}."
            val contact = contacts.find(cmd.contact) ?: return "I couldn't find ${cmd.contact} in your contacts."
            contact.name to contact.number
        }
        return when (cmd.via) {
            MessageApp.WHATSAPP -> {
                val url = "https://api.whatsapp.com/send?phone=${PhoneNumbers.toInternational(number)}&text=${Uri.encode(cmd.message)}"
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                if (launch(Intent(intent).setPackage("com.whatsapp")) || launch(intent)) {
                    "Opened WhatsApp chat with $name. Say \"click send\" or tap send."
                } else {
                    "I couldn't open WhatsApp."
                }
            }
            MessageApp.SMS -> {
                val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$number")).putExtra("sms_body", cmd.message)
                if (launch(intent)) "Message to $name is ready. Say \"click send\" or tap send." else "I couldn't open messages."
            }
        }
    }

    private fun setAlarm(hour: Int, minute: Int): String {
        val intent = Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, hour)
            .putExtra(AlarmClock.EXTRA_MINUTES, minute)
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        val time = String.format(Locale.ENGLISH, "%d:%02d %s", if (hour % 12 == 0) 12 else hour % 12, minute, if (hour < 12) "AM" else "PM")
        return if (launch(intent)) "Alarm set for $time." else "I couldn't set the alarm."
    }

    private fun setTimer(seconds: Int): String {
        val intent = Intent(AlarmClock.ACTION_SET_TIMER)
            .putExtra(AlarmClock.EXTRA_LENGTH, seconds)
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        val spoken = if (seconds % 60 == 0) "${seconds / 60} minutes" else "$seconds seconds"
        return if (launch(intent)) "Timer set for $spoken." else "I couldn't set the timer."
    }

    private fun flashlight(on: Boolean): String {
        val camera = context.getSystemService(CameraManager::class.java)
        return try {
            val id = camera.cameraIdList.firstOrNull {
                camera.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            } ?: return "This phone has no flashlight."
            camera.setTorchMode(id, on)
            if (on) "Flashlight on." else "Flashlight off."
        } catch (e: CameraAccessException) {
            "The camera is busy, so I can't use the flashlight."
        }
    }

    private fun volume(action: VolumeAction): String {
        val audio = context.getSystemService(AudioManager::class.java)
        val stream = AudioManager.STREAM_MUSIC
        when (action) {
            VolumeAction.UP -> audio.adjustStreamVolume(stream, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
            VolumeAction.DOWN -> audio.adjustStreamVolume(stream, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
            VolumeAction.MUTE -> audio.adjustStreamVolume(stream, AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI)
            VolumeAction.MAX -> audio.setStreamVolume(stream, audio.getStreamMaxVolume(stream), AudioManager.FLAG_SHOW_UI)
        }
        return when (action) {
            VolumeAction.UP -> "Volume up."
            VolumeAction.DOWN -> "Volume down."
            VolumeAction.MUTE -> "Muted."
            VolumeAction.MAX -> "Volume at maximum."
        }
    }

    private fun openSettings(panel: SettingsPanel): String {
        val q = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        val (action, name) = when (panel) {
            SettingsPanel.WIFI -> (if (q) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS) to "Wi-Fi"
            SettingsPanel.BLUETOOTH -> Settings.ACTION_BLUETOOTH_SETTINGS to "Bluetooth"
            SettingsPanel.MOBILE_DATA -> (if (q) Settings.Panel.ACTION_INTERNET_CONNECTIVITY else Settings.ACTION_DATA_ROAMING_SETTINGS) to "internet"
            SettingsPanel.DISPLAY -> Settings.ACTION_DISPLAY_SETTINGS to "display"
            SettingsPanel.SOUND -> Settings.ACTION_SOUND_SETTINGS to "sound"
            SettingsPanel.LOCATION -> Settings.ACTION_LOCATION_SOURCE_SETTINGS to "location"
            SettingsPanel.AIRPLANE -> Settings.ACTION_AIRPLANE_MODE_SETTINGS to "airplane mode"
            SettingsPanel.BATTERY_SAVER -> Settings.ACTION_BATTERY_SAVER_SETTINGS to "battery saver"
            SettingsPanel.APPS -> Settings.ACTION_APPLICATION_SETTINGS to "apps"
            SettingsPanel.GENERAL -> Settings.ACTION_SETTINGS to "settings"
        }
        if (!launch(Intent(action)) && !launch(Intent(Settings.ACTION_SETTINGS))) return "I couldn't open settings."
        // Android does not let normal apps flip these switches directly; the user taps the toggle.
        return if (panel == SettingsPanel.GENERAL) "Opening settings." else "Opening $name settings."
    }

    private fun battery(): String {
        val bm = context.getSystemService(BatteryManager::class.java)
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return if (bm.isCharging) "Battery is at $level percent and charging." else "Battery is at $level percent."
    }

    /** Like Google Assistant: try it as an app name, otherwise search the web. */
    private fun unknown(text: String): String {
        if (text.isBlank()) return "Sorry, I didn't catch that."
        if (text.split(" ").size <= 2) apps.find(text)?.let { return openApp(text) }
        return search(SearchApp.GOOGLE, text)
    }

    private fun globalReply(action: GlobalAction) = when (action) {
        GlobalAction.BACK -> "Going back."
        GlobalAction.HOME -> "Going home."
        GlobalAction.RECENTS -> "Showing recent apps."
        GlobalAction.NOTIFICATIONS -> "Showing notifications."
        GlobalAction.QUICK_SETTINGS -> "Showing quick settings."
        GlobalAction.SCREENSHOT -> "Screenshot taken."
        GlobalAction.LOCK_SCREEN -> "Locking the phone."
        GlobalAction.POWER_DIALOG -> "Showing the power menu."
    }

    private inline fun withAccessibility(block: (PhoneAccessibilityService) -> String): String {
        val service = PhoneAccessibilityService.instance
            ?: return "Please turn on My Phone in Accessibility settings so I can control the screen."
        return block(service)
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private fun view(uri: String) = launch(Intent(Intent.ACTION_VIEW, Uri.parse(uri)))

    private fun launch(intent: Intent): Boolean = try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: ActivityNotFoundException) {
        false
    } catch (e: SecurityException) {
        false
    }
}
