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
pnpm phone:assign       # point a Twilio line at a workspace
pnpm schedule:set       # set a workspace's opening hours and capacity
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

**Which employee answers** is decided by `resolveEmployeeForCall()`, on three
rungs, most specific first:

1. **The number dialled.** `workspaces.phone_number` is unique; the business
   that owns the line answers on it. This is the only rung that is correct
   with more than one tenant.
2. **`AI_EMPLOYEE_WORKSPACE_ID`** — a deployment-wide pin, for a single-tenant
   install or a number nobody has claimed yet.
3. **The most recently configured employee anywhere.** A development
   convenience that is *actively wrong* as soon as a second tenant exists.

Rung 3 was the only rule once, and it produced exactly the bug you would
expect: a tenant that onboarded a day later silently took over the phone line,
and the call gave no sign of it — it connected, and a confident voice answered
as the wrong company. It now logs a warning naming the tenant it picked, and
the call banner prints which rung was used on every call.

**`From` and `To` are not "caller" and "callee".** They are the two ends of a
call, and which one holds the human depends on who dialled: on an inbound call
the person is `From`, but Twilio dials *outbound* from the business number, so
there the person is `To`. `callParties()` resolves it, and everything
downstream — routing, the booking's phone field, the conversation's caller
label — uses `human`/`business` rather than `from`/`to`.

Reading `From` blindly is not hypothetical: it stamped the AI's own Twilio
number into the "Phone" field of a booking, which is the field a human being
rings back, and labelled the call as coming from the business to itself.
`conversations.direction` is what makes it recoverable, so it is now stored
from Twilio rather than hardcoded `inbound`.

The workspace owns the **Twilio line**, never a customer's mobile. Nothing in
the application writes `phone_number` — onboarding creates a workspace and an
employee but never claims a number — so a freshly onboarded tenant is invisible
to the phone line until the number is pointed at it:

```bash
pnpm --filter ./backend phone:assign                     # who owns which line
pnpm --filter ./backend phone:assign Kims +19044909120   # claim it (by id or name)
pnpm --filter ./backend phone:assign Kims --clear        # release it
```

The column is unique, so assigning is a **handover**: the workspace that held
the number loses the line, in the same transaction, so there is no instant
where the number is unowned and a call answers as a fallback tenant. The script
refuses a non-E.164 number (Twilio's lookup is an exact string match, so
`9044909120` would simply never route) and refuses a workspace with no
configured employee — that combination takes the number and then falls *through*
to a different tenant, which is the wrong-business failure this rung exists to
prevent.

There is no API for this yet — provisioning numbers is its own feature, and a
half-built endpoint would be worse than a documented command.

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
| Voice (ElevenLabs) | Twilio — a first-party ConversationRelay provider |
| Language model | Groq, via its OpenAI-compatible endpoint |
| Prompt, tenant config, turn logic, transcript | this backend |
| Durable conversation record | Postgres |

**No audio and no ElevenLabs key touch this process.** What crosses the socket
is JSON text in both directions. `ELEVENLABS_API_KEY` appears nowhere because
no such key exists in this setup *at all* — not here, and not in the Twilio
Console either. ElevenLabs is a first-party ConversationRelay TTS provider:
Twilio holds the relationship and bills the usage, and there is no
bring-your-own-key step to perform. `ELEVENLABS_VOICE_ID` and
`ELEVENLABS_MODEL_ID` are identifiers naming a voice for Twilio to request.

The `voice` attribute is built by concatenation —
`<voiceId>-<modelId>-<speed>_<stability>_<similarity>`, each part optional
left to right — so voice tuning needs no code change, only a longer
`ELEVENLABS_MODEL_ID`.

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
generation started → first LLM token → first frame sent.

**Time-to-first-spoken-token is the whole budget**, and the model choice
dominates it. Measured against Groq from a live call, four prompts each:

| `LLM_MODEL` | first spoken token |
| --- | --- |
| `openai/gpt-oss-120b` | ~1050ms |
| `openai/gpt-oss-20b` | ~585ms |
| `qwen/qwen3.6-27b` + `LLM_REASONING_EFFORT=none` | ~530ms |

