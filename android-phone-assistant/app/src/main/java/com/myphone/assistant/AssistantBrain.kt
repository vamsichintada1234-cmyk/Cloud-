package com.myphone.assistant

import android.content.Context
import com.myphone.assistant.command.Command
import com.myphone.assistant.command.CommandParser
import com.myphone.assistant.system.CommandExecutor

/** Picks the best of the recognizer's guesses, runs it and logs the conversation. */
class AssistantBrain(context: Context) {

    data class Reply(val heard: String, val command: Command, val message: String)

    private val executor = CommandExecutor(context.applicationContext)

    fun handle(alternatives: List<String>): Reply {
        val parsed = alternatives.filter { it.isNotBlank() }.map { it to CommandParser.parse(it) }
        val (heard, command) = parsed.firstOrNull { it.second !is Command.Unknown }
            ?: parsed.firstOrNull()
            ?: ("" to Command.Unknown(""))
        ConversationLog.add(ConversationLog.YOU, heard)
        val message = executor.execute(command)
        ConversationLog.add(ConversationLog.ASSISTANT, message)
        return Reply(heard, command, message)
    }
}
