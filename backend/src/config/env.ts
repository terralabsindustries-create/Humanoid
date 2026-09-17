import { z } from "zod";

/**
 * Environment contract. Fails fast and loudly on boot rather than letting a
 * missing secret surface later as a confusing runtime error mid-request.
 */
/**
 * Treats a blank value the same as an absent one, so a `.env` copied from
 * `.env.example` with keys left empty boots instead of failing validation.
 */
const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  });

/**
 * `z.coerce.boolean()` is a trap for env flags: `Boolean("false")` is `true`,
 * so an explicit opt-out would silently read as an opt-in. This reads the
 * words people actually write in a `.env`.
 */
const booleanFlag = (fallback: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") return value;
      const normalized = value?.trim().toLowerCase();
      if (normalized === undefined || normalized.length === 0) return fallback;
      return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 characters"),
  // Comma-separated. A dev server that finds its port taken silently moves to
  // the next one (3000 → 3001), and a single hardcoded origin turns that into a
  // CORS failure the browser reports as a generic network error.
  CORS_ORIGIN: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  EXPOSE_OTP_IN_RESPONSE: z.coerce.boolean().default(false),

  // Telephony. All optional — the backend must stay bootable for anyone not
  // running the Twilio speech test.
  //
  // The public https origin Twilio can reach (an ngrok URL in development).
  // Twilio signs the exact URL it was configured to call, so this must match
  // the Twilio Console entry byte for byte or signature checks will fail.
  PUBLIC_BASE_URL: optionalString
    .refine((value) => value === undefined || /^https?:\/\//.test(value), {
      message: "PUBLIC_BASE_URL must start with http:// or https://",
    })
    .transform((value) => value?.replace(/\/+$/, "")),
  // Webhook signatures are HMAC'd with the account Auth Token, NOT an API key
  // secret — API keys authenticate outbound REST calls, which this does not make.
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_PHONE_NUMBER: optionalString,
  // "en-IN" measurably beats "en-US" for Indian-English callers.
  TWILIO_SPEECH_LANGUAGE: z.string().default("en-US"),

  // The AI employee that answers calls. Optional — without a key the phone
  // line degrades to the transcription-only probe rather than failing.
  //
  // "openai" here means the OpenAI *wire format*, not OpenAI the company: it
  // covers Groq, Gemini's compatibility endpoint, Ollama, OpenRouter, Together
  // and Cerebras, which differ only by base URL, key and model name.
  LLM_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),

  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default("claude-opus-5"),

  LLM_BASE_URL: z.string().default("https://api.groq.com/openai/v1"),
  LLM_API_KEY: optionalString,
  LLM_MODEL: z.string().default("openai/gpt-oss-20b"),
  // Passed through to the provider when set. On a phone call this is a latency
  // dial: a reasoning model writes its thinking before its first spoken word
  // and the caller waits through all of it. Groq accepts "none", which is the
  // one that matters here; leave blank for models that do not reason.
  LLM_REASONING_EFFORT: optionalString,
  // Stopgap until a phone-number → workspace table exists: pins which
  // onboarded workspace's AI employee answers the test number. Unset means
  // "the most recently configured one".
  AI_EMPLOYEE_WORKSPACE_ID: optionalString,

  // Realtime voice — Twilio ConversationRelay.
  //
  // Twilio holds one WebSocket open for the whole call and owns both speech
  // recognition and text-to-speech; this backend exchanges JSON *text* with
  // it. That is why there is no ElevenLabs key here — the ElevenLabs
  // TTS is billed through Twilio, and audio never transits this
  // process. Off flips the phone line back to the `<Gather>` loop.
  VOICE_RELAY_ENABLED: booleanFlag(true),
  // Passed straight through to <ConversationRelay ttsProvider>. ElevenLabs,
  // Google and Amazon are first-party providers; none needs a credential.
  TWILIO_TTS_PROVIDER: z.string().default("ElevenLabs"),
  TWILIO_TRANSCRIPTION_PROVIDER: optionalString,
  TWILIO_SPEECH_MODEL: optionalString,
  // Identifiers, not credentials — they name a voice for Twilio to ask
  // ElevenLabs for, and are worthless to anyone who has them. There is no
  // ElevenLabs secret anywhere in this system: Twilio resells the voice as a
  // first-party ConversationRelay provider, and this process never speaks to
  // ElevenLabs at all. Concatenated as "<voiceId>-<modelId>".
  ELEVENLABS_VOICE_ID: optionalString,
  ELEVENLABS_MODEL_ID: optionalString,
  // How eagerly Twilio treats caller speech as a barge-in.
  VOICE_RELAY_INTERRUPT_SENSITIVITY: z.enum(["low", "medium", "high"]).default("medium"),
  // Signs the short-lived handshake token that binds a relay socket to one
  // CallSid and tenant. Falls back to COOKIE_SECRET, which is always present.
  VOICE_RELAY_TOKEN_SECRET: optionalString,
  // Stops a forgotten call from looping on Twilio's dime.
  VOICE_RELAY_MAX_TURNS: z.coerce.number().int().positive().default(50),
  // Pause between the employee's farewell and hanging up. Twilio's docs do not
  // say whether ending a session lets pending speech finish, and the
  // difference is the caller hearing "Have a lovely day" or "Have a lovely—".
  // Measure it on a real call and set this to what that shows.
  VOICE_RELAY_HANGUP_DELAY_MS: z.coerce.number().int().min(0).default(0),

  // Usage metering.
  //
  // These are *rates*, not bills. Twilio invoices the telephony and the model
  // provider invoices the tokens, and neither invoice is visible from inside
  // this process — what is visible is how long each call was connected and how
  // many tokens it burned. Multiplying those by a rate someone typed here is
  // the honest most this system can do, and `/govern/usage` says so on the
  // screen rather than dressing the result up as an invoice.
  //
  // Defaults are deliberately in the right order of magnitude for a UK Twilio
  // number on ConversationRelay with a small hosted model, and deliberately
  // not anybody's real price list. Set them from your own bills.
  //
  // Minor units (pence, cents) per connected minute, covering the whole
  // telephony leg: inbound voice, speech recognition and speech synthesis,
  // which Twilio bills together and this system cannot separate.
  USAGE_RATE_VOICE_PER_MINUTE: z.coerce.number().min(0).default(9),
  // Minor units per million tokens. Input and output are priced separately
  // because every provider prices them separately, often by a factor of five.
  USAGE_RATE_MODEL_INPUT_PER_MTOKEN: z.coerce.number().min(0).default(8),
  USAGE_RATE_MODEL_OUTPUT_PER_MTOKEN: z.coerce.number().min(0).default(40),
  // Asks the model provider to report token counts alongside the stream. The
  // escape hatch is for an OpenAI-compatible endpoint that rejects
  // `stream_options` outright: turning it off costs the model half of the
  // meter, and `tokens_metered` then records that nobody counted rather than
  // letting zero read as free.
  USAGE_METER_TOKENS: booleanFlag(true),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.format());
  process.exit(1);
}

// Never let a real deployment accidentally leak verification codes.
if (parsed.data.NODE_ENV === "production" && parsed.data.EXPOSE_OTP_IN_RESPONSE) {
  console.error("EXPOSE_OTP_IN_RESPONSE must not be true in production.");
  process.exit(1);
}

export const env = parsed.data;
