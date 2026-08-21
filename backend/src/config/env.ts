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
  LLM_MODEL: z.string().default("llama-3.3-70b-versatile"),
  // Stopgap until a phone-number → workspace table exists: pins which
  // onboarded workspace's AI employee answers the test number. Unset means
  // "the most recently configured one".
  AI_EMPLOYEE_WORKSPACE_ID: optionalString,

  // Realtime voice — Twilio ConversationRelay.
  //
  // Twilio holds one WebSocket open for the whole call and owns both speech
  // recognition and text-to-speech; this backend exchanges JSON *text* with
  // it. That is why there is no ElevenLabs key here — the ElevenLabs
  // credential lives in the Twilio Console, and audio never transits this
  // process. Off flips the phone line back to the `<Gather>` loop.
  VOICE_RELAY_ENABLED: booleanFlag(true),
  // Passed straight through to <ConversationRelay ttsProvider>. "ElevenLabs"
  // requires an ElevenLabs credential configured on the Twilio account.
  TWILIO_TTS_PROVIDER: z.string().default("ElevenLabs"),
  TWILIO_TRANSCRIPTION_PROVIDER: optionalString,
  TWILIO_SPEECH_MODEL: optionalString,
  // Identifiers, not credentials — they name a voice for Twilio to ask
  // ElevenLabs for, and are worthless to anyone who has them. The actual
  // ElevenLabs secret lives on the Twilio account; this process never holds
  // one and never speaks to ElevenLabs directly.
  ELEVENLABS_VOICE_ID: optionalString,
  ELEVENLABS_MODEL_ID: optionalString,
  // How eagerly Twilio treats caller speech as a barge-in.
  VOICE_RELAY_INTERRUPT_SENSITIVITY: z.enum(["low", "medium", "high"]).default("medium"),
  // Signs the short-lived handshake token that binds a relay socket to one
  // CallSid and tenant. Falls back to COOKIE_SECRET, which is always present.
  VOICE_RELAY_TOKEN_SECRET: optionalString,
  // Stops a forgotten call from looping on Twilio's dime.
  VOICE_RELAY_MAX_TURNS: z.coerce.number().int().positive().default(50),
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
