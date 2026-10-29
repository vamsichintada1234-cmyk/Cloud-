package com.myphone.assistant.command

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FuzzyMatcherTest {

    private val apps = listOf("YouTube", "YouTube Music", "WhatsApp", "WhatsApp Business", "Instagram", "Google Pay", "Gmail", "Phone")

    private fun best(q: String) = FuzzyMatcher.best(q, apps) { it }

    @Test
    fun matchesSpokenNames() {
        assertEquals("YouTube", best("youtube"))
        assertEquals("YouTube", best("you tube"))
        assertEquals("YouTube Music", best("youtube music"))
        assertEquals("WhatsApp", best("whats app"))
        assertEquals("Instagram", best("insta"))
        assertEquals("Google Pay", best("gpay"))
        assertEquals("Gmail", best("g mail"))
        assertEquals("Instagram", best("instagrm"))
        assertNull(best("calculator"))
    }

    @Test
    fun matchesContacts() {
        val contacts = listOf("Amma", "Nanna", "Ravi Kumar", "Ravi Teja Office")
        assertEquals("Amma", FuzzyMatcher.best("amma", contacts) { it })
        assertEquals("Ravi Kumar", FuzzyMatcher.best("ravi", contacts) { it })
        assertEquals("Ravi Teja Office", FuzzyMatcher.best("ravi teja", contacts) { it })
    }
}