Two things that are *not* the cause, both checked rather than assumed: on
gpt-oss the gap between the first token of any kind and the first *spoken*
token is only ~60ms, so reasoning is not what the caller waits for; and
`reasoning_effort` made gpt-oss marginally worse, not better. A large part of
the remainder is simply the round trip to Groq's US region.

**A reasoning model will read its thinking aloud unless you stop it.** Some
put their reasoning in `content` rather than a separate field — qwen3.6-27b on
Groq opens with a literal `<think>Here's a thinking process: 1. Analyze User
Input`, every word of which the synthesiser would speak. `LLM_REASONING_EFFORT=none`
is the fix; `ReasoningStripper` in `llm.ts` is the guard for when someone
points `LLM_MODEL` at a reasoning model and doesn't know to set it. It is a
streaming state machine, not a regex, because a tag arrives split across
deltas (`<thi` then `nk>`). `test/reasoning-stripper.test.ts` covers that. Groq is chosen for
time-to-first-token, and nothing buffers a complete response — the first clause
leaves for synthesis while the model is still writing. `TTS_CHUNKER`'s first
frame goes at the first word boundary past ~12 characters; later frames wait
for clause boundaries, by which point audio is already playing.

Transcript text is deliberately never logged. Call content belongs in the
conversation row, which is access-controlled, and nowhere else.

### Ending the call

The employee hangs up by writing `[[END_CALL]]` at the end of a reply. The
marker is stripped mid-stream by `MarkerStripper` — never spoken, never
persisted — and the session then sends ConversationRelay's `{"type":"end"}`.
The TwiML is a bare `<Connect>` with nothing after it, so when the relay
session ends Twilio runs out of TwiML and drops the call; no `action` URL is
needed.

**The model decides, not a farewell-phrase match.** Only the model knows
whether "thanks, bye" ended the call or was the caller pausing before the real
question, and hanging up on a customer mid-sentence is far worse than a couple
of seconds of silence. The prompt says so explicitly.

**`VOICE_RELAY_HANGUP_DELAY_MS` is the one number that needs measuring.**
Twilio's docs do not state whether ending a session lets pending speech drain
or truncates it, and the difference is the caller hearing "Have a lovely day"
or "Have a lovely—". It defaults to `0`; place one real call, and if the
farewell is clipped, raise it until it isn't. If the caller starts speaking
during the drain the hang-up is abandoned — they were not finished after all.

Unrecognised inbound frames are logged by type (never by content). That is how
to find out whether Twilio offers a speech-finished event, which would replace
the delay with an exact signal.

### Calls that never end

A conversation row is opened by the inbound webhook, *before* Twilio connects
the media socket. If that socket never arrives — the caller hangs up while it
rings, the tunnel is down, the process restarts mid-call — nothing calls
`endCall` and the row stays `active` forever. Every "live now" surface in the
frontend then shows a permanently frozen count, which is worse than showing
nothing: it is a dashboard lying about the present. This happened for real and
stuck at "2 live now" across the sidebar, the live rail and the conversation
list.

`abandonStaleCalls()` closes them, on two triggers wired up in `server.ts`:

- **At boot**, everything still `active` is closed. Live call state is an
  in-memory map keyed by CallSid, so nothing survived the restart by
  definition. No age filter is applied here deliberately — that would make
  correctness depend on this process's clock agreeing with Postgres's, and a
  few milliseconds of skew is enough to strand a row.
- **Every minute**, anything `active` for over five minutes that does not have
  a live session. Both transports contribute their live CallSids
  (`liveVoiceCallSids()`, `liveGatherCallSids()`), so a real conversation is
  never swept out from under itself however long it runs.

They are recorded as `status: failed`, `outcome_code: abandoned` — never
`completed`, which would claim a call happened that never connected.

## Records — the employee's first real action (`modules/records`)

Until this existed a call could only produce a transcript: the employee could
promise a follow-up but not take one. `create_booking` is a tool the model may
call mid-turn, and it writes a row to `records` that staff will act on.

A caller can change what they booked, too. `find_bookings`, `reschedule_booking`
and `cancel_booking` are the other three tools in `telephony/booking-tool.ts`,
and they exist because of what happens without them: with only `create_booking`
on hand, a caller ringing back to move Thursday to Friday got a *second*
booking, the first stayed confirmed, and the business held two tables for one
party — with nothing in the transcript to suggest anything had gone wrong. The
model cannot be prompted out of that when creating a row is the only action it
has.

