import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z.string().min(8, "Use at least 8 characters.").max(200);
const otpCode = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");

export const signupBodySchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(200),
  email,
  password,
});

export const verifyOtpBodySchema = z.object({
  email,
  code: otpCode,
});

export const resendOtpBodySchema = z.object({
  email,
});

export const loginBodySchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const requestPasswordResetBodySchema = z.object({
  email,
});

export const resetPasswordBodySchema = z.object({
  email,
  code: otpCode,
  newPassword: password,
});
