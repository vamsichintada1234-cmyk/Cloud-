package com.myphone.assistant.command

/** Apps we know how to search inside directly. */
enum class SearchApp(val label: String, val spokenNames: List<String>) {
    YOUTUBE("YouTube", listOf("youtube", "you tube")),
    GOOGLE("Google", listOf("google", "chrome", "browser", "internet", "web")),
    PLAY_STORE("Play Store", listOf("play store", "playstore", "google play")),
    MAPS("Maps", listOf("google maps", "maps", "map")),
    SPOTIFY("Spotify", listOf("spotify")),
    AMAZON("Amazon", listOf("amazon")),
    FLIPKART("Flipkart", listOf("flipkart")),
    WIKIPEDIA("Wikipedia", listOf("wikipedia"));

    companion object {
        /** Every spoken name, longest first so "google maps" wins over "google". */
        val allNames: List<Pair<String, SearchApp>> = entries
            .flatMap { app -> app.spokenNames.map { it to app } }
            .sortedByDescending { it.first.length }

        fun fromName(name: String): SearchApp? = allNames.firstOrNull { it.first == name.trim() }?.second
    }
}

enum class MessageApp { WHATSAPP, SMS }

enum class VolumeAction { UP, DOWN, MUTE, MAX }

enum class SettingsPanel { WIFI, BLUETOOTH, MOBILE_DATA, DISPLAY, SOUND, LOCATION, AIRPLANE, BATTERY_SAVER, APPS, GENERAL }

enum class GlobalAction { BACK, HOME, RECENTS, NOTIFICATIONS, QUICK_SETTINGS, SCREENSHOT, LOCK_SCREEN, POWER_DIALOG }

enum class ScrollDirection { UP, DOWN, LEFT, RIGHT }

/** Everything the assistant understands, independent of Android so it can be unit tested. */
sealed class Command {
    data class Call(val target: String) : Command()
    data class OpenApp(val appName: String) : Command()
    data class SearchIn(val app: SearchApp, val query: String) : Command()
    data class Navigate(val place: String) : Command()
    data class SendMessage(val via: MessageApp, val contact: String, val message: String) : Command()
    data class SetAlarm(val hour: Int, val minute: Int) : Command()
    data class SetTimer(val seconds: Int) : Command()
    data class Flashlight(val on: Boolean) : Command()
    data class Volume(val action: VolumeAction) : Command()
    data class OpenSettings(val panel: SettingsPanel) : Command()
    data class Global(val action: GlobalAction) : Command()
    data class Scroll(val direction: ScrollDirection) : Command()
    data class Click(val text: String) : Command()
    data class Type(val text: String) : Command()
    data object TakePhoto : Command()
    data object TellTime : Command()
    data object TellDate : Command()
    data object Battery : Command()
    data object Stop : Command()
    data class Unknown(val text: String) : Command()
}
