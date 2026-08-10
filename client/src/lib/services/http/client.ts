/**
 * The one place the frontend talks HTTP to the real backend.
 *
 * Mirrors `api.md`'s envelope: `{ data }` on success, `{ error: { code,
 * message, ... } }` on failure. Every module under `lib/services/http/`
 * builds on this rather than calling `fetch` directly, so the session-cookie
 * handling and refresh-retry logic below live in exactly one place.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class HttpError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = status;
  }
}

type Envelope<T> = { data: T } | { error: { code: string; message: string } };

let refreshInFlight: Promise<boolean> | null = null;

/** Tries the httpOnly refresh cookie once. De-duped so N parallel 401s in
 *  flight only trigger a single refresh call, not N of them. */
async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request<T>(
  path: string,
  init: RequestInit,
  { allowRefreshRetry = true }: { allowRefreshRetry?: boolean } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  if (res.status === 401 && allowRefreshRetry && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, init, { allowRefreshRetry: false });
  }

  if (res.status === 204) return undefined as T;

  const body = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (!res.ok) {
    const error = body && "error" in body ? body.error : null;
    throw new HttpError(
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "Something went wrong. Check your connection and try again.",
      res.status,
    );
  }

  return body && "data" in body ? body.data : (undefined as T);
}

export const http = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
};
