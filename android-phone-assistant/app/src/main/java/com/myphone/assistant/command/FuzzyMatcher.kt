package com.myphone.assistant.command

import java.util.Locale
import kotlin.math.max

/** Matches a spoken name ("whats app", "insta") against app labels or contact names. */
object FuzzyMatcher {

    private val aliases = mapOf(
        "fb" to "facebook", "insta" to "instagram", "yt" to "youtube", "gpay" to "google pay",
        "whats app" to "whatsapp", "you tube" to "youtube", "phone pe" to "phonepe",
    )

    fun score(query: String, candidate: String): Double {
        val q = clean(query).let { aliases[it] ?: it }
        val c = clean(candidate)
        if (q.isEmpty() || c.isEmpty()) return 0.0
        if (q == c) return 1.0
        val qCompact = q.replace(" ", "")
        val cCompact = c.replace(" ", "")
        if (qCompact == cCompact) return 0.95
        if (q.length >= 2 && c.startsWith(q)) return 0.9
        if (c.length >= 3 && q.startsWith(c)) return 0.88
        if (c.split(" ").any { it == q }) return 0.85
        if (q.length >= 3 && c.contains(q)) return 0.8
        val distance = levenshtein(qCompact, cCompact)
        return (1.0 - distance.toDouble() / max(qCompact.length, cCompact.length)) * 0.78
    }

    fun <T> best(query: String, items: Collection<T>, threshold: Double = 0.6, label: (T) -> String): T? =
        items.map { it to score(query, label(it)) }
            .filter { it.second >= threshold }
            .maxByOrNull { it.second }
            ?.first

    private fun clean(s: String) = s.lowercase(Locale.ROOT)
        .replace(Regex("[^\\p{L}\\p{M}\\p{N} ]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()

    private fun levenshtein(a: String, b: String): Int {
        var prev = IntArray(b.length + 1) { it }
        for (i in 1..a.length) {
            val cur = IntArray(b.length + 1)
            cur[0] = i
            for (j in 1..b.length) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                cur[j] = minOf(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
            }
            prev = cur
        }
        return prev[b.length]
    }
}
