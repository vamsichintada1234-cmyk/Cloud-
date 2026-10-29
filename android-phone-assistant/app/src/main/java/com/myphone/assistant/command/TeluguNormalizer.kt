package com.myphone.assistant.command

import java.util.Locale

/**
 * Turns what the speech recognizer heard into plain English command text.
 *
 * Handles Telugu script ("యూట్యూబ్ ఓపెన్ చేయి"), Tenglish ("amma ki call cheyi") and
 * Telugu word order, where the verb comes last ("youtube open" -> "open youtube").
 */
object TeluguNormalizer {

    private const val HELPER = "cheyi"

    private val teluguWords = mapOf(
        "హలో" to "hello", "హాయ్" to "hi", "హే" to "hey", "ఓకే" to "ok", "మై" to "my",
        "ఫోన్" to "phone", "కాల్" to "call", "ఓపెన్" to "open", "తెరువు" to "open", "తెరవు" to "open",
        "యూట్యూబ్" to "youtube", "గూగుల్" to "google", "వాట్సాప్" to "whatsapp", "మ్యాప్స్" to "maps",
        "సెర్చ్" to "search", "వెతుకు" to "search", "వెతకు" to "search", "ప్లే" to "play",
        "కెమెరా" to "camera", "ఫోటో" to "photo", "తీయి" to "take", "సెట్టింగ్స్" to "settings",
        "వైఫై" to "wifi", "బ్లూటూత్" to "bluetooth", "టార్చ్" to "torch", "ఆన్" to "on", "ఆఫ్" to "off",
        "ఆపు" to "stop", "అలారం" to "alarm", "టైం" to "time", "టైమ్" to "time", "బ్యాటరీ" to "battery",
        "వాల్యూమ్" to "volume", "పెంచు" to "up", "తగ్గించు" to "down", "మెసేజ్" to "message",
        "పంపు" to "send", "వెనక్కి" to "back", "హోమ్" to "home", "స్క్రోల్" to "scroll",
        "కిందకి" to "down", "పైకి" to "up", "లో" to "on",
        "చేయి" to HELPER, "చెయ్యి" to HELPER, "చేయ్" to HELPER, "చెయ్" to HELPER,
        "చేయండి" to HELPER, "చెయ్యండి" to HELPER, "చేయు" to HELPER,
    )

    /** Tenglish helper verbs ("open cheyi") and fillers that carry no meaning for us. */
    private val helperWords = setOf(
        HELPER, "cheyyi", "chey", "chei", "cheyu", "cheyy", "cheyandi", "cheyyandi", "karo", "please", "plz", "pls",
    )

    /** Telugu/Hindi postpositions: "amma ki" = "to amma". */
    private val dropWords = setOf("ki", "ku", "ni", "ko", "కి", "కు", "ని")

    private val teluguSuffixes = listOf("లో" to "on", "కి" to null, "కు" to null)

    private val verbs = setOf("open", "call", "search", "play", "launch", "start", "dial", "navigate", "stop")

    /** Lower-cases, strips punctuation and maps Telugu/Tenglish words. Keeps word order. */
    fun basic(raw: String): String {
        var text = raw.lowercase(Locale.ROOT)
            .replace(Regex("\\b([ap])\\.\\s?m\\.?"), "$1m")
            .replace("'", "").replace("’", "")
            .replace(Regex("[^\\p{L}\\p{M}\\p{N}:+\\s]"), " ")

        val words = text.split(Regex("\\s+")).filter { it.isNotEmpty() }.flatMap(::mapWord)
        text = words.joinToString(" ")
            .replace(Regex("\\b(?:phone|call) $HELPER\\b"), "call")
        return text.split(" ")
            .filter { it.isNotEmpty() && it !in helperWords && it !in dropWords }
            .joinToString(" ")
    }

    /** Full normalization: [basic] plus moving a trailing verb to the front. */
    fun normalize(raw: String): String = reorder(basic(raw))

    fun reorder(text: String): String {
        // "youtube on songs search" (యూట్యూబ్‌లో పాటలు సెర్చ్) -> "search songs on youtube"
        Regex("^(.+?) on (.+) (search|play|find)$").matchEntire(text)?.let { m ->
            val (app, query, verb) = m.destructured
            return "$verb $query on $app"
        }
        val tokens = text.split(" ")
        if (tokens.size > 1 && tokens.last() in verbs && tokens.first() !in verbs) {
            return (listOf(tokens.last()) + tokens.dropLast(1)).joinToString(" ")
        }
        return text
    }

    private fun mapWord(word: String): List<String> {
        teluguWords[word]?.let { return listOf(it) }
        if (word in helperWords) return listOf(HELPER)
        for ((suffix, replacement) in teluguSuffixes) {
            if (word.length > suffix.length + 1 && word.endsWith(suffix)) {
                val stem = word.removeSuffix(suffix)
                return listOfNotNull(teluguWords[stem] ?: stem, replacement)
            }
        }
        if (word == "lo") return listOf("on")
        return listOf(word)
    }
}
