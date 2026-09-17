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

/**
 * What a turn cost the model, as the provider itself reported it.
 *
 * Reported rather than estimated, deliberately. Counting tokens locally means
 * shipping a tokenizer that matches whichever model `LLM_MODEL` names today,
 * and being quietly wrong the moment it names a different one — a meter that
 * is confidently wrong is worse than one that admits it did not count.
 * `metered: false` is that admission, and `/govern/usage` renders it rather
 * than letting zero read as free.
 */
export type TokenUsage = { inputTokens: number; outputTokens: number; metered: boolean };

export const NO_TOKEN_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, metered: false };

export function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    metered: a.metered || b.metered,
  };
}

export type Reply = { text: string; reason: ReplyReason; usage: TokenUsage };

/** Thinking and reply share this budget on models that think. */
const MAX_TOKENS = 800;

/**
 * Reasoning controls, passed through to the provider when set.
 *
 * On a phone call this is a latency dial, not a quality one: a reasoning model
 * writes its private thinking before its first spoken word, and the caller
 * sits in silence for all of it. Measured against Groq, `none` took
 * time-to-first-spoken-token on qwen3.6-27b from ~320ms to ~130ms.
 *
 * Typed loosely because the accepted values are provider-specific — Groq takes
 * "none", the OpenAI SDK's own union does not — and this is a passthrough, not
 * something this module should have an opinion about.
 */
function reasoningOptions(): Record<string, unknown> {
  return env.LLM_REASONING_EFFORT ? { reasoning_effort: env.LLM_REASONING_EFFORT } : {};
}

/**
 * Strips `<think>` blocks out of model output.
 *
 * Not paranoia — a real failure observed on this stack. Some reasoning models
 * put their thinking in `content` rather than a separate field, and everything
 * in `content` is read aloud, so an unguarded call opens with the model saying
 * "Here's a thinking process: 1. Analyze User Input". Configuration is the
 * primary fix (see `LLM_REASONING_EFFORT`); this is the guard for when someone
 * points `LLM_MODEL` at a reasoning model and doesn't know to set it.
 *
 * Written as a state machine rather than a regex over the finished string
 * because it has to work mid-stream, where a tag can arrive split across two
 * deltas — `<thi` then `nk>`.
 */
export class ReasoningStripper {
  private buffer = "";
  private inside = false;

  /** Returns the part of `text` that is safe to say. */
  feed(text: string): string {
    this.buffer += text;
    let out = "";

    for (;;) {
      if (!this.inside) {
        const open = this.buffer.search(/<think/i);
        if (open === -1) {
          // Hold back anything that could still turn out to be an open tag.
          const keep = partialSuffixLength(this.buffer, "<think");
          out += this.buffer.slice(0, this.buffer.length - keep);
          this.buffer = this.buffer.slice(this.buffer.length - keep);
          return out;
        }
        out += this.buffer.slice(0, open);
        const close = this.buffer.indexOf(">", open);
        if (close === -1) {
          this.buffer = this.buffer.slice(open);
          return out;
        }
        this.inside = true;
        this.buffer = this.buffer.slice(close + 1);
      } else {
        const end = /<\/think(?:ing)?>/i.exec(this.buffer);
        if (!end) {
          const keep = partialSuffixLength(this.buffer, "</thinking>");
          this.buffer = this.buffer.slice(this.buffer.length - keep);
          return out;
        }
        this.inside = false;
        this.buffer = this.buffer.slice(end.index + end[0].length);
      }
    }
  }

  /** Whatever was held back, once the stream has ended. */
  flush(): string {
    if (this.inside) return "";
    const rest = this.buffer;
    this.buffer = "";
    return rest;
  }
}

/**
 * Removes a literal control marker from model output and remembers whether it
 * appeared.
 *
 * Same streaming problem as `ReasoningStripper`, same reason: a marker the
 * model writes at the very end of a reply arrives split across deltas, and a
 * single character of it escaping into `content` is a character the caller
 * hears read aloud.
 */
export class MarkerStripper {
  private buffer = "";
  private seen = false;

  constructor(private readonly marker: string) {}

  /** True once the marker has been found anywhere in the stream. */
  get triggered(): boolean {
    return this.seen;
  }

  /** Returns the part of `text` that is safe to say. */
  feed(text: string): string {
    this.buffer += text;
    let out = "";

    for (;;) {
      const at = this.buffer.toLowerCase().indexOf(this.marker.toLowerCase());
      if (at !== -1) {
        this.seen = true;
        out += this.buffer.slice(0, at);
        this.buffer = this.buffer.slice(at + this.marker.length);
        continue;
      }
      // Hold back a tail that could still complete into the marker.
      const keep = partialSuffixLength(this.buffer, this.marker);
      out += this.buffer.slice(0, this.buffer.length - keep);
      this.buffer = this.buffer.slice(this.buffer.length - keep);
      return out;
    }
  }

