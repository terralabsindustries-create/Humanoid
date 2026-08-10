import type { LightMyRequestResponse } from "fastify";
import { buildApp } from "../src/app.js";

export async function createTestApp() {
  return buildApp();
}

/** `app.inject()` doesn't carry a cookie jar between calls the way a browser
 *  would — this pulls the `Set-Cookie` values off one response so the next
 *  `inject()` call can send them back as a `cookie` header. */
export function extractCookies(response: LightMyRequestResponse): string {
  const setCookie = response.headers["set-cookie"];
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return values.map((c) => c.split(";")[0]).join("; ");
}

export async function signUpAndVerify(
  app: Awaited<ReturnType<typeof createTestApp>>,
  input: { name: string; email: string; password: string },
) {
  const signupRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/signup",
    payload: input,
  });
  const { debugCode } = signupRes.json().data;

  const verifyRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/otp/verify",
    payload: { email: input.email, code: debugCode },
  });

  return { cookie: extractCookies(verifyRes), verifyRes };
}
