# Humanoid — working notes

AI-first customer care platform. The frontend is a supervisory control system for
AI employees that speak to customers and take real business actions.

**Read first:** `interface-architecture.md` is the canonical architectural
specification (v1.1, approved). Changes to its §3, §7, §9 or §12 decisions need a
change request and a version bump, not a silent edit. v1.1's change log entry
records a deliberate, scoped supersession of §3.5/§3.6/§9's onboarding model —
read it before assuming the Discovery Console description in §3.5 reflects
what's actually built.

## Repository layout

A pnpm workspace, root-level (`/pnpm-workspace.yaml`, `/package.json`) — not
two independent projects. `client/` and `backend/` each keep their own
package.json/scripts; run `pnpm <script>` from the root to fan out to both,
or `pnpm --filter ./client <script>` / `pnpm --filter ./backend <script>` for
one. The shared spec docs (`architecture.md`, `api.md`, `database.md`,
`ai.md`, `vision.md`, `roadmap.md`, `ui.md`, this file) live at the repo
root, outside both packages, because both read them.

```
Humanoid/
  interface-architecture.md   frontend spec — canonical, see below
  architecture.md, api.md,    system/API/DB specs both packages are built against
    database.md, ai.md
  client/                     Next.js frontend — see "Frontend" below
  backend/                    Fastify API — see backend/README.md
```

**Read first:** `interface-architecture.md` is the canonical architectural
specification for the frontend (v1.1, approved). Changes to its §3, §7, §9 or
§12 decisions need a change request and a version bump, not a silent edit.
v1.1's change log entry records a deliberate, scoped supersession of
§3.5/§3.6/§9's onboarding model — read it before assuming the Discovery
Console description in §3.5 reflects what's actually built. `architecture.md`
and `database.md` are the equivalent baseline for the backend — `backend/`
follows their table shapes and API conventions for everything it implements,
and deliberately does not implement tables/endpoints for features that have
no real frontend yet (knowledge, workflows, integrations, billing) — see the
"Isolate demo data" rule below.

## Commands

**pnpm only.** `packageManager` in the root `package.json` pins it. Running
`npm install` anywhere in this tree creates a `package-lock.json` that fights
`pnpm-lock.yaml`, and pnpm then quarantines the npm-installed packages into
`node_modules/.ignored`. If that happens: delete the stray lockfile and
`node_modules`, then `pnpm install` from the root.

Workspace scripts filter by **directory** (`--filter ./client`), not by package
name. `client/package.json` is named `humanoid`, so `--filter client` matches
nothing and pnpm exits 0 — which meant `pnpm lint` silently skipped the entire
frontend for as long as it existed. Keep the `./` prefix.

```bash
pnpm install                    # once, from the root — installs both packages
pnpm dev                        # both dev servers in parallel (client:3000, backend:4000)
pnpm --filter ./client dev      # frontend only
pnpm --filter ./backend dev     # backend only
pnpm build                      # both production builds
pnpm lint                       # both linters
pnpm test                       # backend test suite (client has no test suite yet)
```

Backend setup (Postgres, env vars, migrations, seeding) is its own thing —
see `backend/README.md` before running it for the first time.

`pnpm-workspace.yaml` (root) must keep everything in `allowBuilds` set to
`true`, never left at pnpm's placeholder string `set this to true or false`
— that placeholder is not a boolean and makes `pnpm install` exit 1.
`unrs-resolver` needs its postinstall to select a native binary
(`eslint-config-next` depends on it); `@prisma/client`, `prisma` and
`@prisma/engines` need theirs to fetch query engine binaries; `argon2` needs
its postinstall to compile/select its native binary. If `pnpm install`
starts failing with `ERR_PNPM_IGNORED_BUILDS`, something new needs adding
here — run `pnpm approve-builds` and commit the result rather than guessing.

## Stack

**Frontend** (`client/`): Next.js 16 (App Router, Turbopack) · React 19 ·
TypeScript strict · Tailwind v4 (CSS-first `@theme`) · Motion · Radix ·
TanStack Query (server state) · Zustand (UI state) · cmdk · Lucide.

