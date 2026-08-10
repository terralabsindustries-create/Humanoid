import { prisma } from "@/db/client.js";
import { env } from "@/config/env.js";
import { hashPassword, verifyPassword } from "@/lib/security/password.js";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "@/lib/security/otp.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  hashIp,
} from "@/lib/security/tokens.js";
import { ApiError } from "@/lib/errors/api-error.js";
import { recordAudit } from "@/lib/audit.js";
import type { NotificationSender } from "@/lib/notifications/sender.js";
import type { User } from "@prisma/client";

const OTP_PURPOSE_SIGNUP = "signup_verification";
const OTP_PURPOSE_RESET = "password_reset";

export type RequestMeta = { userAgent?: string; ip?: string };
export type Tokens = { accessToken: string; refreshToken: string };

const WRONG_CODE_MESSAGE = "That code isn't right. Check the digits and try again.";
const WRONG_CREDENTIALS_MESSAGE = "Incorrect email or password.";

async function createOtp(params: { userId?: string; email: string; purpose: string }): Promise<string> {
  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000);

  // An old, unconsumed code for the same purpose is invalidated so only the
  // most recently issued one can ever be redeemed.
  await prisma.otpCode.updateMany({
    where: { email: params.email, purpose: params.purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.otpCode.create({
    data: {
      userId: params.userId ?? null,
      email: params.email,
      codeHash,
      purpose: params.purpose,
      expiresAt,
    },
  });

  return code;
}

async function consumeOtp(params: { email: string; purpose: string; code: string }): Promise<void> {
  const record = await prisma.otpCode.findFirst({
    where: { email: params.email, purpose: params.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) throw new ApiError("VALIDATION_ERROR", WRONG_CODE_MESSAGE);
  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError("VALIDATION_ERROR", "That code has expired. Request a new one.");
  }
  if (record.attemptCount >= env.OTP_MAX_ATTEMPTS) {
    throw new ApiError("RATE_LIMITED", "Too many incorrect attempts. Request a new code.");
  }

  if (!verifyOtpCode(params.code, record.codeHash)) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { attemptCount: { increment: 1 } },
    });
    throw new ApiError("VALIDATION_ERROR", WRONG_CODE_MESSAGE);
  }

  await prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
}

async function issueSession(user: User, meta: RequestMeta): Promise<Tokens> {
  const accessToken = await signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      userAgent: meta.userAgent?.slice(0, 300),
      ipHash: meta.ip ? hashIp(meta.ip) : null,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}

export async function signup(
  input: { name: string; email: string; password: string },
  sender: NotificationSender,
): Promise<{ email: string; debugCode?: string }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  if (existing && existing.status !== "pending_verification") {
    throw new ApiError(
      "RESOURCE_CONFLICT",
      "An account with this email already exists. Try logging in instead.",
    );
  }

  const passwordHash = await hashPassword(input.password);

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name: input.name, passwordHash },
      })
    : await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          status: "pending_verification",
        },
      });

  const code = await createOtp({ userId: user.id, email: user.email, purpose: OTP_PURPOSE_SIGNUP });
  await sender.send({
    to: user.email,
    subject: "Verify your Humanoid account",
    body: `Your verification code is ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes.`,
  });
  await recordAudit({ actorType: "user", actorId: user.id, action: "auth.signup_requested" });

  return { email: user.email, debugCode: env.EXPOSE_OTP_IN_RESPONSE ? code : undefined };
}

export async function verifySignupOtp(
  input: { email: string; code: string },
  meta: RequestMeta,
): Promise<{ user: User; tokens: Tokens }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new ApiError("VALIDATION_ERROR", WRONG_CODE_MESSAGE);

  await consumeOtp({ email: input.email, purpose: OTP_PURPOSE_SIGNUP, code: input.code });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { status: "active", emailVerifiedAt: new Date(), lastLoginAt: new Date() },
  });

  const tokens = await issueSession(updated, meta);
  await recordAudit({ actorType: "user", actorId: updated.id, action: "auth.email_verified" });

  return { user: updated, tokens };
}