`records` mirrors the frontend's `DomainRecord` deliberately, so no
translation layer sits between them and drifts: an archetype (`visit`, `case`,
`lead`, …), an industry-specific `type_id` within it, and a schema-free
`fields_json` the archetype layout renders. A hotel's reservation and a
clinic's appointment are the same row with different words around them, which
is what keeps one table serving every industry.

**The tool is industry-neutral on purpose.** It is called `create_booking` and
described in plain functional terms; the tenant's own system prompt supplies
the context, so a hotel concierge and a clinic receptionist call the same
function and speak to their caller in their own words. Putting "reservation"
in the backend would put one industry's language into every tenant's prompt —
that knowledge belongs in the frontend's domain packs (root `CLAUDE.md` rule
10). There is a test asserting the tool description says neither
"reservation" nor "appointment".

Seven things about it are worth knowing before changing it:

- **The caller's number is the lookup key, not a reference number.** Bookings
  are found by `records.party_phone` within the workspace, so the employee
  never asks a caller to read out an id and never speaks one. A withheld
  number therefore cannot look anything up — the tool says so and tells the
  employee to take details instead, which is the same honest dead end the
  directory reaches for the same reason.
- **Rescheduling moves the row; it never cancels and re-books.** The record
  keeps its id, its link to the call that created it and its place in the
  caller's history, and gains a `rescheduledFrom`. Cancelling sets
  `status = "cancelled"` and keeps the row, because a deleted booking is
  indistinguishable from one that never happened and the business needs to see
  that the table is free again.
- **An ambiguous request is answered with the list, not a guess.** A near miss
  on the time is far more likely to be a mis-transcription than a second
  booking, so nothing is written until the caller has confirmed which one they
  mean out loud. One extra round trip is cheap; cancelling someone else's
  dinner is not. `create_booking` applies the mirror of this rule — a repeat
  call for a slot the caller already holds returns the existing booking rather
  than writing a duplicate, and booking a *different* slot while another is
  live tells the model about the other one so it can offer to move it instead.
- **The workspace comes from the call, never from the model.** `bookingRunner`
  closes over the tenant resolved at `setup`, so a hallucinated `workspaceId`
  in the arguments is inert. There is a test that tries exactly that.
- **A tool that fails is spoken, not thrown.** `runTool` turns malformed
  arguments and errors into a sentence telling the model what to say. A phone
  call cannot show a stack trace, and a dropped call is worse than an apology.
- **The model has no clock.** The prompt states today's date in the tenant's
  timezone, because otherwise "Friday" resolves against training data and
  books a table for a day that has already passed. Unparseable dates are
  refused rather than guessed — a booking whose time we invented is worse than
  one the business has to phone about.
- **The clock the caller means is the business's, and the server has no vote.**
  `toScheduledAt()` resolves the wall clock in `context.timezone` — the same
  zone the prompt states the date in — and never through `new Date("…T23:00")`,
  which the language defines as local time *of this Node process*. That parse
  stored a 23:00 booking for a Europe/London business, taken on a laptop in
  Asia/Kolkata, as `17:30Z`, and the Records screen showed staff 18:30 while
  the employee had just confirmed "eleven p.m." out loud. It was wrong by a
  different amount on every machine, and correct only on one that happened to
  share the tenant's offset — so the tests assert instants (`toISOString()`)
  and never `getHours()`, which reads the value back through the same process
  clock that caused it.

The tool loop lives inside `streamReply`, bounded to `MAX_TOOL_ROUNDS`. The
provider-shaped `tool_calls` messages never escape that function, which is
what lets the session's `Turn[]` history stay plain text: what the
conversation remembers is still only what was said.

**It can check availability now — but only as far as the tenant has told it
what its week looks like.** See § Availability and the diary below; a
workspace that has configured nothing still behaves exactly as described here
before it existed, and the prompt still says in as many words that it cannot
look. `find_bookings` is not an exception either way: it reads this caller's
own bookings and nothing else — not the diary, not another caller's.