  /** Whatever was held back, once the stream has ended. */
  flush(): string {
    const rest = this.buffer;
    this.buffer = "";
    return rest;
  }
}

/** Longest suffix of `text` that is a prefix of `tag` — a tag arriving split. */
function partialSuffixLength(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let n = max; n > 0; n -= 1) {
    if (text.slice(text.length - n).toLowerCase() === tag.slice(0, n).toLowerCase()) return n;
  }
  return 0;
}

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

  const usage: TokenUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    metered: true,
  };

  if (response.stop_reason === "refusal") return { text: "", reason: "refusal", usage };

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();

  return {
    text,
    reason: response.stop_reason === "max_tokens" ? "truncated" : "ok",
    usage,
  };
}

async function replyViaOpenAiCompatible(system: string, turns: Turn[]): Promise<Reply> {
  openAiClient ??= new OpenAI({
    apiKey: env.LLM_API_KEY ?? "not-needed",
    baseURL: env.LLM_BASE_URL,
  });

  const completion = await openAiClient.chat.completions.create({
    model: env.LLM_MODEL,
    max_tokens: MAX_TOKENS,
    ...reasoningOptions(),
    messages: [
      { role: "system", content: system },
      ...turns.map((turn) => ({ role: turn.role, content: turn.text }) as const),
    ],
  });

  const usage = readOpenAiUsage(completion.usage);

  const choice = completion.choices[0];
  if (!choice) return { text: "", reason: "error", usage };
  if (choice.finish_reason === "content_filter") return { text: "", reason: "refusal", usage };

  const stripper = new ReasoningStripper();
  const text = (stripper.feed(choice.message.content ?? "") + stripper.flush()).trim();

  return {
    text,
    reason: choice.finish_reason === "length" ? "truncated" : "ok",
    usage,
  };
}

/**
 * Reads a usage block off an OpenAI-shaped response.
 *
 * Absent is the normal case for a provider that does not report it, not an
 * error — hence `metered: false` rather than a throw, or a zero that would be
 * indistinguishable from a call that cost nothing.
 */
function readOpenAiUsage(usage: OpenAI.CompletionUsage | undefined | null): TokenUsage {
  if (!usage) return NO_TOKEN_USAGE;
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    metered: true,
  };
}

/** Throws on transport/API failure; the caller decides what the phone hears. */
export async function generateReply(system: string, turns: Turn[]): Promise<Reply> {
  return activeProvider() === "openai"
    ? replyViaOpenAiCompatible(system, turns)
    : replyViaAnthropic(system, turns);
}

/**
 * One piece of a reply as it is being written. `delta` carries new text;
 * exactly one `end` arrives last and explains why the model stopped.
 */
export type ReplyChunk =
  | { kind: "delta"; text: string }
  /**
   * `usage` is optional because a stream that ended without a usage report is
   * a real thing — a provider that does not send one, or `USAGE_METER_TOKENS`
   * turned off — and because a meter must never be able to drop a live call.
   * Absent reads as unmetered, which is a state the rest of the system already
   * knows how to say out loud.
   */
  | { kind: "end"; reason: ReplyReason; usage?: TokenUsage };

/** A function the employee may call mid-turn. `parameters` is JSON Schema. */
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * Runs a tool the model asked for and returns what the model should be told
 * happened. Never throws: a failed booking is something the employee has to
 * explain to the caller, not a dropped call.
 */
export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<string>;

export type StreamOptions = {
  signal?: AbortSignal;
  tools?: { definitions: ToolDefinition[]; run: ToolRunner };
};

/**
 * How many times one turn may call tools before we stop looping. Two is
 * generous for a phone call — a caller asking to book one table needs one —
 * and it bounds a model that would otherwise call the same tool forever while
 * somebody holds a handset to their ear.
 */
const MAX_TOOL_ROUNDS = 2;

type ToolCallAccumulator = { id: string; name: string; args: string };

/**
 * The streaming form of `generateReply`, for the realtime voice path.
 *
 * On a phone call the whole reply is worth nothing until the first word is
 * audible, so the caller of this function starts speaking off the first delta
 * rather than waiting for a finished paragraph.
 *
 * `signal` is the barge-in lever: aborting it stops the HTTP request to the
 * model mid-body, and the generator returns without a final `end` chunk —
 * silence is the correct output for a turn nobody is listening to any more.
 */