export async function resendSignupOtp(
  email: string,
  sender: NotificationSender,
): Promise<{ debugCode?: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Same response whether or not the account exists — the alternative leaks
  // which emails are registered.
  if (!user || user.status !== "pending_verification") return {};

  const code = await createOtp({ userId: user.id, email, purpose: OTP_PURPOSE_SIGNUP });
  await sender.send({
    to: email,
    subject: "Your new Humanoid verification code",
    body: `Your verification code is ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes.`,
  });

  return { debugCode: env.EXPOSE_OTP_IN_RESPONSE ? code : undefined };
}

export async function login(
  input: { email: string; password: string },
  meta: RequestMeta,
): Promise<{ user: User; tokens: Tokens }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new ApiError("VALIDATION_ERROR", WRONG_CREDENTIALS_MESSAGE);

  if (user.status === "pending_verification") {
    throw new ApiError("VALIDATION_ERROR", "Verify your email before logging in.");
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) throw new ApiError("VALIDATION_ERROR", WRONG_CREDENTIALS_MESSAGE);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const tokens = await issueSession(updated, meta);
  await recordAudit({ actorType: "user", actorId: updated.id, action: "auth.login" });

  return { user: updated, tokens };
}

export async function refreshSession(
  refreshTokenRaw: string | undefined,
  meta: RequestMeta,
): Promise<{ user: User; tokens: Tokens }> {
  if (!refreshTokenRaw) {
    throw new ApiError("AUTHENTICATION_REQUIRED", "Sign in to continue.");
  }

  const tokenHash = hashRefreshToken(refreshTokenRaw);
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
    throw new ApiError("AUTHENTICATION_REQUIRED", "Your session has expired. Sign in again.");
  }

  const tokens = await prisma.$transaction(async (tx) => {
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const created = await tx.refreshToken.create({
      data: {
        userId: record.userId,
        tokenHash: hashRefreshToken(refreshToken),
        userAgent: meta.userAgent?.slice(0, 300),
        ipHash: meta.ip ? hashIp(meta.ip) : null,
        expiresAt,
      },
    });

    // Rotation: the presented token is burned the moment it's used, whether
    // or not this is its legitimate owner. If it's ever presented again,
    // that's a replay of a stolen token — treated as theft below.
    await tx.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedById: created.id },
    });

    const accessToken = await signAccessToken({ sub: record.user.id, email: record.user.email });
    return { accessToken, refreshToken };
  });

  return { user: record.user, tokens };
}

export async function logout(refreshTokenRaw: string | undefined): Promise<void> {
  if (!refreshTokenRaw) return;
  const tokenHash = hashRefreshToken(refreshTokenRaw);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function requestPasswordReset(
  email: string,
  sender: NotificationSender,
): Promise<{ debugCode?: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "active") return {}; // no account enumeration

  const code = await createOtp({ userId: user.id, email, purpose: OTP_PURPOSE_RESET });
  await sender.send({
    to: email,
    subject: "Reset your Humanoid password",
    body: `Your password reset code is ${code}. It expires in ${env.OTP_TTL_MINUTES} minutes.`,
  });

  return { debugCode: env.EXPOSE_OTP_IN_RESPONSE ? code : undefined };
}

export async function resetPassword(input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new ApiError("VALIDATION_ERROR", WRONG_CODE_MESSAGE);

  await consumeOtp({ email: input.email, purpose: OTP_PURPOSE_RESET, code: input.code });

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  // Resetting the password invalidates every other session — the entire
  // point of a reset is that whatever was trusted under the old password no
  // longer should be.
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await recordAudit({ actorType: "user", actorId: user.id, action: "auth.password_reset" });
}

export async function getUserById(userId: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id: userId } });
}
