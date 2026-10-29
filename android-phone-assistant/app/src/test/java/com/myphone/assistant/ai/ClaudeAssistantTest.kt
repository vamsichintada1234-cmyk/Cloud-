package com.myphone.assistant.ai

import com.anthropic.core.jsonMapper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Checks the request we would send, without calling the API. */
class ClaudeAssistantTest {

    @Test
    fun requestHasModelToolsAndFallbacks() {
        val params = ClaudeAssistant("sk-ant-test").buildParams("ఈరోజు వాతావరణం ఎలా ఉంది?")
        val body = jsonMapper().readTree(jsonMapper().writeValueAsString(params._body()))

        assertEquals("claude-opus-5-5", body["model"].asText())
        assertEquals("low", body["output_config"]["effort"].asText())
        assertEquals("default", body["fallbacks"].asText())
        assertTrue(params.betas().get().any { it.toString() == "server-side-fallback-2026-07-01" })

        val tools = body["tools"].map { it["name"].asText() }
        assertEquals(listOf("run_phone_command", "web_search"), tools)
        val phoneTool = body["tools"][0]
        assertTrue(phoneTool["strict"].asBoolean())
        assertEquals(false, phoneTool["input_schema"]["additionalProperties"].asBoolean())
        assertEquals("command", phoneTool["input_schema"]["required"][0].asText())

        assertEquals("user", body["messages"][0]["role"].asText())
        assertTrue(body["system"].asText().contains("run_phone_command"))
    }

    @Test
    fun speechCleanup() {
        assertEquals(
            "It is sunny, see Weather.",
            ClaudeAssistant.forSpeech("It is **sunny**, see [Weather](https://x.com).\n"),
        )
    }
}