export async function* streamReply(
  system: string,
  turns: Turn[],
  options: StreamOptions = {},
): AsyncGenerator<ReplyChunk> {
  const { signal, tools } = options;

  if (activeProvider() !== "openai") {
    // The Anthropic path stays request/response. It exists for the `<Gather>`
    // fallback, and a second streaming integration for a provider the realtime
    // line does not use would be code with no caller.
    const reply = await replyViaAnthropic(system, turns);
    if (signal?.aborted) return;
    if (reply.text.length > 0) yield { kind: "delta", text: reply.text };
    yield { kind: "end", reason: reply.reason, usage: reply.usage };
    return;
  }

  openAiClient ??= new OpenAI({
    apiKey: env.LLM_API_KEY ?? "not-needed",
    baseURL: env.LLM_BASE_URL,
  });

  let reason: ReplyReason = "ok";
  // Accumulated across tool rounds: one caller utterance can cost two model
  // calls, and billing the first while dropping the second would under-report
  // exactly the turns that did the most work.
  let usage: TokenUsage = NO_TOKEN_USAGE;
  const stripper = new ReasoningStripper();

  /**
   * Provider-native message history for *this turn only*.
   *
   * A tool round-trip needs the model's own `tool_calls` message echoed back
   * verbatim alongside the result, which is provider-shaped. Keeping that
   * inside one `streamReply` call is what lets `Turn[]` stay plain text: the
   * conversation the session remembers is still just what was said, and the
   * mechanics of how the employee looked something up do not leak into it.
   */
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...turns.map((turn) => ({ role: turn.role, content: turn.text }) as const),
  ];

  for (let round = 0; ; round += 1) {
    const pending = new Map<number, ToolCallAccumulator>();
    let finish: string | null = null;

    try {
      const stream = await openAiClient.chat.completions.create(
        {
          model: env.LLM_MODEL,
          max_tokens: MAX_TOKENS,
          stream: true,
          // Asks for a final usage-only chunk after the content. Part of the
          // OpenAI streaming spec and honoured by Groq, but an endpoint that
          // rejects unknown parameters would fail the whole call rather than
          // ignore this, which is why it is a flag rather than unconditional.
          ...(env.USAGE_METER_TOKENS ? { stream_options: { include_usage: true } } : {}),
          ...reasoningOptions(),
          // Offered only while rounds remain, so the last pass cannot ask for
          // another tool it will never get to run.
          ...(tools && round < MAX_TOOL_ROUNDS
            ? {
                tools: tools.definitions.map((tool) => ({
                  type: "function" as const,
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  },
                })),
              }
            : {}),
          messages,
        },
        signal ? { signal } : {},
      );

      for await (const chunk of stream) {
        if (signal?.aborted) return;

        // The usage chunk arrives last and carries an *empty* `choices` array,
        // so it has to be read before the guard below skips it.
        if (chunk.usage) usage = addTokenUsage(usage, readOpenAiUsage(chunk.usage));

        const choice = chunk.choices[0];
        if (!choice) continue;

        // `delta.reasoning`, where providers expose it separately, is ignored
        // entirely — it is not speech. The stripper handles the providers that
        // put thinking in `content` instead.
        const raw = choice.delta?.content;
        if (typeof raw === "string" && raw.length > 0) {
          const text = stripper.feed(raw);
          if (text.length > 0) yield { kind: "delta", text };
        }

        // Tool calls stream in fragments: the name arrives once, the JSON
        // arguments accumulate across many deltas, and `index` is what ties
        // the pieces together when the model calls more than one.
        for (const call of choice.delta?.tool_calls ?? []) {
          const slot = pending.get(call.index) ?? { id: "", name: "", args: "" };
          if (call.id) slot.id = call.id;
          if (call.function?.name) slot.name = call.function.name;
          if (call.function?.arguments) slot.args += call.function.arguments;
          pending.set(call.index, slot);
        }

        if (choice.finish_reason) finish = choice.finish_reason;
        if (choice.finish_reason === "content_filter") reason = "refusal";
        else if (choice.finish_reason === "length") reason = "truncated";
      }
    } catch (error) {
      // An abort is the expected end of an interrupted turn, not a failure.
      if (signal?.aborted) return;
      throw error;
    }

    if (finish !== "tool_calls" || pending.size === 0 || !tools) break;

    const calls = [...pending.entries()].sort(([a], [b]) => a - b).map(([, c]) => c);

    messages.push({
      role: "assistant",
      content: null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: c.args },
      })),
    });

    for (const call of calls) {
      if (signal?.aborted) return;
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: await runTool(tools.run, call),
      });
    }
    // Round again so the model can tell the caller what happened.
  }

  const tail = stripper.flush();
  if (tail.length > 0) yield { kind: "delta", text: tail };

  yield { kind: "end", reason, usage };
}

/**
 * Never throws. A tool that failed is something the employee has to explain
 * out loud, so the failure is handed back to the model as text rather than
 * thrown up into the call.
 */
async function runTool(run: ToolRunner, call: ToolCallAccumulator): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = call.args.trim().length > 0 ? (JSON.parse(call.args) as Record<string, unknown>) : {};
  } catch {
    return "That did not work: the details were malformed. Ask the caller to repeat them.";
  }

  try {
    return await run(call.name, args);
  } catch (error) {
    console.error("[VOICE] tool failed:", error instanceof Error ? error.message : error);
    return "That did not work due to a system error. Apologise and offer to take the details for a colleague.";
  }
}