**Backend** (`backend/`): Fastify 5 · TypeScript strict (NodeNext ESM) ·
Prisma · PostgreSQL · `argon2` (password hashing) · `jose` (JWT) ·
`@fastify/websocket` (the ConversationRelay voice socket) · Vitest.
Chosen over Python because everything currently being built (auth, workspace
CRUD, onboarding persistence) is exactly what `architecture.md` already
suggests TypeScript/Fastify for — the AI-orchestration layer where Python's
ecosystem would actually matter doesn't exist yet.

## Frontend layout (`client/src/`)

```
app/
  globals.css              design tokens — the single source of colour/radius/type
  layout.tsx               fonts + pre-paint theme script + providers
  page.tsx                 entry point — calls bootstrapSession(), backend-authoritative
  (auth)/                  signup, login, verify (OTP), forgot/reset password — layout guards signed-in visitors away
  (onboarding)/            organization → industry → [section] (dynamic, per domain pack) → review → creating
  (app)/                   authenticated shell; loading.tsx + error.tsx are route-level
components/
  primitives/              generic, no domain knowledge
  domain/                  knows about conversations, control state, grounding
  auth/                    AuthLayout, OtpInput, OAuthRow
  onboarding/              OnboardingShell, ProgressRail, QuestionRenderer, IndustrySelector
  shell/                   sidebar, top bar, live rail, command palette
  screens/                 whole surfaces (incl. domain-dashboard.tsx, today-router.tsx)
  providers/
lib/
  interaction/tactile.ts   press feedback policy + press classification
  domain/types.ts          the object model (executable form of arch §5)
  domain/labels.ts         every enum → human copy. No raw enum reaches the UI.
  lexicon/                 industry terminology (arch §9 layer 1) — 10 industry packs
  domains/                 industry pack Layer 3: onboarding sections, dashboard config, nav
                            overrides, quick actions, per DomainPack (registry.ts). Hospitality is
                            the fully-authored reference; the other nine are short but real.
                            onboarded-workspace.ts bridges to the real backend (see rule 12).
  onboarding/schema.ts     normalized question schema + zod validation + renderer contract
  onboarding/routing.ts    resumeHref() + progress-rail step builder
  onboarding/bootstrap.ts  bootstrapSession() — the one backend-authoritative "where do I
                            belong" check, called at every real entry point
  services/contract.ts     the API contract — mock and HTTP both satisfy it
  services/mock.ts         mock impl for knowledge/workflows/etc. — intentionally still fake,
                            see "Isolate demo data" below. Delegates workspace identity to
                            onboarded-workspace.ts, and conversations/records/parties/employees
                            to their real-*.ts adapters, when a real onboarded tenant exists.
  services/auth/           contract + http.ts (real, default) + mock.ts (offline fallback)
  services/http/           the real backend client — client.ts (cookies + silent refresh-on-401),
                            workspaces.ts, onboarding.ts, ai-employees.ts, conversations.ts,
                            records.ts, parties.ts, review.ts
  mock/fixtures.ts         Northgate Health — fictional 3-site clinic group (the permanent demo tenant)
  tokens/                  motion + sound tokens
  store/                   preferences, scope, auth (local cache, not the security boundary),
                            onboarding (workspaceId + local cache, synced to backend at checkpoints)
  navigation.ts            three modes, capability-gated
  screen-registry.ts       every route's purpose + build status
```

## Rules that are easy to break

1. **No domain noun as a string literal in a component.** "Patient",
   "Appointment", "Call" all resolve through `useLexicon()`. This is what lets
   one app serve healthcare, hospitality, legal and the rest without forking.
   Interface chrome ("Save", "Filter") is ordinary copy and is *not* lexicon.

2. **No hardcoded colour in a domain component.** Use the semantic tokens.
   `ai` and `human` are reserved hues — nothing else may use them, because
   "who is in control" must never be answered by a colour that also means
   something else.

3. **Colour never carries meaning alone.** Every status renders colour + icon +
   text. See `components/primitives/status.tsx`.

4. **No confidence percentages.** Grounding states (`grounded`, `policy`,
   `inferred`, `unsupported`) and named blockers instead. See arch §3.2.

5. **No dead links, no fake buttons.** Every nav destination has an entry in
   `screen-registry.ts` and a route. Unbuilt surfaces render `PlannedSurface`,
   which states what the screen is for rather than mocking it.

6. **Autonomy is per capability, not per employee.** See `CapabilityGrant`.

