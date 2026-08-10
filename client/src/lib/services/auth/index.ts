import type { AuthService } from "./contract";
import { httpAuthService } from "./http";

export const authService: AuthService = httpAuthService;
export { AuthServiceError } from "./contract";
export type { SignupInput, SessionUser } from "./contract";

// The offline fallback (`mockAuthService`, `DEMO_OTP`) is still exported for
// local frontend-only development without the backend running — see
// `./mock.ts`. Swap the import above to point `authService` at it if you
// need to work without `pnpm dev:backend` up.
export { mockAuthService, DEMO_OTP } from "./mock";
