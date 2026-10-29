package com.myphone.assistant.command

/** Converts spoken text into a [Command]. Rules are tried in order; the first match wins. */
object CommandParser {

    private val wakePhrases = listOf(
        "hello my phone", "hello mai phone", "hey my phone", "hi my phone",
        "ok my phone", "okay my phone", "hello phone", "hey phone",
    ).map { Regex("\\b${Regex.escape(it)}\\b") }

    private val apps = SearchApp.allNames.joinToString("|") { Regex.escape(it.first) }

    /**
     * Returns what was said after the wake phrase ("" if only the wake phrase was said),
     * or null if the wake phrase was not spoken at all.
     */
    fun afterWakePhrase(raw: String): String? {
        val text = TeluguNormalizer.basic(raw)
        for (phrase in wakePhrases) {
            val match = phrase.find(text) ?: continue
            return text.substring(match.range.last + 1).trim()
        }
        return null
    }

    fun parse(raw: String): Command {
        val text = TeluguNormalizer.normalize(raw)
        if (text.isEmpty()) return Command.Unknown(raw)
        return stop(text)
            ?: info(text)
            ?: global(text)
            ?: flashlight(text)
            ?: volume(text)
            ?: alarm(text)
            ?: timer(text)
            ?: photo(text)
            ?: message(text)
            ?: call(text)
            ?: navigate(text)
            ?: searchInApp(text)
            ?: settings(text)
            ?: openApp(text)
            ?: click(text)
            ?: type(text)
            ?: scroll(text)
            ?: webSearch(text)
            ?: bareAppName(text)
            ?: Command.Unknown(text)
    }

    private fun Regex.groups(text: String): List<String>? = matchEntire(text)?.groupValues

    private fun stop(t: String) =
        if (t.matches(Regex("(?:stop|cancel|exit|quit|stop listening|shut up|nothing|never mind)"))) Command.Stop else null

    private fun info(t: String): Command? = when {
        t.contains(Regex("\\b(?:whats the time|what is the time|what time is it|time now|current time|tell me the time|time ela undi)\\b")) ||
            t == "time" -> Command.TellTime
        t.contains(Regex("\\b(?:whats the date|what is the date|whats today|what day is it|todays date|which day|what is today)\\b")) ||
            t == "date" -> Command.TellDate
        t.contains(Regex("\\bbattery\\b")) && !t.contains("saver") -> Command.Battery
        else -> null
    }

    private fun global(t: String): Command? {
        val action = when {
            t.contains(Regex("\\bscreen ?shot\\b")) -> GlobalAction.SCREENSHOT
            t.matches(Regex("(?:go |press |click )?back|go back")) -> GlobalAction.BACK
            t.matches(Regex("(?:go )?(?:to )?(?:the )?home(?: screen| page)?")) -> GlobalAction.HOME
            t.matches(Regex("(?:show |open )?(?:the )?recents?(?: apps)?")) -> GlobalAction.RECENTS
            t.matches(Regex("(?:open |show |pull down )?(?:the |my )?notifications?(?: panel)?")) -> GlobalAction.NOTIFICATIONS
            t.matches(Regex("(?:open |show )?quick settings")) -> GlobalAction.QUICK_SETTINGS
            t.matches(Regex("lock(?: the| my)?(?: screen| phone| device)?|screen lock")) -> GlobalAction.LOCK_SCREEN
            t.contains(Regex("\\bpower (?:menu|options|button)\\b")) -> GlobalAction.POWER_DIALOG
            else -> return null
        }
        return Command.Global(action)
    }

    private fun flashlight(t: String): Command? {
        if (!t.contains(Regex("\\b(?:flash ?light|torch)\\b"))) return null
        return Command.Flashlight(on = !t.contains(Regex("\\b(?:off|disable|stop|close)\\b")))
    }