7. **Left-anchor content; never `mx-auto` a reading column.** A centred measure
   in a wide pane leaves symmetric dead margin and reads as an unfinished page.
   Anchor to the navigation edge, cap the prose measure, and give width earned
   above `xl` a real job (live detail, context panel) rather than padding.

8. **Never wire press feedback into a component.** One delegated listener
   (`providers/tactile-layer.tsx`) classifies presses from roles and gives every
   control compression, haptics and optional sound. Adding an onClick sound to a
   component guarantees the feel diverges within a month. Override the tone with
   `data-tactile="commit"`; opt an element *and its subtree* out with
   `data-tactile="off"`. Call `tactile()` directly only where the DOM cannot see
   the interaction — a cmdk selection, a surface opening. Interface sound is a
   separate switch from alert sound and both are off by default; see `ui.md`
   § Press Feedback for why.

9. **Never add `build` to `.gitignore`.** `src/app/(app)/build` is a real route
   segment; an ignore entry makes Turbopack's watcher skip it and those routes
   404 in dev. This has already cost one debugging session.

10. **No industry conditional in a shared component, ever — including
    onboarding and the dashboard.** A `DomainPack` (`lib/domains/`) is the only
    place an industry id may appear. Components consume the resolved pack
    (`useDomainPack()`) or a rendered question (`QuestionRenderer`), never a
    raw id. Adding an 11th industry should touch `lib/domains/` and nothing
    else — if it doesn't, something leaked.

11. **A question is data.** `OnboardingQuestion` (`lib/onboarding/schema.ts`)
    doesn't know or care whether it came from a static domain pack or — later —
    a website/document-driven generator. `QuestionRenderer` renders the shape,
    not the source. Don't special-case a question type's rendering per pack;
    extend the schema instead.

12. **Northgate Health and a real onboarded tenant are two different
    identities, never merged.** `resolveOnboardedWorkspace()`
    (`lib/domains/onboarded-workspace.ts`) is the one place that decides which
    one a browser sees; it's an async, cached fetch against the real backend
    (`GET /me`) now, not a localStorage read — it overrides
    `getWorkspace`/`listLocations`/`getCurrentUser`, routes conversations to
    the real Twilio-backed data via `lib/domains/real-conversations.ts`, and
    zeroes whatever's still mock-only (approvals, usage) rather
    than mixing a chosen industry with Northgate's dental-clinic data.

13. **Isolate demo data behind explicit adapters — never fabricate a backend
    for a feature that isn't real.** Auth, workspaces, onboarding,
    conversations, records, the customer directory and review are real
    (Postgres-backed, `backend/`). Knowledge, workflows, integrations,
    live activity beyond a call's own transcript are not — and stay
    exactly as visible, intentional mock data (`lib/mock/fixtures.ts`,
    `lib/services/mock.ts`) rather than being given a fake-real backend that
    would make them indistinguishable from the parts that actually work. When a feature crosses from mock to real, it
    gets its own backend module and Prisma tables — it does not retroactively
    make the *other* still-mock features look more real by association.

14. **The frontend auth store (`lib/store/auth.ts`) is a local cache, not the
    security boundary.** The real session lives in httpOnly cookies the
    backend sets; the store only mirrors `status`/`email`/`name` for instant
    UI painting. Anywhere a routing decision actually matters — entry points,
    post-auth redirects — confirm against the backend via
    `bootstrapSession()` (`lib/onboarding/bootstrap.ts`), never trust the
    cached store alone. A stale or tampered local cache can't grant access to
    anything; it can only cause a wrong *paint*, briefly, until the real check
    resolves.

15. **Any component reading `useOnboarding()` (the zustand store) must
    hydrate it first, even outside the onboarding flow itself.** The store
    starts empty on every fresh page load until something calls `.hydrate()`.
    Every onboarding page already does this; `DomainDashboard` (rendered from
    `/today`, well outside `(onboarding)`) initially didn't, and silently
    rendered blank on a hard reload — `snapshot.industry` was `null` and the
    component's own early-return caught nothing wrong. Fixed, but the pattern
    is easy to reintroduce: any new consumer of this store needs the same
    `useEffect(() => hydrate(), [hydrate])` plus a `hydrated` guard before
    reading state from it, not just an assumption that whoever routed here
    already warmed it up.