**A booking keeps the name it was taken under.** `records.party_name` is
written at creation and never rewritten, which is what stops the directory
from rewriting history: one phone can belong to a household, so a second
person calling from it renames the *party* (their name is `ai_inferred`, and
the newest transcription wins until a human settles it) while every booking
already made keeps whoever made it. The frontend follows the same rule —
`/records` renders `record.partyName` and falls back to the directory only
where the record never carried a name.

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

## Availability and the diary (`modules/schedule`)

`create_booking` used to write whatever the caller said. Three in the morning
at a clinic that opens at eight; the twentieth table at a restaurant that
seats twelve. Both were confirmed aloud, both landed in `records` looking
exactly like a good booking, and both were invisible until somebody arrived at
a locked door. The tool's own description told the model "you cannot check
availability", which was honest and meant the most ordinary question a
business gets — *are you free Thursday evening?* — was answered with a promise
that somebody would ring back.

Three tables carry it: `business_hours` (one row per opening period per
weekday, so two rows on a weekday is a split shift), `schedule_exceptions` (a
calendar date that overrides the weekly pattern — a bank holiday, or closing
early on the 24th) and `booking_policies` (slot grain, booking duration,
capacity per slot, minimum notice, how far ahead the diary goes).

### The rule the whole module rests on

**An unconfigured schedule is not a closed business.** Every workspace that
existed before this shipped has no rows in any of the three tables. If "no
rows" were read as "shut", this module would have taken every one of their
phone lines down on deploy — the same failure `shouldAnswerCall()` fails open
to avoid. So each of the three checks is independently skippable, and a
verdict reports *which* ones actually ran (`checked`) rather than resting
silently on nothing.

The second rule follows from the first: **an unchecked slot is never reported
as a free one.** "I cannot see the diary" and "that time is available" are
different sentences and the employee is handed whichever is true. This matters
most in the middle case, which is the one a real tenant will sit in longest: a
business with opening hours but no capacity set knows it is *open* at seven on
Thursday and knows nothing about whether there is room. The prompt says so
explicitly, and `test/availability.test.ts` asserts the three prompt states
stay distinct.

### What actually enforces it

`check_availability` (`telephony/availability-tool.ts`) is the tool the prompt
used to forbid. It reads and writes nothing, and every branch of its reply
tells the model what to *do* rather than only what is true — a refusal always
carries the nearest times that would work, because "we cannot do that" and a
caller hanging up is exactly what the employee could already manage.

But a prompt is not an enforcement point. `create_booking` and
`reschedule_booking` run the identical check themselves before writing, so a
model that skips the step — or whose earlier check went stale during a long
call — still cannot write a booking the business cannot keep. Both share
`describeVerdict()` so the two can never describe the same diary differently.

Three details worth knowing before changing any of it:

- **The whole booking has to fit, not just its start.** A 30-minute
  appointment at 16:45 against a five o'clock close is the same class of error
  as booking at 3am, only harder to see.
- **Capacity counts overlap, not equality.** A 60-minute booking at 10:00
  occupies 10:30 on a single chair; counting exact start times would let a
  business be double-booked by callers who asked for a different half hour. A
  booking being moved excludes itself from that count, or a capacity of one
  would block its own reschedule.
- **It fails open.** A diary lookup that throws is logged and the booking goes
  through, for the same reason the spend cap does: a clash staff can resolve
  costs far less than refusing a paying caller because of an outage they
  cannot see.

### Setting it

Nothing in the application writes this yet — onboarding does not ask for
opening hours, and `/govern/channels`, the surface that will own them, is
still on mock data. The deliberate manual step:

```bash
pnpm --filter ./backend schedule:set                              # show everyone
pnpm --filter ./backend schedule:set Kims "mon-fri 9-17, sat 9-13"
pnpm --filter ./backend schedule:set Kims --capacity 4 --duration 30
pnpm --filter ./backend schedule:set Kims --closed 2026-12-25 "Christmas Day"
pnpm --filter ./backend schedule:set Kims --clear
```

It prints what the workspace will actually enforce after the change —
including `hours NO, capacity NO` — because a business that believes it has
set opening hours when it has only set capacity finds out from a caller booked
at four in the morning.

