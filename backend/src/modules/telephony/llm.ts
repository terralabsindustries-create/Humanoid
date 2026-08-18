import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "@/config/env.js";

/**
 * The one place that talks to a language model.
 *
 * Two backends: Anthropic's own API, and anything speaking the OpenAI chat
 * format — which is Groq, Gemini's compatibility endpoint, Ollama, OpenRouter,
 * Together and Cerebras. That second path is deliberately not six integrations;
 * they differ only by base URL, key and model name, so they differ only by
 * configuration here too.
 *
 * History is kept as plain text rather than provider-native content blocks so
 * one conversation can outlive a provider switch. The cost is that Claude's
 * thinking blocks aren't echoed back between turns — negligible across the
 * handful of short turns a phone call runs to, and worth it to keep the store
 * provider-agnostic.
 */

export type Turn = { role: "user" | "assistant"; text: string };
export type ReplyReason = "ok" | "refusal" | "truncated" | "error";
export type Reply = { text: string; reason: ReplyReason };

/** Thinking and reply share this budget on models that think. */
const MAX_TOKENS = 800;

let anthropicClient: Anthropic | null = null;
let openAiClient: OpenAI | null = null;

export type ProviderName = "anthropic" | "openai";

export function activeProvider(): ProviderName | null {
  if (env.LLM_PROVIDER === "openai") return env.LLM_API_KEY ? "openai" : null;
  return env.ANTHROPIC_API_KEY ? "anthropic" : null;
}

/** Model actually in use — printed at boot so the log never lies about it. */
export function activeModel(): string {
  return activeProvider() === "openai" ? env.LLM_MODEL : env.ANTHROPIC_MODEL;
}

async function replyViaAnthropic(system: string, turns: Turn[]): Promise<Reply> {
  anthropicClient ??= new Anthropic();

  const response = await anthropicClient.beta.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    // Thinking stays on: disabling it on Opus 5 can leak <thinking> tags into
    // the reply, which a phone line would read aloud. Low effort keeps it
    // shallow enough for a call's latency budget.
    output_config: { effort: "low" },
    // Turns a safety decline into an answer rather than dead air.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: turns.map((turn) => ({ role: turn.role, content: turn.text })),
  });

  if (response.stop_reason === "refusal") return { text: "", reason: "refusal" };

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();

  return { text, reason: response.stop_reason === "max_tokens" ? "truncated" : "ok" };
}

async function replyViaOpenAiCompatible(system: string, turns: Turn[]): Promise<Reply> {
  openAiClient ??= new OpenAI({
    apiKey: env.LLM_API_KEY ?? "not-needed",
    baseURL: env.LLM_BASE_URL,
  });

  const completion = await openAiClient.chat.completions.create({
    model: env.LLM_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: system },
      ...turns.map((turn) => ({ role: turn.role, content: turn.text }) as const),
    ],
  });

  const choice = completion.choices[0];
  if (!choice) return { text: "", reason: "error" };
  if (choice.finish_reason === "content_filter") return { text: "", reason: "refusal" };

  return {
    text: (choice.message.content ?? "").trim(),
    reason: choice.finish_reason === "length" ? "truncated" : "ok",
  };
}

/** Throws on transport/API failure; the caller decides what the phone hears. */
export async function generateReply(system: string, turns: Turn[]): Promise<Reply> {
  return activeProvider() === "openai"
    ? replyViaOpenAiCompatible(system, turns)
    : replyViaAnthropic(system, turns);
}
