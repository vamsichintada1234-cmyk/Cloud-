package com.myphone.assistant.command

object PhoneNumbers {

    /** Used when a saved number has no country code. 91 = India. */
    const val DEFAULT_COUNTRY_CODE = "91"

    /** True for spoken targets like "9876543210" or "+91 98765 43210". */
    fun looksLikeNumber(text: String): Boolean {
        val compact = text.replace(Regex("[\\s()-]"), "")
        return compact.length >= 3 && compact.matches(Regex("\\+?\\d+"))
    }

    fun compact(text: String): String = text.replace(Regex("[^+\\d]"), "")

    /** WhatsApp links need the number in international form without "+". */
    fun toInternational(number: String, countryCode: String = DEFAULT_COUNTRY_CODE): String {
        val digits = number.filter { it.isDigit() }
        return when {
            number.trim().startsWith("+") -> digits
            digits.startsWith("00") -> digits.drop(2)
            digits.length == 11 && digits.startsWith("0") -> countryCode + digits.drop(1)
            digits.length == 10 -> countryCode + digits
            else -> digits
        }
    }
}