### The API

```
GET /workspaces/:workspaceId/schedule    membership — everyone who works here
                                         needs to know when the business is open
PUT /workspaces/:workspaceId/schedule    channel.manage
```

`PUT` replaces the weekly pattern and the exception list wholesale (editing a
week means the week you left behind, not a merge of two states) and merges the
policy, which is a set of independent settings. It takes effect on the next
call — there is no draft — and writes a `channel.schedule_changed` audit row
carrying before and after, because opening hours are the setting most likely
to be argued about later.

### What is still missing

No named resources. `records.resource_type` / `resource_id` still come back
null rather than invented: "room 4", "chair 2", "Dr. Patel" is a bigger schema
than a per-slot count, and a half-built version of it would let the employee
promise a specific table it has no way to hold. Capacity is a number of
concurrent bookings and nothing more. There is also no per-service duration —
one `duration_minutes` covers every booking a tenant takes, so a practice
whose consultations run 15 minutes and whose procedures run 90 needs the
resource model before it can be described honestly.

## The customer directory (`modules/parties`)

Records are things the employee *did*; this is who it did them for. `parties`
plus `party_facts` back the `/customers` screen, whose job is not "browse a
CRM" but answering one question about somebody the AI has been speaking to on
your behalf: **what does it think it knows, and did anybody check?**

That question is why provenance is a column rather than a convention. A name
heard down a phone line and a name a receptionist verified are the same string
with entirely different standing, so each fact carries a `source` —
`ai_inferred`, `unverified`, `imported`, `verified` — and the *only* thing
that produces `verified` is a person confirming or correcting it. The confirm
and correct routes take no `source` argument at all; letting a caller name any
provenance would make provenance meaningless.

Three rules here are easy to break:

- **Identity is the caller's number, and nothing else.** `rememberCaller()`
  upserts on `(workspace_id, primary_phone)`, so the second call from a number
  updates the record the first one made. A withheld number — Twilio spells it
  `anonymous`, `restricted`, `unavailable`, or the literal `+266696687` —
  produces **no** record, because a row we could not recognise on the next
  call is not a customer record, it is a duplicate waiting to happen. That
  caller's booking still carries the name and number they gave, on `records`,
  and `party_id` stays null rather than pointing at an invention.
- **A human decision outranks a transcription, permanently.** Speech
  recognition mishears names constantly, which is the entire reason the screen
  has a Confirm button. Once somebody has verified "Siobhan", the next call
  hearing "Shevonne" must not quietly overwrite them — `noteName()` checks the
  existing source first, and there is a test for exactly that sequence.
- **The number is the name until somebody says one.** A caller who never gives
  a name gets `display_name` set to their own number and zero facts. That is
  the honest label for a person nobody has introduced, and it is also why the
  directory row says "Name not given" underneath rather than printing the same
  number twice.

**Consent is deliberately not stored.** Nothing records calls and nothing asks
about marketing, so both answers come back `unknown`, which the screen already
words as "never asked, treated as declined until it is". A consent column
nothing ever writes would make an unasked question look like an answered one.

**What the audit log gets is the label, never the value.** Confirming or
correcting a fact writes an `audit_events` row naming which claim was settled
and who settled it. Copying the value in too would put a caller's personal
detail into an append-only table that outlives every retention policy.

`database.md` § Customers also specifies `customer_identifiers` (hashed,
individually verifiable) and `customer_notes`. Neither is built: nothing hashes
an identifier or writes a staff note today, and the same rule that keeps
knowledge and workflows out of this schema keeps them out too. There is also
no merge — two numbers belonging to one person stay two records until
something real can decide they are the same person.

### Where a party comes from

Two places, both on the signed webhook path:

1. **The call being answered.** `createCallRecord()` files the caller the
   moment the conversation row is opened, on either transport, and links the
   call to them. It reads the *human* end of the call via `callParties()` — on
   an outbound call the business dials from its own number, and filing that
   would put the AI in its own directory.
2. **A booking.** `create_booking` is the only thing that learns a name, so it
   calls `rememberCaller()` with it and hands the resulting id to
   `createRecord()`. The fact lands as `ai_inferred`, which is the claim the
   screen then asks somebody to check.

