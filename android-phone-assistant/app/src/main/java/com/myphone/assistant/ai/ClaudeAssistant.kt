package com.myphone.assistant.ai

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.models.beta.messages.BetaOutputConfig
import com.anthropic.models.beta.messages.BetaStopReason
import com.anthropic.models.beta.messages.BetaTool
import com.anthropic.models.beta.messages.BetaWebSearchTool20260209
import com.anthropic.models.beta.messages.MessageCreateParams
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Claude as the assistant's brain for anything the offline parser can't handle:
 * free-form Telugu/Tenglish requests, general questions and current information.
 *
 * Claude either answers in words, or calls `run_phone_command` with a plain English
 * command that the normal [com.myphone.assistant.command.CommandParser] then runs.
 * Blocking network call: never call [ask] on the main thread.
 */
class ClaudeAssistant(apiKey: String) {

    /** Exactly one of [command] (run it on the phone) or [speech] (say it) is meaningful. */
    data class Answer(val command: String?, val speech: String)

    private val client: AnthropicClient = AnthropicOkHttpClient.builder().apiKey(apiKey).build()

    /** Recent turns as plain text, so follow-ups like "and tomorrow?" make sense. */
    private val history = ArrayDeque<Pair<String, String>>()

    private val phoneTool = BetaTool.builder()
        .name(TOOL_NAME)
        .description(TOOL_DESCRIPTION)
        .inputSchema(
            BetaTool.InputSchema.builder()
                .properties(
                    BetaTool.InputSchema.Properties.builder()
                        .putAdditionalProperty(
                            "command",
                            JsonValue.from(
                                mapOf(
                                    "type" to "string",
                                    "description" to "One phone command in the English form described above.",
                                ),
                            ),
                        )
                        .build(),
                )
                .addRequired("command")
                .putAdditionalProperty("additionalProperties", JsonValue.from(false))
                .build(),
        )
        .strict(true)
        .build()

    fun ask(userText: String): Answer {
        val response = client.beta().messages().create(buildParams(userText))

        if (response.stopReason().orElse(null) == BetaStopReason.REFUSAL) {
            return remember(userText, Answer(null, "Sorry, I can't help with that one."))
        }

        val command = response.content()
            .mapNotNull { it.toolUse().orElse(null) }
            .firstOrNull { it.name() == TOOL_NAME }
            ?.let { (it.input(Map::class.java)?.get("command") as? String)?.trim() }
            ?.takeIf { it.isNotEmpty() }
        if (command != null) return remember(userText, Answer(command, ""))

        val text = response.content()
            .mapNotNull { it.text().orElse(null)?.text() }
            .joinToString(" ")
            .let(::forSpeech)
        return remember(userText, Answer(null, text.ifEmpty { "Sorry, I don't have an answer for that." }))
    }

    internal fun buildParams(userText: String): MessageCreateParams =
        MessageCreateParams.builder()
            .model(MODEL)
            .maxTokens(16000L)
            .system(systemPrompt())
            // Voice replies must be quick; everyday chat doesn't need deep thinking.
            .outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.LOW).build())
            .addTool(phoneTool)
            .addTool(BetaWebSearchTool20260209.builder().maxUses(3L).build())
            // If a safety classifier declines, let the API retry on a suitable fallback model.
            .addBeta("server-side-fallback-2026-07-01")
            .fallbacksDefault()
            .apply {
                history.forEach { (user, assistant) ->
                    addUserMessage(user)
                    addAssistantMessage(assistant)
                }
            }
            .addUserMessage(userText)
            .build()

    private fun remember(user: String, answer: Answer): Answer {
        history.addLast(user to (answer.command?.let { "[ran phone command: $it]" } ?: answer.speech))
        while (history.size > MAX_TURNS) history.removeFirst()
        return answer
    }

    private fun systemPrompt(): String {
        val now = SimpleDateFormat("EEEE d MMMM yyyy, h:mm a", Locale.ENGLISH).format(Date())
        return """
            You are "My Phone", a voice assistant running on the user's Android phone, usually in India.
            The user speaks English, Telugu, or a Telugu-English mix (Tenglish). Speech recognition can garble words, so work out what they most likely meant.

            When the user wants something done on the phone, call $TOOL_NAME with a single command, translating from Telugu or Tenglish if needed. If they ask for several things, run the first one and say what you did.
            Otherwise answer the question yourself. Use web search for anything current, such as news, weather, prices, cricket scores or opening hours.

            Your answer is read aloud by text-to-speech: use one to three short sentences of plain spoken text, with no markdown, lists, links or emoji.
            Reply in the user's language: Telugu script if they spoke Telugu, otherwise English.

            Current date and time on the phone: $now.
        """.trimIndent()
    }

    companion object {
        private const val MODEL = "claude-opus-5-5"
        private const val TOOL_NAME = "run_phone_command"
        private const val MAX_TURNS = 6

        private val TOOL_DESCRIPTION = """
            Runs one action on the user's phone. The command must use one of these English forms
            (keep contact names, app names and message text as the user said them):
            call <contact name or number> | open <app name> | search <query> on youtube|google|maps|play store|spotify|amazon|flipkart |
            play <song or video> | navigate to <place> | send whatsapp to <contact> saying <message> | send sms to <contact> saying <message> |
            set alarm for <h:mm am/pm> | set timer for <n> minutes | turn on flashlight | turn off flashlight | volume up|down|mute|max |
            open wifi|bluetooth|mobile data|display|sound|location settings | take a photo | take a screenshot | go back | go home |
            show recent apps | open notifications | lock the phone | scroll up|down | click <text shown on screen> | type <text>
        """.trimIndent()

        /** Strip anything TTS would read out literally. */
        fun forSpeech(text: String) = text
            .replace(Regex("\\[(.*?)]\\(.*?\\)"), "$1")
            .replace(Regex("https?://\\S+"), "")
            .replace(Regex("[*_#`>|]"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
    }
}
