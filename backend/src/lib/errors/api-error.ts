/**
 * Error codes and envelope from `api.md`. Every route throws `ApiError`
 * rather than a bare `Error` for anything a client should handle specially —
 * the global error handler (`plugins/error-handler.ts`) is the only place
 * that knows how to turn one into an HTTP response, so codes stay consistent
 * across every module.
 */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_REQUIRED",
  "PERMISSION_DENIED",
  "RESOURCE_NOT_FOUND",
  "RESOURCE_CONFLICT",
  "RATE_LIMITED",
  "IDEMPOTENCY_CONFLICT",
  "INTEGRATION_UNAVAILABLE",
  "DEPENDENCY_TIMEOUT",
  "APPROVAL_REQUIRED",
  "POLICY_BLOCKED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_REQUIRED: 401,
  PERMISSION_DENIED: 403,
  RESOURCE_NOT_FOUND: 404,
  RESOURCE_CONFLICT: 409,
  RATE_LIMITED: 429,
  IDEMPOTENCY_CONFLICT: 409,
  INTEGRATION_UNAVAILABLE: 503,
  DEPENDENCY_TIMEOUT: 504,
  APPROVAL_REQUIRED: 409,
  POLICY_BLOCKED: 403,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  code: ErrorCode;
  statusCode: number;
  details: unknown[];

  constructor(code: ErrorCode, message: string, details: unknown[] = []) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.details = details;
  }
}