Both are best-effort: a directory write failing logs and lets the call carry
on unlinked. A ringing phone must never drop because a `parties` insert did.

## Review — the work queue behind the calls (`modules/review`)

The screen this feeds says the thing to understand about it: *"you fix the
missing answer once, not the forty-three calls it affected."* A row in
`review_issues` is a **cause**, not an incident. Forty-three callers hitting
the same unanswerable question is one row affecting forty-three calls, and
`cause_key` — unique per workspace — is what makes the forty-third occurrence
join the first instead of opening a duplicate beside it.

`review_issue_events` holds the occurrences: at most one per (cause, call), so
blast radius counts *calls* and a caller who asks the same dead-end question
three times in one call is still one affected call.

### Where a cause comes from

Two paths, and the distinction matters:

1. **The employee says so, mid-call.** `flag_unresolved`
   (`telephony/escalation-tool.ts`) is the counterpart to `create_booking` —
   one is the employee doing something, this is it reporting something it
   *could not* do. The model raises it, not a phrase match over the
   transcript, for the same reason the model decides when a call is over: only
   the model knows whether "I'll have a colleague ring you back" was a real
   dead end or a polite way of closing a question it had already answered.
   A phrase matcher files both, and a queue full of false causes is one nobody
   reads.
2. **How the call ended.** `endCall()` is the single funnel both transports
   finish through, so `raiseFromCallOutcome()` hangs off it rather than being
   wired into the relay and forgotten on `<Gather>`. Only three outcome codes
   describe a wall: `no_speech` → `transcription_failure`, `turn_limit` →
   `unclear_scope`, `error` → `tool_failure`. `completed` and
   `caller_hung_up` are ordinary endings, and **`abandoned` is deliberately
   not a cause** — that is `abandonStaleCalls` closing a row whose media
   socket never arrived, i.e. someone ringing off while it rang, which is not
   a failure of anything the employee did.

A failed `create_booking` write also raises a `tool_failure`, because it is
this system's most expensive silent failure: the transcript shows a helpful
call and the diary shows nothing.

### Three things that are easy to get wrong

- **The caller must never hear about a flag.** Flagging is silent. The tool's
  reply tells the model in as many words to say nothing about it and carry on
  helping — "I've logged that for the business" is not a service, and there is
  a test asserting that instruction is still there.
- **Severity is derived, never stored.** It is a function of the cause and how
  many calls it has touched, so a column would freeze a judgement that keeps
  moving: a cause filed "low" on its first call would still read "low" on its
  hundredth. `severityFor()` computes it from the same counts the queue ranks
  by, so the list and the row cannot disagree.
- **A recurrence reopens `resolved`, but never `dismissed`.** If it is
  happening again it was not fixed. Dismissed is a person's judgement that it
  is not worth changing anything for, and reopening it on the next occurrence
  would make dismissing it meaningless. It keeps counting occurrences either
  way — dismissing a cause is not pretending it stopped.

### What is deliberately never raised

`IssueCause` on the frontend has eleven values; this backend detects five.
`conflicting_knowledge` and `stale_knowledge` need a knowledge base for
sources to disagree, `procedure_gap` and `procedure_error` need procedures,
and the two autonomy causes need an authority matrix a real tenant can
actually be given. None of that exists, so none of them are ever raised. An
empty facet is the true answer; a fabricated one would be indistinguishable
from a real finding.

For the same reason `proposedFix` comes back **null** for every real cause.
Proposing the words an employee should say instead means knowing the
business's actual answer, and nothing here knows it. The issue detail renders
"someone has to decide what the AI should say or do instead", which is exactly
true — a drafted fix would be a plausible answer to a customer's question,
written by nobody.

### The API

| | |
| --- | --- |
| `GET /workspaces/:id/review/issues` | every cause, any status — the queue's four tabs each carry a count, so one request has to answer for all four |
| `GET /workspaces/:id/review/issues/:issueId` | one cause; 404 is a normal link to follow, and the detail screen has copy for it |
| `PATCH /workspaces/:id/review/issues/:issueId` | triage only — `status` and `assignedToUserId` |

`PATCH` records a judgement about a cause and changes nothing about what the
employee says or does. That change is made in Build, against a draft that has
to pass simulation before a customer meets it.