    private fun volume(t: String): Command? {
        val action = when {
            t.matches(Regex("(?:mute|silent|silent mode)(?: phone| the phone)?")) -> VolumeAction.MUTE
            !t.contains(Regex("\\bvolume\\b")) -> return null
            t.contains(Regex("\\b(?:max|maximum|full)\\b")) -> VolumeAction.MAX
            t.contains(Regex("\\b(?:mute|silent|zero|off)\\b")) -> VolumeAction.MUTE
            t.contains(Regex("\\b(?:down|decrease|reduce|lower|less|low)\\b")) -> VolumeAction.DOWN
            else -> VolumeAction.UP
        }
        return Command.Volume(action)
    }

    private fun alarm(t: String): Command? {
        if (!t.contains(Regex("\\b(?:alarm|wake me up)\\b"))) return null
        val m = Regex("\\b(\\d{1,2})(?:[: ](\\d{2}))?\\s*(am|pm)?\\b").find(t) ?: return null
        var hour = m.groupValues[1].toInt()
        val minute = m.groupValues[2].ifEmpty { "0" }.toInt()
        when (m.groupValues[3]) {
            "pm" -> if (hour < 12) hour += 12
            "am" -> if (hour == 12) hour = 0
        }
        if (hour > 23 || minute > 59) return null
        return Command.SetAlarm(hour, minute)
    }

    private fun timer(t: String): Command? {
        if (!t.contains(Regex("\\btimer\\b"))) return null
        val m = Regex("\\b(\\d+)\\s*(second|sec|minute|min|hour|hr)s?\\b").find(t) ?: return null
        val n = m.groupValues[1].toInt()
        val seconds = when (m.groupValues[2]) {
            "second", "sec" -> n
            "minute", "min" -> n * 60
            else -> n * 3600
        }
        return Command.SetTimer(seconds)
    }

    private fun photo(t: String) =
        if (t.contains(Regex("\\b(?:take|click|capture|tear)\\b.*\\b(?:photo|picture|selfie|pic|photograph)\\b")) ||
            t.matches(Regex("(?:photo|selfie)(?: take)?"))
        ) Command.TakePhoto else null

    private fun message(text: String): Command? {
        var t = text
        var via: MessageApp? = null
        Regex("\\s+(?:on|via|in|through) whatsapp$").find(t)?.let {
            via = MessageApp.WHATSAPP
            t = t.removeRange(it.range)
        }
        val full = Regex(
            "(?:send )?(?:an? )?(whatsapp|sms|text|message|msg)(?: message)? (?:to )?(.+?) " +
                "(?:saying|that|message|says|and say|telling|ani)\\s+(.+)",
        ).groups(t)
        val (kind, contact, body) = when {
            full != null -> Triple(full[1], full[2], full[3])
            else -> {
                val short = Regex("(?:send )?(?:an? )?(whatsapp|sms|text|message|msg)(?: message)? to (.+)").groups(t)
                    ?: Regex("(whatsapp) (.+)").groups(t)
                    ?: return null
                Triple(short[1], short[2], "")
            }
        }
        val app = via ?: if (kind == "whatsapp") MessageApp.WHATSAPP else MessageApp.SMS
        return Command.SendMessage(app, cleanName(contact), body.trim())
    }

    private fun call(t: String): Command? {
        val g = Regex("(?:make an? |do an? )?(?:phone |voice )?(?:call|dial|ring|phone)(?: to)? (.+)").groups(t) ?: return null
        val target = cleanName(g[1])
        if (target.isEmpty()) return null
        return Command.Call(if (PhoneNumbers.looksLikeNumber(target)) PhoneNumbers.compact(target) else target)
    }

    private fun navigate(t: String): Command? {
        Regex("(?:navigate|navigation|directions|get directions|take me|drive me|route|how (?:do i|to) (?:go|get))(?: me)?(?: to| for)? (.+)")
            .groups(t)?.let { return Command.Navigate(it[1]) }
        Regex("where is (.+)").groups(t)?.let { return Command.SearchIn(SearchApp.MAPS, it[1]) }
        if (t.endsWith(" near me")) return Command.SearchIn(SearchApp.MAPS, t)
        return null
    }

