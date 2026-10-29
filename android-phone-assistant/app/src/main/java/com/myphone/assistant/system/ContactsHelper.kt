package com.myphone.assistant.system

import android.content.Context
import android.provider.ContactsContract.CommonDataKinds.Phone
import com.myphone.assistant.command.FuzzyMatcher

/** Looks up a phone number for a spoken contact name ("amma", "ravi"). */
class ContactsHelper(private val context: Context) {

    data class Contact(val name: String, val number: String)

    fun find(name: String): Contact? {
        val contacts = mutableListOf<Contact>()
        context.contentResolver.query(
            Phone.CONTENT_URI,
            arrayOf(Phone.DISPLAY_NAME, Phone.NUMBER),
            null,
            null,
            "${Phone.IS_SUPER_PRIMARY} DESC",
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                val displayName = cursor.getString(0) ?: continue
                val number = cursor.getString(1) ?: continue
                contacts.add(Contact(displayName, number))
            }
        }
        return FuzzyMatcher.best(name, contacts.distinctBy { it.name }) { it.name }
    }
}
