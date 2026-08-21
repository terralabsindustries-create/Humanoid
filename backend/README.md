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

## AI receptionist (`modules/telephony/ai-receptionist.ts`)

Set a model key and the same phone line stops echoing and starts answering:
each transcribed phrase goes to the model prompted with the
`AiEmployeeConfigurationVersion` that onboarding wrote, and the reply is
spoken back. This is the first thing that actually *uses* what onboarding
produces.

Without a key nothing breaks — the line degrades to the transcription probe
above, and logs which mode it answered in.

**Which employee answers** is resolved by `AI_EMPLOYEE_WORKSPACE_ID`, or the
most recently configured one when that's blank. Correct with a single tenant,
wrong with two — it's a stopgap until a phone-number → workspace mapping
exists, and the choice is printed on every call so a wrong answer is visible
rather than silent.

`buildSystemPrompt()` is shared by both transports below. There is deliberately
no second prompt: if the relay and the `<Gather>` fallback built their own, the
tenant's configuration would stop being the one thing deciding how their
employee behaves.

Still not real: no calendar, no knowledge base, no customer records, no
booking. The prompt tells the employee to say so rather than inventing
availability — but it can only promise a follow-up, not take an action.

## Realtime voice — Twilio ConversationRelay (default)

The production voice path. One WebSocket per call:

```
caller → Twilio (STT) → relay socket → Groq (streaming) → text frames
       → Twilio (ElevenLabs TTS) → caller
```

| Piece | Owner |
| --- | --- |
| Telephony, speech recognition, speech synthesis | Twilio |
| Voice (ElevenLabs) | Twilio, using a credential on the Twilio account |
| Language model | Groq, via its OpenAI-compatible endpoint |
| Prompt, tenant config, turn logic, transcript | this backend |
| Durable conversation record | Postgres |

**No audio and no ElevenLabs key touch this process.** What crosses the socket
is JSON text in both directions. That is the reason `ELEVENLABS_API_KEY` does
not appear in `.env.example`: `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID`
are identifiers naming a voice for Twilio to request, not credentials.

| File | Job |
| --- | --- |
| `voice.routes.ts` | Answers `/incoming` with `<Connect><ConversationRelay>` |
| `voice-token.ts` | Signed token binding one socket to one CallSid + tenant |
| `conversation-relay.ts` | The `GET /api/v1/twilio/voice/relay` socket |
| `voice-session.service.ts` | Turn state, cancellation, streaming, persistence |
| `tts-chunker.ts` | Cuts model deltas into speakable frames |
| `relay-protocol.ts` | The wire types |

### How a socket is authenticated

Twilio does not sign the WebSocket upgrade the way it signs a webhook, so trust
is carried forward from the request that *was* signed. `/incoming` resolves the
tenant, mints a 5-minute HMAC token naming it, and puts it in the `wss://` URL.
`preValidation` rejects the upgrade if the token fails, and the `setup` message
must announce the CallSid the token was minted for or the socket closes.

The session therefore reads its workspace out of a token this process signed,
never out of anything the socket claimed. That is what keeps tenant isolation
real on a transport with no per-message signature.

### Barge-in

`interruptible="true"` on the noun is what lets the caller physically talk over
the agent; the rest is this backend's problem. Every caller utterance
increments a turn id, and every frame is checked against the current one on its
way out, so a superseded generation cannot reach the caller no matter where it
had got to. The model stream is aborted too, but aborts are asynchronous — the
turn-id check is what actually makes it safe.

**What gets recorded is what the caller heard.** Twilio reports
`utteranceUntilInterrupt`; everything after it was discarded before reaching
the speaker, so it is never persisted and never enters the model's context. A
transcript claiming the agent said something nobody heard would poison the next
turn as well as the record.

### Latency

`[VOICE]` lines timestamp the path that matters: transcript received → Groq
generation started → first LLM token → first frame sent. Groq is chosen for
time-to-first-token, and nothing buffers a complete response — the first clause
leaves for synthesis while the model is still writing. `TTS_CHUNKER`'s first
frame goes at the first word boundary past ~12 characters; later frames wait
for clause boundaries, by which point audio is already playing.

Transcript text is deliberately never logged. Call content belongs in the
conversation row, which is access-controlled, and nowhere else.

### The `<Gather>` fallback

`VOICE_RELAY_ENABLED=false` reverts to the older synchronous loop documented
above: one HTTP turn per phrase, Twilio's built-in TTS, no barge-in, and a few
seconds of dead air per turn. Kept because it still transcribes when the relay
is unavailable, which is a more useful degradation than a silent socket.

### Testing it

`test/voice-relay.test.ts` drives a real webhook and a real WebSocket against a
real Fastify and Postgres, with only Groq mocked — including the barge-in race,
a mid-stream model failure, and socket cleanup. No paid provider is called.

```bash
pnpm test
```