    private fun searchInApp(t: String): Command? {
        // "search songs on youtube", "play arijit songs on youtube"
        Regex("(?:search|search for|find|look up|look for|play|watch|show|show me)(?: for)? (.+?) (?:on|in|using) (?:the )?($apps)(?: app)?")
            .groups(t)?.let { return Command.SearchIn(SearchApp.fromName(it[2])!!, it[1]) }
        // "open youtube and search songs", "youtube search songs"
        Regex("(?:open )?($apps)(?: app)? (?:and |then )?(?:search|search for|find|play|look up|show)(?: for)? (.+)")
            .groups(t)?.let { return Command.SearchIn(SearchApp.fromName(it[1])!!, it[2]) }
        // "search youtube for songs"
        Regex("(?:search|find) (?:on |in )?($apps) (?:for )?(.+)")
            .groups(t)?.let { return Command.SearchIn(SearchApp.fromName(it[1])!!, it[2]) }
        // "play shape of you" -> YouTube
        if (!t.startsWith("play store")) {
            Regex("(?:play|watch) (.+)").groups(t)?.let { return Command.SearchIn(SearchApp.YOUTUBE, it[1]) }
        }
        return null
    }

    private fun settings(t: String): Command? {
        val g = Regex(
            "(?:open |turn (?:on|off) |switch (?:on|off) |enable |disable |show |go to )?(?:the )?" +
                "(wifi|wi fi|bluetooth|mobile data|data|internet|display|brightness|sound|location|gps|" +
                "airplane mode|aeroplane mode|flight mode|battery saver|apps|settings)" +
                "(?: settings)?(?: on| off)?",
        ).groups(t) ?: return null
        val panel = when (g[1]) {
            "wifi", "wi fi" -> SettingsPanel.WIFI
            "bluetooth" -> SettingsPanel.BLUETOOTH
            "mobile data", "data", "internet" -> SettingsPanel.MOBILE_DATA
            "display", "brightness" -> SettingsPanel.DISPLAY
            "sound" -> SettingsPanel.SOUND
            "location", "gps" -> SettingsPanel.LOCATION
            "airplane mode", "aeroplane mode", "flight mode" -> SettingsPanel.AIRPLANE
            "battery saver" -> SettingsPanel.BATTERY_SAVER
            "apps" -> SettingsPanel.APPS
            else -> SettingsPanel.GENERAL
        }
        return Command.OpenSettings(panel)
    }

    private fun openApp(t: String): Command? {
        val g = Regex("(?:open|launch|start|run|go to|show)(?: the)?(?: my)? (.+?)(?: app| application)?").groups(t) ?: return null
        return Command.OpenApp(g[1])
    }

    private fun click(t: String): Command? {
        val g = Regex("(?:click|tap|press|touch|select)(?: on)?(?: the)? (.+?)(?: button)?").groups(t) ?: return null
        return Command.Click(g[1])
    }

    private fun type(t: String): Command? {
        val g = Regex("(?:type|write|enter|input) (.+)").groups(t) ?: return null
        return Command.Type(g[1])
    }

    private fun scroll(t: String): Command? {
        val g = Regex("(?:scroll|swipe)(?: (up|down|left|right))?(?: .*)?").groups(t) ?: return null
        val direction = when (g[1]) {
            "up" -> ScrollDirection.UP
            "left" -> ScrollDirection.LEFT
            "right" -> ScrollDirection.RIGHT
            else -> ScrollDirection.DOWN
        }
        return Command.Scroll(direction)
    }

    private fun webSearch(t: String): Command? {
        Regex("(?:google|search|search for|look up|find)(?: for)? (.+)").groups(t)
            ?.let { return Command.SearchIn(SearchApp.GOOGLE, it[1]) }
        if (t.matches(Regex("(?:what|who|when|where|why|how|which|define|meaning of)\\b.+"))) {
            return Command.SearchIn(SearchApp.GOOGLE, t)
        }
        return null
    }

    private fun bareAppName(t: String) = if (SearchApp.fromName(t) != null || t == "camera") Command.OpenApp(t) else null

    /** "amma please now" -> "amma" */
    private fun cleanName(s: String) = s.trim()
        .replace(Regex("(?:\\s+(?:now|right now|for me|number|immediately|on phone|on mobile))+$"), "")
        .trim()
}
