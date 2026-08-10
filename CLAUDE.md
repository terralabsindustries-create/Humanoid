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
or `pnpm --filter client <script>` / `pnpm --filter backend <script>` for
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
no real frontend yet (conversations, knowledge, workflows, integrations,
billing) — see the "Isolate demo data" rule below.

## Commands

**pnpm only.** `packageManager` in the root `package.json` pins it. Running
`npm install` anywhere in this tree creates a `package-lock.json` that fights
`pnpm-lock.yaml`, and pnpm then quarantines the npm-installed packages into
`node_modules/.ignored`. If that happens: delete the stray lockfile and
`node_modules`, then `pnpm install` from the root.

```bash
pnpm install                    # once, from the root — installs both packages
pnpm dev                        # both dev servers in parallel (client:3000, backend:4000)
pnpm --filter client dev        # frontend only
pnpm --filter backend dev       # backend only
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
Prisma · PostgreSQL · `argon2` (password hashing) · `jose` (JWT) · Vitest.
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
  services/mock.ts         mock impl for conversations/knowledge/etc. — intentionally still fake,
                            see "Isolate demo data" below. Delegates workspace identity to
                            onboarded-workspace.ts when a real onboarded tenant exists.
  services/auth/           contract + http.ts (real, default) + mock.ts (offline fallback)
  services/http/           the real backend client — client.ts (cookies + silent refresh-on-401),
                            workspaces.ts, onboarding.ts, ai-employees.ts
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
    `getWorkspace`/`listLocations`/`getCurrentUser` and zeroes the live-data
    endpoints (a fresh workspace has taken no real calls) rather than mixing a
    chosen industry with Northgate's dental-clinic conversations.

13. **Isolate demo data behind explicit adapters — never fabricate a backend
    for a feature that isn't real.** Auth, workspaces, and onboarding are real
    (Postgres-backed, `backend/`). Conversations, knowledge, workflows,
    integrations, live call activity are not — there's no telephony or AI
    runtime yet — and stay exactly as visible, intentional mock data
    (`lib/mock/fixtures.ts`, `lib/services/mock.ts`) rather than being given a
    fake-real backend that would make them indistinguishable from the parts
    that actually work. When a feature crosses from mock to real, it gets its
    own backend module and Prisma tables — it does not retroactively make the
    *other* still-mock features look more real by association.

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
cache. Conversations, knowledge, workflows, live activity, and every other
telephony/AI-runtime-backed surface remain intentional, clearly-isolated mock
data — see rule 13 above.

Auth and onboarding routes are not in `screen-registry.ts`: that registry is
specifically the shell's *navigable* surface inventory, and these routes
exist before a shell does.

Everything under `(app)` other than Today and Preferences is still a
`PlannedSurface` placeholder. Next up is the first vertical journey per arch
§13 Phase 5: AI employee configuration → knowledge → procedure → voice →
simulation → readiness → publish → test call → conversation timeline →
appointment created — i.e., making the rest of the shell as real as the
onboarding path that now feeds it, and giving each new real feature its own
backend module the same way onboarding got one.

## Next.js agent rules

`client/AGENTS.md` (auto-regenerated by `next dev`, referenced from
`client/CLAUDE.md`) carries the Next-16-specific warning that used to live at
the bottom of this file. Read it before touching anything under `client/` —
this file no longer duplicates it, since it moved with the frontend when
`client/` and `backend/` split out.

<!-- END:nextjs-agent-rules -->
