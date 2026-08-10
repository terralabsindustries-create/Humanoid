# Humanoid backend

The Product API from `architecture.md` — auth, organizations/workspaces,
onboarding, and the AI employee configuration record onboarding produces.
Fastify + Prisma + PostgreSQL, TypeScript throughout, no other runtime deps
beyond what a REST API strictly needs.

**Scope, deliberately narrow:** this backs exactly what the frontend
currently presents as real (see the audit in the PR/commit that introduced
it). Conversations, knowledge, workflows, integrations, billing — all still
frontend-only mock data, on purpose, because there's no telephony or AI
runtime behind them yet. Building real tables and endpoints for those now
would just be a second layer of fake, better-disguised. Add them when the
feature they back is real.

## Setup

Requires PostgreSQL running locally (`brew install postgresql@16 && brew
services start postgresql@16` on macOS — no Docker dependency).

```bash
# One-time: create the role, dev database and test database.
psql -d postgres -c "CREATE ROLE humanoid WITH LOGIN PASSWORD 'humanoid_dev_password' CREATEDB;"
psql -d postgres -c "CREATE DATABASE humanoid_dev OWNER humanoid;"
psql -d postgres -c "CREATE DATABASE humanoid_test OWNER humanoid;"

cp .env.example .env
# Fill in JWT_ACCESS_SECRET and COOKIE_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

pnpm install       # from the repo root — this is a pnpm workspace
pnpm db:migrate    # applies prisma/migrations, generates the client
pnpm db:seed       # seeds system roles (owner/operator/builder/governor) + permissions
pnpm dev           # http://localhost:4000
```

The frontend expects this at `NEXT_PUBLIC_API_URL` (`client/.env.local`,
defaults to `http://localhost:4000/api/v1`) and needs `CORS_ORIGIN` here to
match its origin exactly for cookies to work cross-port.

## Commands

```bash
pnpm dev                # tsx watch, loads .env
pnpm build              # tsc -> dist/
pnpm start              # node dist/server.js, loads .env
pnpm lint               # eslint
pnpm exec tsc --noEmit  # typecheck
pnpm test               # vitest against humanoid_test — see below
pnpm db:migrate         # prisma migrate dev (creates + applies a migration)
pnpm db:seed            # re-seed roles/permissions (idempotent)
pnpm db:studio          # Prisma Studio, browsing humanoid_dev
```

## Testing — read this before touching `test/setup.ts`

Tests run against a **separate** database (`humanoid_test`), truncated and
reseeded before every test via `test/setup.ts`. That isolation depends
entirely on `DATABASE_URL` actually pointing at `humanoid_test` when the
Prisma client in `src/db/client.ts` is first imported — and that already went
wrong once. `.env.test` used to be loaded with `process.loadEnvFile()` inside
`test/setup.ts`, textually before its own imports — which does nothing,
because ESM hoists `import` statements above ordinary statements regardless
of source order, so `src/db/client.ts` (and the `DATABASE_URL` read baked
into its `PrismaClient` construction) had already run first. The suite
silently truncated `humanoid_dev` on every run until this was caught.

The fix: `.env.test` is loaded via `node --env-file=.env.test` in the `test`
script in `package.json` — set at the Node process level, before any module
evaluates, so there's no ordering to get wrong. `test/setup.ts` also asserts
`DATABASE_URL` contains `humanoid_test` and throws immediately if it doesn't,
so this exact mistake can't silently recur even if the script changes again.
**Always run tests via `pnpm test`, never `vitest run` directly** — the
env-file flag lives in the npm script, not in any config `vitest` itself
reads.

## Architecture notes

- **Auth**: httpOnly cookies, not localStorage. `humanoid_access` (short-lived
  JWT, path `/`) and `humanoid_refresh` (opaque random token, hashed at rest,
  rotated on every use, path scoped to `/api/v1/auth` only). No email
  provider is wired up — `EXPOSE_OTP_IN_RESPONSE=true` in dev returns the
  real, randomly generated OTP code in the API response instead of pretending
  an email was sent; this must be `false` in production (the app refuses to
  boot otherwise — see `config/env.ts`).
- **Tenant isolation**: every workspace-scoped route calls
  `requireWorkspaceMember()` (`lib/workspace-access.ts`) before touching
  workspace data — never trust a client-supplied workspace id alone. A
  non-member gets 404, not 403 (a 403 would confirm the workspace exists).
- **Errors**: every route throws `ApiError` (`lib/errors/api-error.ts`); the
  global handler (`plugins/error-handler.ts`) is the only place that turns
  one into an HTTP response, so the envelope in `api.md` stays consistent
  everywhere without every route re-implementing it.
- **Roles/permissions**: seeded once (`src/lib/roles-seed.ts`, shared by
  `prisma/seed.ts` and the test suite so they can't drift). Keys mirror the
  frontend's `RolePreset` and the capability strings already exercised by the
  Northgate Health fixture on the frontend — a real workspace's owner gets
  `["*"]`, matching what the mock fixture already assumed.

## Twilio inbound speech test (`modules/telephony`)

A deliberately minimal probe: does Twilio's inbound speech recognition reach
this backend as text? Nothing more. It answers a call, transcribes each
phrase, prints it to stdout and loops. **No database writes, no AI, no
outbound calls, no realtime audio** — a call leaves no trace but console
output, so this is a diagnostic, not the beginning of a conversation store.

Two webhooks, both signature-verified:

| Route | Purpose |
| --- | --- |
| `POST /api/v1/twilio/voice/incoming` | Answers, prompts, opens the first `<Gather>` |
| `POST /api/v1/twilio/voice/speech` | Receives one transcription, prints it, re-opens `<Gather>` |

Turn state (`?turn=N&misses=M`) rides in the `<Gather action>` query string, so
the pair stays stateless — no session store, and Twilio's own signature covers
it. The loop stops after 10 turns or 2 consecutive silences.

```bash
ngrok http 4000     # in another terminal; paste the https URL into PUBLIC_BASE_URL
pnpm dev
```

Then point the number's **A call comes in** webhook (Twilio Console → Phone
Numbers → the number → Voice Configuration) at
`$PUBLIC_BASE_URL/api/v1/twilio/voice/incoming`, HTTP POST.

Three things cause almost every failure here:

- **`PUBLIC_BASE_URL` not matching the Console URL exactly.** Twilio HMACs the
  URL it was configured with; a scheme, host or trailing-slash difference
  yields a 403 with `signature did not validate for this URL` in the log,
  which prints the URL this side reconstructed — compare the two.
- **`TWILIO_AUTH_TOKEN` vs an API key secret.** Webhook signatures use the
  account **Auth Token**. An API key secret will never validate.
- **ngrok's URL changing on restart** (free tier), silently invalidating both
  the Console entry and `PUBLIC_BASE_URL`.

With `TWILIO_AUTH_TOKEN` unset the routes accept unsigned requests in
development and log a loud warning each boot; in production they refuse
outright. `TWILIO_ACCOUNT_SID`, when set, rejects webhooks from other
accounts — the one check that still holds while signature validation is off.

Both routes run at `logLevel: "warn"` so Fastify's per-request info logs don't
bury the transcription blocks; rejected-signature warnings still print.
