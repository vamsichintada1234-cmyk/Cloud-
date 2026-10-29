package com.myphone.assistant.command

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneNumbersTest {

    @Test
    fun detectsNumbers() {
        assertTrue(PhoneNumbers.looksLikeNumber("98765 43210"))
        assertTrue(PhoneNumbers.looksLikeNumber("+91 98765-43210"))
        assertFalse(PhoneNumbers.looksLikeNumber("amma"))
    }

    @Test
    fun internationalForm() {
        assertEquals("919876543210", PhoneNumbers.toInternational("98765 43210"))
        assertEquals("919876543210", PhoneNumbers.toInternational("098765 43210"))
        assertEquals("15551234567", PhoneNumbers.toInternational("+1 555 123 4567"))
        assertEquals("447700900123", PhoneNumbers.toInternational("0044 7700 900123"))
    }
}