## Mock data conventions

Timestamps are anchored to `MOCK_NOW`, not `Date.now()`, so server and client
render identically. `lib/utils/time.ts#now()` returns the anchor — use it rather
than `Date.now()` anywhere that renders. When the real API lands, `now()` becomes
`Date.now()` and relative times move to a client-only component.

The fixture user is **Tom Whitfield, an Operator**. He deliberately cannot see
Build mode — role-based navigation is real, not decorative. Switch
`currentUser` in `fixtures.ts` to exercise other roles.

## What is built

Foundation and shell: tokens, typography, motion, sound, press feedback, lexicon,
mock service layer, primitives, app shell (three capability-gated modes, scope
selector, live rail, spend indicator), command palette with keyboard layer, the
**Today** briefing, **Preferences**, and route-level loading/error/not-found.

**Phase 1:** the full signed-out → onboarded journey — signup, OTP
verification, login, forgot/reset password; organization setup → industry
selection → domain-specific onboarding (hospitality fully authored, nine
other packs short but real) → review → simulated workspace creation; and a
domain-adaptive dashboard that `/today` renders instead of the Northgate
briefing once onboarding completes. `lib/domains/` is the Layer-3 config
driving all of it — onboarding sections, dashboard metrics/activity/
attention/insights, nav label overrides, quick actions.

**Phase 1.5:** everything Phase 1 presented as functional is now backed by
`backend/` for real — real accounts (argon2-hashed passwords), real OTP
verification (random codes, hashed at rest, rate-limited, expiring), real
httpOnly-cookie sessions with rotating refresh tokens, real organizations/
workspaces/memberships in Postgres, real onboarding-session and per-question
answer persistence (resumable across devices, not just across a page
refresh), and a real versioned `AiEmployee` + `AiEmployeeConfigurationVersion`
record created from the onboarding answers on completion. Verified
end-to-end including a cross-device resume test: a second, cookie-less
browser context logging in with only email + password lands directly on the
correct, fully-configured dashboard, proving nothing depends on client-side
cache. Knowledge, workflows, live activity beyond a call's own transcript, and
every other telephony/AI-runtime-backed surface remain intentional,
clearly-isolated mock data — see rule 13 above.

**Twilio voice line** (`backend/src/modules/telephony/`): a real,
signature-verified inbound call that replies in a natural voice, using the
`AiEmployeeConfigurationVersion` onboarding wrote. This is the first thing that
consumes onboarding's output rather than just producing it.

The division of labour, which is the thing to keep straight:

| Twilio | telephony, speech recognition, speech synthesis |
| Groq | the language model, streaming, OpenAI-compatible endpoint |
| ElevenLabs | the voice — reached *by Twilio*, not by this backend |
| Humanoid | prompt, tenant config, turn logic, orchestration |
| Postgres | the canonical transcript |

`LLM_PROVIDER=openai` means the OpenAI *wire format*, not OpenAI the company.
Groq is the active provider and swapping it for Anthropic/Gemini/OpenAI is a
config change, not a code change. Don't "fix" it.

**No ElevenLabs key lives in this backend.** The realtime path is Twilio
ConversationRelay: one WebSocket per call carrying JSON *text* both ways, with
Twilio doing STT at one end and ElevenLabs TTS at the other. `ELEVENLABS_VOICE_ID`
and `ELEVENLABS_MODEL_ID` are identifiers naming a voice for Twilio to request;
and no ElevenLabs credential exists anywhere in this system — not in this
backend and not in the Twilio Console. ElevenLabs is a first-party
ConversationRelay TTS provider that Twilio bills for. Adding an ElevenLabs SDK call
here would mean audio transiting this process for no reason — see
`backend/README.md` § Realtime voice.

**Which tenant answers is decided by the number dialled** —
`workspaces.phone_number`, unique, resolved by `resolveEmployeeForCall()`.
`AI_EMPLOYEE_WORKSPACE_ID` is a fallback for unclaimed numbers, and "most
recently configured employee anywhere" is the last-resort dev convenience that
answers as the wrong business as soon as a second tenant exists. Don't reorder
those rungs, and don't quietly reintroduce the global lookup as the default.

Three rules in that module are easy to break:

- **Anything in `content` gets read aloud.** Some reasoning models put their
  thinking there rather than in a separate field, so an unguarded call opens
  with the employee saying "Here's a thinking process: 1. Analyze User Input".
  `LLM_REASONING_EFFORT=none` prevents it and `ReasoningStripper` (`llm.ts`)
  catches it; don't remove either because output "looks clean" on the model
  you happened to test.
- **A superseded turn must never reach the caller.** Barge-in is enforced by a
  turn id checked on every outbound frame, not by the AbortController alone —
  aborts are asynchronous. See `voice-session.service.ts`.
- **What gets persisted is what the caller *heard***, not what the model wrote.
  On an interruption Twilio's `utteranceUntilInterrupt` wins over our own
  accumulation, and it feeds the model's context too.

`VOICE_RELAY_ENABLED=false` reverts to the older synchronous `<Gather>` loop
(Twilio's built-in TTS, no barge-in, seconds of dead air per turn). It is kept
as a degradation path, not as the main road.

**Records are now real too** (`backend/src/modules/records`, `records` table).
`create_booking` is a tool the model can call mid-turn, and
`lib/domains/real-records.ts` maps what it writes onto the same `DomainRecord`
the Northgate fixtures use — so `/records` renders a real tenant's actual
bookings, in its own industry's words, and Northgate keeps its own. This is
the first thing an AI employee *does* rather than says. A caller can also
change what they booked: `find_bookings`, `reschedule_booking` and
`cancel_booking` are the other three tools in `telephony/booking-tool.ts`, and
two rules in them are the reason they exist at all.

- **Rescheduling moves the row.** With only `create_booking` available, a
  caller ringing back to move Thursday to Friday got a *second* booking and
  the first stayed confirmed — two tables held for one party, and a transcript
  that reads like a good call. Never re-add a cancel-then-create path.
- **Nothing is guessed.** Bookings are found by the caller's own number, never
  by a spoken reference; an ambiguous or unmatched request comes back as the
  list of what they actually have, for the employee to confirm out loud before
  anything is written.

**And now there is a diary to check** (`backend/src/modules/schedule`,
`business_hours` + `schedule_exceptions` + `booking_policies`). Before it,
`create_booking` wrote whatever the caller said — three in the morning at a
clinic that opens at eight, the twentieth table at a restaurant that seats
twelve — confirmed aloud, landing in `records` looking like a good booking,
and invisible until somebody arrived at a locked door. `check_availability` is
the fifth tool, and the one the prompt used to explicitly forbid.

Two rules hold the whole module up, and both are about not overclaiming:

- **An unconfigured schedule is not a closed business.** Every workspace
  predating this has no rows in any of the three tables, and books exactly as
  it always did. Had "no rows" meant "shut", this would have taken every
  tenant's phone line down on deploy — the same failure `shouldAnswerCall()`
  fails open to avoid. Each check is independently skippable and a verdict
  reports which ones actually ran.
- **An unchecked slot is never reported as a free one.** "I cannot see the
  diary" and "that time is available" are different sentences. The middle
  state is the one a real tenant sits in longest: hours set but no capacity
  means the employee knows it is *open* at seven and knows nothing about
  whether there is room, and `buildSystemPrompt` says exactly that. Three
  distinct prompt states, asserted in `test/availability.test.ts`.

A prompt is not an enforcement point, so `create_booking` and
`reschedule_booking` re-run the check themselves before writing. It fails open
on error — a clash staff can resolve costs less than refusing a paying caller
over an outage they cannot see. Nothing in the app writes a schedule yet:
`pnpm --filter ./backend schedule:set` is the deliberate manual step until
`/govern/channels` is real.

What is still missing behind it: no named resources. `resourceId` comes back
null rather than invented — "room 4", "chair 2", "Dr. Patel" is a bigger
schema than a per-slot count, and a half-built version would let the employee
promise a specific table it cannot hold. One `durationMinutes` covers every
booking a tenant takes, so a practice with 15-minute consultations and
90-minute procedures needs the resource model before it can be described
honestly.

**A booking keeps the name it was taken under, permanently.**
`records.party_name` is written at creation and never rewritten, and the
frontend renders *that* (`record.partyName`), falling back to the directory
only where the record never carried a name. The two are usually the same
person; where they disagree the record wins. One phone can belong to a
household, so a second caller from it renames the *party* — their name is
`ai_inferred`, and the newest transcription wins until a human settles it —
while every booking already made keeps whoever made it. Rendering
`party.displayName` on a booking row is the bug this replaced: it made
Ahmed's Thursday appointment silently become Asha's the moment she rang from
the same phone.

**Spend is metered, and the cap actually bites**
(`backend/src/modules/usage`, `call_usage` table, `workspaces.budget_month_minor`
/ `at_cap`). `/govern/usage` reads a real tenant's own calls through
`lib/domains/real-usage.ts`; Northgate keeps its fixture. The distinction this
module exists to hold, and the one to keep straight before changing anything
in it:

- **Units are measured.** Connected seconds come off the call; token counts
  come from the model provider's own usage report (`stream_options.include_usage`
  on the OpenAI-compatible path, `response.usage` on Anthropic's).
- **Money is arithmetic.** Those units times rates someone typed into `.env`
  (`USAGE_RATE_*`). Twilio invoices the telephony and the model provider
  invoices the tokens, and **neither invoice is readable from inside this
  backend.** Nothing here is a bill.

So `UsageSnapshot.meter` carries the derivation — minutes, tokens, rates — up
to the screen, which renders the working rather than asserting a total. A null
meter means "stated, not measured", which is exactly what the Northgate fixture
is. Don't collapse the two, and don't let a metered figure be described
anywhere as an invoice or an amount that will be charged.

The cap is enforced, not merely stored: `shouldAnswerCall()` runs on every
inbound call and a workspace that chose *stop answering* and has reached its
budget does not get an AI employee on the line. It fails open — a metering
outage must never take a business's phone line down. **`voicemail` is refused
rather than saved**, because there is no voicemail box, and the option renders
unselectable *with its reason* rather than being hidden — §3.11's hard-block
rule, now also carried by `ChoiceCards`' `unavailableReason`. Two undercounts
are known and deliberate: a barged-in turn's tokens (no provider reports usage
on a cancelled request) and calls closed by the stale sweep (which never
connected). Both err low. See `backend/README.md` § Usage and the spend cap.

