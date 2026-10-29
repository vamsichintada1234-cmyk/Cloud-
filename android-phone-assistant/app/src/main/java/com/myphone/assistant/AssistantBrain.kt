package com.myphone.assistant

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.PermissionDeniedException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.myphone.assistant.ai.ClaudeAssistant
import com.myphone.assistant.command.Command
import com.myphone.assistant.command.CommandParser
import com.myphone.assistant.command.SearchApp
import com.myphone.assistant.system.CommandExecutor
import java.util.concurrent.Executors

/**
 * Picks the best of the recognizer's guesses and runs it. Known commands run instantly
 * offline; anything else goes to Claude when an API key is set. Replies arrive on the main thread.
 */
class AssistantBrain(context: Context) {

    data class Reply(val heard: String, val command: Command, val message: String)

    private val app = context.applicationContext
    private val executor = CommandExecutor(app)
    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    private var claude: ClaudeAssistant? = null
    private var claudeKey: String? = null

    fun handle(alternatives: List<String>, onReply: (Reply) -> Unit) {
        val parsed = alternatives.filter { it.isNotBlank() }.map { it to CommandParser.parse(it) }
        val (heard, command) = parsed.firstOrNull { it.second !is Command.Unknown }
            ?: parsed.firstOrNull()
            ?: ("" to Command.Unknown(""))
        ConversationLog.add(ConversationLog.YOU, heard)

        val ai = claudeFor(Prefs.claudeApiKey(app))
        val needsAi = command is Command.Unknown || command is Command.Question
        if (ai == null || !needsAi || heard.isBlank()) {
            finish(Reply(heard, command, executor.execute(command)), onReply)
            return
        }

        worker.execute {
            val outcome = try {
                ai.ask(heard)
            } catch (e: Exception) {
                main.post { finish(Reply(heard, command, aiFailure(e) + " " + executor.execute(command)), onReply) }
                return@execute
            }
            main.post {
                val reply = if (outcome.command != null) {
                    // Never loop back to Claude: an unparseable suggestion becomes a web search.
                    val suggested = CommandParser.parse(outcome.command).let {
                        if (it is Command.Unknown || it is Command.Question) Command.SearchIn(SearchApp.GOOGLE, outcome.command) else it
                    }
                    Reply(heard, suggested, executor.execute(suggested))
                } else {
                    Reply(heard, command, outcome.speech)
                }
                finish(reply, onReply)
            }
        }
    }

    private fun finish(reply: Reply, onReply: (Reply) -> Unit) {
        ConversationLog.add(ConversationLog.ASSISTANT, reply.message)
        onReply(reply)
    }

    private fun claudeFor(key: String?): ClaudeAssistant? {
        if (key.isNullOrBlank()) return null
        if (key != claudeKey) {
            claude = ClaudeAssistant(key)
            claudeKey = key
        }
        return claude
    }

    private fun aiFailure(e: Exception) = when (e) {
        is UnauthorizedException, is PermissionDeniedException -> "Your Claude API key isn't working."
        is RateLimitException -> "Claude is busy right now."
        is AnthropicServiceException -> "Claude had a problem."
        is AnthropicIoException -> "I couldn't reach Claude. Check the internet."
        else -> "I couldn't reach Claude."
    }
}
