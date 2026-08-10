import { z } from "zod";

/**
 * Environment contract. Fails fast and loudly on boot rather than letting a
 * missing secret surface later as a confusing runtime error mid-request.
 */
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