The boundary rule 13 draws is worth stating precisely: the call itself is
real, and now so is its record — every turn is persisted to Postgres through
`backend/src/modules/conversations` (`Conversation`, `CallSession`,
`ConversationMessage`) as it happens, not reconstructed afterwards. Neither
Twilio's nor ElevenLabs' own history is ever read back to rebuild a
transcript. The in-memory session keyed by CallSid still exists, but only as
the model's working context for the live call; Postgres holds the durable
transcript. What's still missing is everything downstream of the transcript —
no calendar, knowledge base, or customer records behind it, so the employee
can promise a follow-up, not take an action; no live control handoff,
grounding citations, or procedure run, because none of that machinery exists
for a real call yet. See `backend/README.md` § Twilio inbound speech test,
§ AI receptionist and § Realtime voice.

Auth and onboarding routes are not in `screen-registry.ts`: that registry is
specifically the shell's *navigable* surface inventory, and these routes
exist before a shell does.

`screen-registry.ts` is the live inventory of which surfaces under `(app)` are
`built` and which still render a `PlannedSurface` placeholder — read it rather
than trusting a prose list here to stay current.

**The customer directory is real too** (`/customers`,
`components/screens/party-directory.tsx`; `backend/src/modules/parties`,
`parties` + `party_facts` tables). A master-detail directory titled from the
lexicon (Patients, Guests, Clients), whose job is the one in the registry —
confirming or correcting what the AI believes about a person. Facts are
grouped and tinted by provenance rather than by field, consent is stated as
the behaviour it causes ("playback is blocked for everyone") rather than as a
flag, and a call/record history is interleaved from
`listConversations({ partyId })` and `listRecords({ partyId })` — both of
which now return real rows, because `conversations.party_id` and
`records.party_id` are real columns the voice pipeline fills in.
`lib/domains/real-parties.ts` is the adapter, and Northgate keeps its own
patients per rule 12.

Three things decide how honest this screen is:

- **Identity is the caller's number, and nothing else.** A withheld number
  produces *no* directory record — a row we could not recognise on the next
  call is not a customer record, it is a duplicate waiting to happen. The
  booking such a caller makes still carries the name and number they gave, on
  `records`, and `partyId` comes back null rather than invented.