## Usage and the spend cap (`modules/usage`)

What the calls cost, and what happens when that reaches the budget. It backs
`/govern/usage` and the spend indicator in the app shell — both read the same
snapshot, so the two can never disagree.

One distinction runs through the whole module, and everything else follows
from it:

- **Units are measured.** Connected seconds come off the call. Token counts
  come from the model provider's own usage report. Both are facts.
- **Money is arithmetic.** It is those units multiplied by rates somebody typed
  into `.env` (`USAGE_RATE_*`). Twilio invoices the telephony and the model
  provider invoices the tokens, and **neither invoice is readable from inside
  this process.** Nothing here is a bill, and the screen says so in as many
  words rather than letting a plausible total pass for one.

That is why the snapshot ships its own derivation — connected minutes, token
counts, the rates applied — up to the frontend. `/govern/usage` renders the
working; the Northgate fixture, which states a total the way a demo may, has
no meter attached and renders differently on purpose.

### Where a figure comes from

`call_usage` holds one row per call, written by `endCall` — the single point
both the ConversationRelay path and the `<Gather>` fallback pass through, the
same reason the review detector hangs there. A meter wired into the realtime
path and forgotten on the fallback would under-report spend in a way nobody
would notice until an invoice disagreed.

Each row carries the measured units, the money, and `rates_json` — the rates it
was priced at. History does not move when a rate changes tomorrow.

Three details worth knowing before changing any of it:

- **Telephony is billed by the started minute**, the way every carrier bills
  it. A 61-second call is two minutes. Rounding down would under-report every
  call in the system by up to a minute, which on a phone line is most of the
  bill.
- **Money is stored at four decimal places, not rounded per call.** A
  three-minute call's model cost is a fraction of a penny; rounding at the row
  would report model spend as £0.00 forever no matter how many calls were made.
  Rounding happens once, on the month's total.
- **`tokens_metered` is the honesty flag.** A provider that reports no usage
  leaves the token columns at zero, which is indistinguishable from a call that
  used no tokens unless something records which happened. The frontend renders
  "not counted" rather than a zero that would read as free.

Two known undercounts, both stated rather than papered over. A turn the caller
barges in on is aborted mid-stream, so its usage chunk never arrives and its
tokens go uncounted — closing that needs a provider that reports usage on a
cancelled request, and none do. And `abandonStaleCalls` writes no usage row at
all: a conversation closed by the sweep is a caller who rang off while it rang,
and pricing a call that never connected would be worse than missing it. Both
err low, which is the safe direction for a meter.

### The cap actually stops the line

`shouldAnswerCall()` runs on every inbound call, before the AI employee is
connected. A workspace that chose **stop answering** and has reached its budget
does not get one: the caller hears that automated calls are unavailable and is
asked to try another way, and the call is still routed and logged. `notify`
deliberately falls through — that is what notify means.

It fails open. A workspace whose spend cannot be read still gets its calls
answered, because a metering outage that silently took a business's phone line
down would be a far worse failure than one that let it overspend for an
afternoon.

**`voicemail` is refused, not stored.** There is no voicemail box: nothing here
records a message, stores it, or tells anyone it arrived, so accepting the
setting would leave callers talking to nobody at exactly the moment the
business had stopped paying attention. The snapshot ships the reason in
`capBlocked`, and the editor renders the option unselectable with that reason
attached rather than hiding it — §3.11's rule for hard blocks, for the same
reason: an option quietly missing from a list cannot be asked about.

### The API

| | |
| --- | --- |
| `GET /workspaces/:id/usage` | the snapshot, with its meter and the blocked cap behaviours |
| `PUT /workspaces/:id/usage/budget` | `{ budgetMonth, atCap }` — takes effect immediately, no draft |

Both are gated on `billing.read`, not merely on workspace membership. The
Operator preset deliberately excludes billing, and a check that lived only in
the frontend would hand the month's numbers to anyone in the workspace who
typed the URL. `PUT` writes its audit row in the same transaction as the
change, recording who changed what from what.

`budgetMonth: null` is "tracked but uncapped" and is not the same as `0` — a
cap of nothing would trip on the first call of the month.
