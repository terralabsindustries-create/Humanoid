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

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 characters"),
  CORS_ORIGIN: z.string().min(1),
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