- **A human decision outranks a transcription, permanently.** The one fact a
  call produces is the caller's name, and it lands as `ai_inferred` because it
  came through speech recognition. Once somebody confirms or corrects it, a
  later call mishearing it must never overwrite them — `noteName()` in
  `party.service.ts` is where that is enforced.
- **Consent is deliberately blank.** Nothing records calls and nothing asks
  about marketing, so both answers are `unknown`, which the screen already
  words as "never asked, treated as declined until it is". A consent column
  nothing writes would make an unasked question look like an answered one.

What is still missing behind it: no imported facts (nothing connects to a
practice-management system), no identifier verification or hashing
(`database.md`'s `customer_identifiers`), no staff notes, and no merge — two
numbers belonging to one person stay two records until something real can
decide they are the same person.

**Conversations** (`/conversations`, `/conversations/[id]`,
`components/screens/conversations-list.tsx` +
`conversation-detail.tsx`) is built and, for a real onboarded tenant, reads
real data: `lib/domains/real-conversations.ts` calls the backend's
conversations module and maps its transcript-and-outcome shape onto the same
`Conversation` type the rest of the frontend renders, filling in whatever the
Twilio pipeline can't yet produce (live control, actions, procedure run,
interventions, sentiment) with honest empty values rather than invented ones.
Northgate keeps rendering its full fixture data unchanged, including the
richer sections a real call can't populate yet — the two never mix, per rule
12. This is the first screen where "mock vs. real" is decided per request
rather than per workspace.

**The AI employee roster and the Authority Matrix** (`/build/employees`,
`/build/employees/[id]`, `components/screens/employee-roster.tsx` +
`employee-detail.tsx`) is built, and is the second surface to decide mock vs.
real per request: `lib/domains/real-employees.ts` maps the `AiEmployee` and
`AiEmployeeConfigurationVersion` rows onboarding writes onto the same
`AIEmployee` type Northgate's fixtures use. What the real record cannot yet
carry — an authority matrix, grants, a voice, a deployment — comes back empty
and the screen says so, rather than borrowing Maya's. The two configured facts
onboarding *does* capture (communication style, escalation triggers) are stored
as option ids and resolved back into the words the business saw through the
pack that asked the question, so the industry knowledge stays in
`lib/domains/` per rule 10.

Three things about it are worth knowing before changing it:

- **`lib/domain/employees.ts` owns the capability catalogue.** `CapabilityId`
  tokens contain domain nouns (`book_visit` is "Book an appointment" in a
  clinic and "Book a reservation" in a hotel), so capability copy is a function
  of the lexicon and lives there rather than in `labels.ts` — which is
  explicitly for enums that read the same in every industry. Use
  `withArticle()` and `lower()` from `lib/lexicon` for anything interpolating a
  term; a hand-rolled `toLowerCase()` turns "AI employee" into "ai employee".
- **The matrix is banded by consequence, not listed by capability.** Bands
  answer "what happens without me" — does it alone / asks first / drafts /
  never / not part of its job / cannot be switched on — and `authorityBands()`
  derives them so the roster's one-line summary and the detail matrix cannot
  disagree.
- **Every catalogue capability gets a row, granted or not.** §3.11 requires
  hard blocks to be rendered with their reason rather than hidden, and a review
  listing only what was switched on cannot answer "can it take card details?".
  A grant's own `hardBlockReason` is employee-specific and wins on the detail
  page; the roster rail uses the catalogue's roster-wide reason instead.

Nothing on either screen writes. Authority changes land in a draft and go live
through Releases, which both screens link to and say so.

**People & roles** (`/govern/people`,
`components/screens/people-roles.tsx`) is built, and it is the screen that
makes rule 6 legible for humans rather than AI employees: **a role is a
summary, a capability is the fact.** `lib/domain/people.ts` owns the
capability catalogue, the four presets, and the copy for all three — the label,
the one-line purpose and the granted set are one authored unit, so a preset
cannot quietly change what it grants without changing what it is said to be.
That is why role copy lives there rather than in `labels.ts`.

Four things about it are worth knowing before changing it:

