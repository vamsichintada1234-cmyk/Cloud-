package com.myphone.assistant.command

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CommandParserTest {

    private fun assertParses(expected: Command, spoken: String) = assertEquals(spoken, expected, CommandParser.parse(spoken))

    @Test
    fun wakePhrase() {
        assertEquals("open youtube", CommandParser.afterWakePhrase("Hello my phone, open YouTube"))
        assertEquals("", CommandParser.afterWakePhrase("hello my phone"))
        assertEquals("youtube open", CommandParser.afterWakePhrase("హలో మై ఫోన్ యూట్యూబ్ ఓపెన్ చేయి"))
        assertNull(CommandParser.afterWakePhrase("open youtube"))
    }

    @Test
    fun calls() {
        assertParses(Command.Call("amma"), "Call Amma")
        assertParses(Command.Call("ravi kumar"), "make a call to Ravi Kumar")
        assertParses(Command.Call("9876543210"), "dial 98765 43210")
        assertParses(Command.Call("amma"), "amma ki call cheyi")
        assertParses(Command.Call("amma"), "Amma ki phone cheyyi")
    }

    @Test
    fun openApps() {
        assertParses(Command.OpenApp("youtube"), "Open YouTube")
        assertParses(Command.OpenApp("whatsapp"), "launch the WhatsApp app")
        assertParses(Command.OpenApp("youtube"), "youtube open cheyi")
        assertParses(Command.OpenApp("youtube"), "యూట్యూబ్ ఓపెన్ చేయి")
        assertParses(Command.OpenApp("instagram"), "instagram open")
        assertParses(Command.OpenApp("play store"), "play store")
        assertParses(Command.OpenApp("camera"), "open camera")
    }

    @Test
    fun searchInApps() {
        assertParses(Command.SearchIn(SearchApp.YOUTUBE, "telugu songs"), "search Telugu songs on YouTube")
        assertParses(Command.SearchIn(SearchApp.YOUTUBE, "telugu songs"), "open YouTube and search telugu songs")
        assertParses(Command.SearchIn(SearchApp.YOUTUBE, "cooking videos"), "search YouTube for cooking videos")
        assertParses(Command.SearchIn(SearchApp.YOUTUBE, "pushpa songs"), "play pushpa songs")
        assertParses(Command.SearchIn(SearchApp.YOUTUBE, "songs"), "youtube lo songs search cheyi")
        assertParses(Command.SearchIn(SearchApp.SPOTIFY, "arijit singh"), "play Arijit Singh on Spotify")
        assertParses(Command.SearchIn(SearchApp.MAPS, "pizza"), "find pizza on google maps")
        assertParses(Command.SearchIn(SearchApp.GOOGLE, "weather in hyderabad"), "search weather in Hyderabad")
        assertParses(Command.Question("who is the prime minister of india"), "Who is the prime minister of India?")
        assertParses(Command.Question("explain black holes simply"), "Explain black holes simply")
        assertParses(Command.SearchIn(SearchApp.MAPS, "charminar"), "where is Charminar")
    }

    @Test
    fun messages() {
        assertParses(
            Command.SendMessage(MessageApp.WHATSAPP, "ravi", "i am coming"),
            "Send WhatsApp to Ravi saying I am coming",
        )
        assertParses(
            Command.SendMessage(MessageApp.WHATSAPP, "mom", "call me"),
            "send message to mom saying call me on WhatsApp",
        )
        assertParses(Command.SendMessage(MessageApp.SMS, "ravi", "hello"), "text Ravi saying hello")
        assertParses(Command.SendMessage(MessageApp.WHATSAPP, "ravi", ""), "whatsapp Ravi")
    }

    @Test
    fun alarmsAndTimers() {
        assertParses(Command.SetAlarm(6, 30), "set alarm for 6:30 a.m.")
        assertParses(Command.SetAlarm(19, 0), "set an alarm at 7 pm")
        assertParses(Command.SetAlarm(0, 15), "wake me up at 12:15 am")
        assertParses(Command.SetTimer(300), "set timer for 5 minutes")
        assertParses(Command.SetTimer(30), "set a 30 second timer")
    }

    @Test
    fun deviceControls() {
        assertParses(Command.Flashlight(true), "turn on the flashlight")
        assertParses(Command.Flashlight(false), "torch off")
        assertParses(Command.Volume(VolumeAction.UP), "volume up")
        assertParses(Command.Volume(VolumeAction.DOWN), "decrease the volume")
        assertParses(Command.Volume(VolumeAction.MUTE), "mute")
        assertParses(Command.OpenSettings(SettingsPanel.WIFI), "turn on wifi")
        assertParses(Command.OpenSettings(SettingsPanel.BLUETOOTH), "open bluetooth settings")
        assertParses(Command.OpenSettings(SettingsPanel.GENERAL), "open settings")
        assertParses(Command.TakePhoto, "take a photo")
        assertParses(Command.TakePhoto, "click a selfie")
    }

    @Test
    fun screenControls() {
        assertParses(Command.Global(GlobalAction.BACK), "go back")
        assertParses(Command.Global(GlobalAction.HOME), "go home")
        assertParses(Command.Global(GlobalAction.HOME), "go to home screen")
        assertParses(Command.Global(GlobalAction.RECENTS), "show recent apps")
        assertParses(Command.Global(GlobalAction.NOTIFICATIONS), "open notifications")
        assertParses(Command.Global(GlobalAction.SCREENSHOT), "take a screenshot")
        assertParses(Command.Global(GlobalAction.LOCK_SCREEN), "lock the phone")
        assertParses(Command.Scroll(ScrollDirection.DOWN), "scroll down")
        assertParses(Command.Scroll(ScrollDirection.UP), "scroll up")
        assertParses(Command.Click("subscribe"), "click on subscribe")
        assertParses(Command.Click("send"), "tap the send button")
        assertParses(Command.Type("hello how are you"), "type hello how are you")
    }

    @Test
    fun infoAndNavigation() {
        assertParses(Command.TellTime, "What's the time?")
        assertParses(Command.TellTime, "what time is it")
        assertParses(Command.TellDate, "what is today's date")
        assertParses(Command.Battery, "how much battery is left")
        assertParses(Command.Navigate("hyderabad railway station"), "Navigate to Hyderabad railway station")
        assertParses(Command.Navigate("home"), "take me home")
        assertParses(Command.Stop, "stop")
        assertParses(Command.Stop, "ఆపు")
    }
}