- **The rota comes before the list of people.** A workspace with immaculate
  roles and nobody rostered at 19:40 is broken in a way a permissions grid
  never shows. `resolveCover()` derives who answers *and for how long* from the
  rota rather than from `User.onCall`, which is only a badge; `hasCoverageGap()`
  is what surfaces "an escalation after 18:42 reaches nobody".
- **Where the badge and the grant disagree, the disagreement is the finding.**
  `roleDrift()` compares a person's actual `capabilities` against their
  preset, and `escalationGaps()` asks the sharper question — is the person
  rostered to take calls actually granted `conversation.takeover`? A row
  reading "Operator" beside "backup" implies they can pick up tonight; only
  the grant knows.
- **Two writes, both guarded in `mock.ts` rather than only in the screen.**
  Assigning a preset replaces the grant entirely (which is what clears drift),
  and handing over the pager re-points the rota and derives `User.onCall` from
  it. The service refuses self-demotion and refuses to strip the last owner, so
  the screen is built against something that says no — when this reaches a real
  backend the identical checks belong on the server. Session-lived per rule 13.
- **A role button is disabled when assigning it would change nothing —
  not when it is the role they already wear.** Someone badged Operator while
  missing half the set has a live repair on the Operator button, and that
  repair is exactly what the drift note tells them to press. Assignment arms
  before it commits, and `presetDelta()` names the consequence in gained and
  lost capabilities rather than in role names, because the role name is the
  thing that was already misleading.

**Review is real too** (`backend/src/modules/review`, `review_issues` +
`review_issue_events`). The screen's premise is that a row is a *cause* and
not an incident — "you fix the missing answer once, not the forty-three calls
it affected" — so the table is keyed on a `cause_key` and the forty-third
occurrence joins the first rather than opening a duplicate. Two things raise
one: `flag_unresolved`, a tool the employee calls mid-turn when it hits
something it cannot handle (the counterpart to `create_booking` — one is doing
something, this is reporting what it could not do), and the outcome code a
call ends on. `lib/domains/real-review.ts` maps them onto the same
`ReviewIssue` the Northgate fixtures use, so `/review` fills with a real
tenant's own dead ends and Northgate keeps its own.

Four decisions in it are worth knowing before changing anything:

- **The model raises the flag, not a phrase match over the transcript.** Only
  the model knows whether "I'll have a colleague ring you back" was a real
  dead end or a polite way of closing a question it had already answered. A
  matcher files both, and a queue full of false causes is one nobody reads.
- **Flagging is silent.** The tool's reply tells the model in as many words to
  say nothing about it and carry on helping. "I've logged that for the
  business" is not a service, and a test asserts that instruction is still
  there.
- **Severity is derived, never stored**, from the cause and how many calls it
  has touched — a column would leave a cause filed "low" on its first call
  still reading "low" on its hundredth.
- **`abandoned` is deliberately not a cause.** That is the stale-call sweep
  closing a row whose media socket never arrived: someone ringing off while it
  rang, which is not a failure of anything the employee did.

What it deliberately never raises is the other six `IssueCause` values —
`conflicting_knowledge` and `stale_knowledge` need a knowledge base for
sources to disagree, the two procedure causes need procedures, and the two
autonomy causes need an authority matrix. `proposedFix` is null on every real
cause for the same reason: drafting the words an employee should say instead
means knowing the business's actual answer, and nothing here knows it. The
issue detail already says "someone has to decide what the AI should say or do
instead", which is exactly true. See `backend/README.md` § Review.

Next up is the rest of the first vertical journey per arch §13 Phase 5: AI
employee configuration → knowledge → procedure → voice → simulation →
readiness → publish → test call → conversation timeline → appointment created.
Its two ends now exist for real — onboarding writes the employee, the Twilio
line answers with it, `/build/employees` reviews what it may do, and
`/conversations/[id]` shows what it said. What is missing is the middle: real
knowledge, procedures, a voice studio and a readiness gate behind their own
backend modules, and — the thing every empty band on the employee detail is
pointing at — an authority matrix a real tenant can actually be given.

## Next.js agent rules

`client/AGENTS.md` (auto-regenerated by `next dev`, referenced from
`client/CLAUDE.md`) carries the Next-16-specific warning that used to live at
the bottom of this file. Read it before touching anything under `client/` —
this file no longer duplicates it, since it moved with the frontend when
`client/` and `backend/` split out.

<!-- END:nextjs-agent-rules -->
