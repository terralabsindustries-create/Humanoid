# Humanoid — Product Interface Architecture (Phase 1)

**Status: v1.0 — Approved, canonical.** This document is the architectural baseline for Humanoid's frontend. Any change to the decisions in §3, §7, §9, or the resolved items in §12 requires a change request (see Change Log below), impact review against the sections it touches, and a version bump — not a silent edit.
Companion docs: `vision.md`, `ui.md` (visual system), `architecture.md` (system), `ai.md`, `api.md`. Phase 2 continues in `screen-architecture.md`.

**Change log**
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-07 | Initial approval. All five items in §12 resolved per stakeholder decision (handoff → ours, design partner → multi-location, outbound → out of v1, telephony → resell + BYO later, first vertical → healthcare). No architectural changes required — all resolutions matched the stated defaults. |
| 1.1 | 2026-08-08 | **Supersedes §3.5/§3.6/§9's onboarding-implication for Phase 1 build only.** A detailed product spec called for a structured, section-by-section onboarding wizard with an explicit industry-selection screen — the opposite of the Discovery Console's chat-plus-canvas model and its "industry is inferred from the website, never asked first" rule. Built as specified rather than silently reconciled, because the spec was exhaustive and clearly deliberate. The normalized onboarding question schema (`lib/onboarding/schema.ts`) is deliberately AI-source-agnostic — a question is data whether it came from a static domain pack or a future website/document-driven generator — which is what lets a later Discovery Console generate into the *same* renderer instead of requiring a rebuild. Treat this as the live decision for the onboarding UX until it is revisited; the Discovery Console concept is not deleted, only superseded in the running build. |

---

## 1. Product interpretation

Humanoid is not a customer support product. It is a **supervisory control system for autonomous agents that speak to customers and take real business actions in real time.**

That framing changes almost everything about the interface. The relevant design ancestors are not Zendesk or Intercom. They are:

- **Autopilot and flight-deck design** — the entire discipline of preventing *mode confusion*: the operator must never be uncertain about who is flying the aircraft, what the automation is currently doing, and how to take control instantly.
- **Network operations centres** — calm monitoring of many concurrent live processes, where the interface must stay quiet until something matters and then be unmissable.
- **Deployment platforms (Vercel, Stripe)** — versioned configuration, staging vs production, diffs, publish, rollback, audit. An AI employee is a deployed artefact, not a settings page.

The product's core value is not "the AI answers the phone." Anyone can ship that. The value is that **a business owner can trust an AI to answer the phone**, and trust is manufactured by the interface: by what it lets you constrain before deployment, what it shows you during, what it lets you correct after, and how reliably you can undo.

So the organising idea for the whole frontend is the **trust ladder**:

| Rung | User question | Where the product answers it |
|---|---|---|
| 1. Comprehension | What will it do? | Authority Matrix, Procedures, Readiness Review |
| 2. Constraint | What can't it do? | Autonomy levels, limits, forbidden actions, policy gates |
| 3. Rehearsal | Does it actually work? | Simulator, scenario suites, readiness gate |
| 4. Observation | What is it doing now? | Live rail, Operations Wall, conversation stream |
| 5. Intervention | Can I stop it? | Barge-in, takeover, pause employee, kill switch |
| 6. Explanation | Why did it do that? | Conversation timeline, grounding, action provenance |
| 7. Correction | Can I fix it without an engineer? | Review Issues → Draft → Simulate → Publish |
| 8. Delegation | Can I give it more rope? | Autonomy promotion recommendations backed by evidence |

Every screen we design should be locatable on this ladder. A screen that isn't on it is probably a generic dashboard and should be cut.

**The second organising idea:** the product must be usable on day one, when there is no data. Most AI operations products are beautiful at month six and empty at hour one. Onboarding must therefore *produce* the operating picture — a proposed business model, a proposed employee, simulated conversations, a readiness score — before a single real call exists.

---

## 2. Assumptions

Stated so they can be corrected rather than blocking the work.

1. **First design partner is a multi-location SMB / mid-market clinic group** (3–15 locations, 5–50 staff), not a single-site owner-operator and not a Fortune 500. This sets nav depth: Location is a real scoping dimension from day one, but the org hierarchy stays two levels (Organisation → Location), with Department as a tag rather than a tree.
2. **Inbound voice is v1.** Outbound calling, campaigns, and dialer compliance (TCPA, DNC, calling windows) are designed for but not built in the first vertical. Chat/SMS/WhatsApp/email are second-class in v1 but the Conversation object is channel-agnostic from the start.
3. **We resell telephony numbers in-app** (Twilio-class provider behind the scenes), with BYO-carrier SIP as a later path. Number provisioning is therefore a purchase flow inside deployment, not an integration.
4. **Human handoff lands in Humanoid's own agent surface** for v1, with warm transfer to an external phone number as the fallback. If handoff must land in the customer's existing helpdesk instead, Section 7's Operate mode shrinks substantially — see Open Questions.
5. **Healthcare is the first vertical pack**, so consent, recording law, retention, and PHI handling are treated as blocking deployment gates from v1 rather than as later settings.
6. **The AI never handles raw card data by voice.** Payment is either a transfer to a secure IVR/agent or an outbound payment link. This is a product boundary, not a toggle.
7. **The AI always discloses it is an AI when asked, and announces recording where law requires it.** Disclosure behaviour is a policy with jurisdiction defaults, not a persona preference.
8. **English first, with language detection and switching designed into the voice layer.** Interface localisation (including RTL) is architected for but shipped later.
9. **Real-time transport is a live socket with graceful degradation to polling.** Degraded and offline are designed states, not error toasts.
10. **Config changes are versioned and published, never applied live silently.** See §5.4.

---

## 3. Where I am changing the brief

These are the decisions I'd want signed off before Phase 2. Each one is a place where following the brief literally would produce a worse product.

**3.1 — The AI employee must not own its knowledge, workflows, or tools.**
The brief hangs knowledge, workflows, permissions, and voice off each employee. That works for one employee and collapses at two. A hospital will run a reception AI, a billing AI, and a follow-up AI, and all three need the same insurance policy, the same address, the same cancellation rule. If those live inside employees, they will drift, and drift in a system that talks to patients is a correctness bug.

**Correction:** Knowledge, Procedures, Tools, Policies, Voices, and Numbers are **workspace assets**. An AI Employee is a *persona plus a set of grants* over those assets. This mirrors how real employment works — an employee doesn't own the company handbook, they're given access to it. It also makes multi-location and multi-employee scaling a grant problem instead of a copy problem.

**3.2 — "Confidence" as a percentage is a trust bug. Replace it with grounding + named blockers.**
A `94%` next to a wrong answer destroys more trust than showing nothing. Business owners cannot calibrate model probabilities, and a number invites false precision.

**Correction:** every AI answer or action carries a **grounding state** — `Grounded` (traced to an approved source, citation shown), `Policy-directed` (followed an explicit rule), `Inferred` (composed from context, no single source — flagged), `Unsupported` (no source; AI declined or escalated). Every escalation is attributed to a named **blocker**: identity unverified, ambiguous intent, conflicting sources, tool failed, out of scope, policy required human, customer requested human. Blockers are actionable — each maps to a specific fix. Numeric confidence still exists in the data model and is exposed in Studio at the developer disclosure level as a distribution, never as a headline number to an owner.

**3.3 — Eleven top-level nav items, mixing daily and quarterly surfaces.**
Home / Live / Conversations / Customers / AI Employees / Knowledge / Workflows / Analytics / Quality / Integrations / Settings mixes things touched hourly with things touched twice a year, and Home, Analytics and Quality will overlap into three places to look for the same problem.

**Correction:** three workspace **modes** — Operate, Build, Govern — each with five or six sections. See §7.

**3.4 — "Live" should not be a top-level page.**
For a dental clinic, a dedicated Live page is empty most of the day. A nav item that's usually empty trains people to stop clicking it, which is fatal for the one surface that must never be ignored.

**Correction:** Live becomes (a) a **persistent live rail** in the shell, present in every mode, showing active / waiting / needs-approval counts and expanding into a stream; and (b) a full-screen **Operations Wall** mode for people whose entire job is monitoring, and for the office display. The rail is always where you look; the Wall is a mode you enter.

**3.5 — A purely conversational onboarding is a trap.**
Chat-only onboarding is slow, unskippable, gives no overview, is miserable to resume, and is terrible on mobile. It also hides progress, which is exactly what an anxious buyer needs to see.

**Correction:** the **Discovery Console** — a split surface where the AI interview is the *input method* and a live-building **Business Model canvas** is the *product*. Every object the AI proposes (service, location, hour, policy, intent, risk) appears on the canvas immediately and is directly editable. The user can abandon the conversation at any point and edit the canvas by hand, or paste a website and skip ahead. The conversation is a convenience, never a gate.

**3.6 — Don't open with "what kind of business do you operate?"**
Asking for what we can infer wastes the first, most important thirty seconds.

**Correction:** onboarding opens with a single input — **website URL or existing business phone number** — and we return a proposed business model with sources cited. The first screen after signup should feel like the system already did homework. Ask only for what genuinely cannot be inferred, and mark inferred facts as unverified until confirmed.

**3.7 — A node-graph workflow canvas is the wrong default representation.**
Non-technical owners cannot maintain node graphs. They can read and edit a written procedure.

**Correction:** the primary representation of a workflow is a **Procedure** — a structured, mostly-linear outline with explicit branches, that reads like a written SOP ("Ask for date of birth. If no match, escalate to front desk."). The visual map is a secondary view for complex procedures and for debugging execution paths. Execution history is a third view. Same object, three renderings, outline first.

**3.8 — Sentiment is a weak headline metric.**
Sentiment scoring is noisy, culturally biased, and rarely tells you what to change.

**Correction:** headline outcome metrics are **Outcome** (resolved / escalated / abandoned / failed) and **Effort** (clarification turns, repeats, time to resolution, transfer count). Sentiment stays as a per-conversation signal and an escalation trigger, not a KPI on the home screen.

**3.9 — Two inboxes will be built by accident. Prevent it now.**
The brief describes a "priority review queue" on Home and a separate "Quality and Improvement" area. These will diverge into two work queues with two states of read/unread and users will trust neither.

**Correction:** there is exactly one queue, **Review**. Home shows the top of it. And Review is organised by **Issue (root cause)**, not by instance: you review "No approved answer for *do you accept Medicaid*" affecting 43 conversations, not 43 separate items. Each Issue carries evidence conversations, blast radius, a proposed fix, and a mandatory simulate-before-publish step.

**3.10 — Configuration must be versioned, with a publish step and rollback.**
The brief implies live configuration editing. An AI whose behaviour silently changed and nobody knows why, mid-day, while it is on the phone with a patient, is the worst failure mode this product has.

**Correction:** every AI Employee has a **Draft** and a **Live** version. Changes accumulate in Draft. Publishing requires passing the readiness gate, shows a **diff** ("cancellation window 24h → 48h; added tool: send SMS confirmation; autonomy for *reschedule* raised to Act freely"), records who/what/why, and is **rollback-able in one action**. Review fixes flow into Draft, so improvements batch into a release instead of mutating a live agent.

**3.11 — Autonomy belongs to the capability, not to the employee.**
"Is the AI allowed to act?" is not a single switch. It is a per-capability decision that changes over time.

**Correction:** the **Authority Matrix** — for each capability granted to an employee, one of five autonomy levels:

| Level | Meaning |
|---|---|
| **Observe** | Never performs; may mention it exists |
| **Suggest** | Drafts the action for a human to send/confirm |
| **Approve** | Performs only after a named human approves, in-call or async |
| **Act** | Performs within stated limits, logged |
| **Act + notify** | Performs and pushes a notification to a named owner |

Every capability also carries **limits** (per-call, per-day, value caps, time windows, customer segments) and **hard blocks** (the class of things a business owner cannot enable alone — payment card capture, clinical advice, legal advice, identity override). The Authority Matrix is the single screen an owner reviews before going live, and it is the thing that makes this credible as a workforce OS rather than a chatbot builder.

**3.12 — Cost must be visible in the shell, not buried in Billing.**
Per-minute voice cost is the number one anxiety of every buyer of this category. Hiding it reads as a trap.

**Correction:** a live spend indicator in the shell (today's spend, pace vs budget, cost per resolution), plus configurable budget caps with defined behaviour at the cap (notify / degrade to voicemail / stop). "What happens when I hit the cap" must be an explicitly chosen, visible policy.

**3.13 — Two additions the brief doesn't mention that I consider mandatory.**
- **On-call.** When the AI escalates at 19:40 and the front desk has gone home, someone must receive it. On-call rotation, fallback chains, and after-hours behaviour are product features, not settings trivia.
- **Kill switch.** One unmistakable, always-reachable control: pause this employee / pause all employees, with a defined fallback (voicemail, forward to a number, hold announcement). It should be reachable from the command palette and from mobile in two taps. Owners buy this product more easily when they can see the off switch.

---

## 4. Users

Seven personas means seven interfaces, which means none of them are good. The seven in the brief collapse cleanly into **three modes and four role presets**, with capability-based permission underneath.

### 4.1 Role presets

| Preset | Covers brief's persona | Default mode | Home lands on |
|---|---|---|---|
| **Owner** | Business Owner | Operate | Today briefing: outcomes, cost, top issues |
| **Operator** | Ops Manager, Customer Care Agent | Operate | Live rail expanded + Review queue |
| **Builder** | AI Manager/Trainer, Developer | Build | Draft employee + failing scenarios |
| **Governor** | Workspace Admin, Compliance Reviewer | Govern | Audit, access, retention, incidents |

Permissions are capability-based (`conversation.takeover`, `employee.publish`, `recording.listen`, `pii.reveal`, `autonomy.raise`, `billing.manage`), and presets are just named bundles. A single-owner clinic holds all four; an enterprise splits them.

Disclosure depth is a separate axis from role: **Standard / Advanced / Developer**. Developer adds raw latency, tool payloads, model/version identifiers, and numeric confidence. This is a per-user preference, not a role — a technical founder wants Developer depth in Owner role.

### 4.2 What each persona actually needs the interface to be

- **Owner** — needs to answer "is this working, is it safe, what is it costing" in under sixty seconds, and to approve the small number of decisions only they can make. Optimise for a *briefing*, not a dashboard.
- **Operator** — lives here all day. Optimise for density, keyboard, and zero-latency takeover. This is the Linear-shaped surface.
- **Agent (subset of Operator)** — arrives cold, mid-crisis, into someone else's conversation. Optimise entirely for *context on arrival*. The customer must never repeat themselves.
- **Builder** — needs a safe place to change behaviour and prove it works before it reaches a customer. Optimise for diff, simulate, publish, rollback.
- **Governor** — needs to reconstruct what happened after the fact, and to prove constraints existed before the fact. Optimise for immutable, exportable, complete records.

---

## 5. Object model

### 5.1 The spine

```
Organisation
 └── Workspace ─── Locations, Departments
      ├── AI Employee ──── Versions (Draft | Live | Archived)
      │     ├── Persona (name, role, voice, languages, style)
      │     ├── Grants ── Knowledge Collections, Procedures, Tools, Policies
      │     ├── Authority Matrix (capability → autonomy + limits)
      │     └── Deployments (channel + number/address + hours + fallback)
      ├── Conversation (channel-agnostic)
      │     ├── Turns / Transcript
      │     ├── Actions (tool calls, with provenance + result)
      │     ├── Procedure run (step state)
      │     ├── Grounding + blockers
      │     ├── Interventions (monitor / coach / takeover / transfer / return)
      │     └── Outcome → Records
      ├── Customer (Party) ── identity, consent, verified vs inferred facts
      ├── Records (archetype-typed: visit, case, lead, order, resource)
      ├── Review Issues ── clustered from evidence, carrying proposed fixes
      └── Audit Events (immutable)
```

### 5.2 Workspace assets (shared, granted — never owned by an employee)

Knowledge Collection · Knowledge Source · Knowledge Item · Procedure · Tool (an integration action, e.g. *create appointment*) · Integration (the connection) · Policy · Voice profile · Phone Number · Scenario Suite · Lexicon · Industry Pack.

### 5.3 The two objects that carry the product's differentiation

**Capability Grant** (rendered as the Authority Matrix). The tuple `(employee_version, capability, autonomy_level, limits, approvers, hard_blocks)`. This is where "what is the AI allowed to do" lives, singularly and reviewably. It generates the pre-deployment review screen, the approval requests during calls, the audit trail, and the autonomy-promotion recommendations.

**Review Issue.** A root cause with evidence attached, not an incident. `(cause_type, description, evidence_conversations[], blast_radius, proposed_fix, status)`. Cause types: missing knowledge, conflicting knowledge, stale knowledge, procedure gap, procedure error, tool failure, policy ambiguity, transcription failure, unclear scope, autonomy too low, autonomy too high. Fixing an Issue produces a Draft change, which must simulate green before publish. This is the improvement loop, and it is what makes the product get better without uncontrolled self-learning.

### 5.4 Record archetypes — the key to multi-industry without forking

Every industry in the brief resolves to six archetypes. We design and build **six record experiences**, not sixteen industry apps.

| Archetype | Hospital | Hotel | Law firm | Real estate | Auto service |
|---|---|---|---|---|---|
| **Scheduled visit** | Appointment | Reservation | Consultation | Viewing | Service booking |
| **Case** | Referral / issue | Service request | Matter | — | Repair order |
| **Lead** | New patient enquiry | Enquiry | Intake | Lead | Quote request |
| **Order** | Billing item | Folio | Invoice | Offer | Estimate |
| **Party** | Patient | Guest | Client | Buyer / Seller | Customer |
| **Resource** | Doctor / room | Room | Attorney | Property / agent | Technician / bay |

One list view, one detail view, one timeline per archetype — schema-driven fields, industry-supplied labels, statuses and columns. This is the right level of abstraction: generic enough to avoid sixteen apps, specific enough to avoid the Salesforce key-value mush.

### 5.5 Naming discipline

Internal object names never surface. `Conversation` → "Calls" / "Messages". `Party` → "Patients". `Procedure` → "Playbooks" or the industry term. `Capability Grant` → "What Maya can do". `Review Issue` → "Needs attention". Every user-visible noun passes through the lexicon layer (§9).

---

## 6. Core workflows

Eight journeys. Everything we build should serve one of them.

**J1 — Hire.** Signup → website/number ingest → Discovery Console interview → Business Model review (confirm/correct inferred facts) → proposed AI employee → Authority Matrix review → knowledge import → procedure confirmation → voice studio → simulation suite → readiness gate → number provisioning → publish. *Target: forty minutes to a working test call, with a save-and-resume at every step.*

**J2 — Watch.** Live rail → expand stream → open a live conversation → follow transcript, procedure step, current action → monitor silently.

**J3 — Intervene.** Barge-in (speak to customer) / coach (whisper to AI) / take over / warm-transfer / return control to AI. *Target: under one second from intent to being on the call. This drives real architectural decisions — the takeover path must be pre-warmed, not lazily loaded.*

**J4 — Handoff.** AI escalates with a named blocker → routed by rule/on-call → recipient gets an incoming-call-grade interruption → accept screen shows identity, reason, summary, verified facts, actions already taken, current procedure state, suggested next step, risks → resolve → return or close. *The customer never repeats themselves. This is the acceptance test for the whole surface.*

**J5 — Review.** Review queue (clustered Issues) → open Issue with evidence → judge → apply proposed fix or write your own → lands in Draft → simulate → publish.

**J6 — Improve.** Evidence accumulates → system proposes autonomy promotions ("*Reschedule appointment* has run 214 times with 0 corrections and 0 complaints — raise from Approve to Act?"), knowledge additions, and procedure changes → human approves, rejects, or edits. **Never applied automatically.**

**J7 — Explain.** Open any conversation → full timeline: what was said, what was understood, what source grounded each answer, which policy applied, which tool ran with which result, why it escalated, what data changed, who approved. Exportable. This is the compliance and the sales demo surface simultaneously.

**J8 — Govern.** Access, consent, retention, recording law, incident review, export, kill switch.

---

## 7. Information architecture and navigation

### 7.1 Three modes

A mode switcher in the shell, not eleven flat items. Each mode is a coherent job.

**OPERATE** — running the business today
- **Today** — the briefing (see §7.3)
- **Conversations** — unified inbox; Live is a filter, not a separate place
- **Records** — industry-named (Appointments / Reservations / Matters / Leads)
- **Customers** — industry-named (Patients / Guests / Clients)
- **Review** — the single work queue, clustered by Issue

**BUILD** — changing what the AI does
- **Employees** — roster, Draft/Live, Authority Matrix, personas, deployments
- **Knowledge** — sources, sync, coverage, conflicts, gaps, citations
- **Procedures** — outline-first workflows, execution history
- **Tools & Integrations** — connections, available actions, scopes, health
- **Simulator** — scenarios, suites, regression runs, replay
- **Releases** — diffs, publish, rollback, change history

**GOVERN** — control and accountability
- **Performance** — analytics that answer operational questions
- **Channels & Numbers** — telephony, WhatsApp, email, hours, fallbacks
- **People & Roles** — team, presets, capabilities, on-call
- **Compliance** — consent, recording law, retention, PHI/PII, policy violations
- **Usage & Billing** — spend, budget caps, cost per resolution, invoices
- **Workspace** — org, locations, departments, lexicon, brand, notifications

Five, six, six. Nothing over seven. Every item is a place a real person goes with a real intent.

**The honest risk with modes** is hunting — "which mode was Knowledge in?" Mitigations, all mandatory: the command palette and global search cross all modes and jump directly; any deep link auto-switches mode and says so in the breadcrumb; the Review badge and live rail persist in all three modes so the two urgent things are never mode-dependent; and workspaces below a size threshold can flatten Build+Govern into one list. If usability testing shows hunting anyway, the fallback is a flat eight-item nav with role-based hiding — but I'd rather ship modes and measure.

### 7.2 Persistent shell elements (present in every mode)

- **Scope selector** — Organisation / Location / Department. Scope is global and sticky; every list, metric and live count respects it. Getting this wrong for multi-location customers is a common and expensive mistake, so it belongs in the shell from v1.
- **Live rail** — collapsed strip: `3 live · 1 waiting · 2 need approval`. Expands to a stream. Colour plus icon plus number, never colour alone.
- **Review badge** — count of open Issues, weighted by severity.
- **Spend indicator** — today's spend and pace against budget.
- **Command palette (⌘K)** — navigation, search, and *actions*: take over a call, pause an employee, publish a release, run a scenario, open a customer. This is the primary navigation for power users; the sidebar is for discovery.
- **Global search** — across conversations, customers, records, knowledge, employees, audit.
- **Connection state** — telephony, integrations, socket. Degraded is a first-class visible state.
- **Environment banner** — Draft/Simulation chrome is visually unmistakable (§8).
- **Kill switch** — in the palette and in the employee header, always two actions away.

### 7.3 Today (the home screen)

Not a KPI card grid. An **operational briefing**, written in editorial prose with live numbers set inline, structured in four bands:

1. **Right now** — live conversations, callers waiting, approvals pending, anything broken. If nothing is happening, this band says so plainly and shrinks rather than showing empty cards.
2. **Since you last looked** — what the AI completed, in outcome terms: *"Maya handled 47 calls, booked 31 appointments, rescheduled 9, and escalated 4. Two escalations are still unresolved."*
3. **Needs you** — the top three Review Issues by blast radius, plus pending approvals. Each with a one-action path to resolution.
4. **Worth knowing** — trends that suggest a change: questions customers asked that we couldn't answer, a procedure whose failure rate is rising, an autonomy promotion the evidence now supports.

Owner and Operator get different band ordering and different levels of financial detail. Same data, different briefing.

### 7.4 Keyboard model

Linear-grade, non-negotiable for Operate. `⌘K` palette · `⌘1/2/3` modes · `g` then letter for sections · `j/k` list traversal · `↵` open · `⌘↵` primary action · `t` take over · `e` escalate/assign · `⌘⇧P` publish · `?` shortcut sheet. Every interactive element reachable by Tab with a visible focus ring. No action is mouse-only.

---

## 8. Application modes (states of the shell)

Distinct from navigation modes — these change how the shell itself behaves.

| Mode | Trigger | Behaviour |
|---|---|---|
| **Standard** | Default | Nav + content + optional overlay panel |
| **Focus** | `⌘.` or opening a conversation full-screen | Chrome recedes to a thin bar; one conversation dominates |
| **Wall** | Explicit; intended for a wall display | Full-screen live monitoring, larger type, no nav, no hover dependency, auto-refresh |
| **Handoff** | Incoming escalation | Interrupts like an incoming call: accept/decline, context loads *before* acceptance |
| **Simulation** | Entering the Simulator | **Distinct surface chrome** — different background tone plus a persistent edge treatment and label. Never a badge alone. A user must never mistake a simulation for a live customer, or vice versa |
| **Draft** | Editing an unpublished employee version | Persistent banner + diff affordance + publish action |
| **Incident** | Workspace-level failure (telephony down, integration outage) | Shell degrades to status-first: what's broken, what's the fallback, what's the blast radius, what to do |
| **On-call (mobile)** | Mobile + user is on rota | Notification-driven, handoff-first, minimal navigation |
| **Reduced sensory** | User preference | No motion beyond opacity, no sound, reduced contrast range, denser static layout |

Simulation and Draft chrome are the two that matter most for trust and are the two most often shipped as a small badge. They get real visual treatment.

---

## 9. Industry adaptation strategy

Never fork the application. Adapt through four data layers, in strict order of how much they're allowed to touch code.

**Layer 1 — Lexicon (pure data, zero code).**
A term map per workspace: `party → Patient/Patients`, `visit → Appointment`, `resource → Doctor`. Every user-visible noun and verb resolves through it, including pluralisation, and it is workspace-overridable (a clinic that says "Members", a hospital wing that says "Guests"). **No domain noun may ever be a string literal in a component.** This is a lint rule, not a convention.

**Layer 2 — Record schemas (data-driven).**
Each industry pack defines record types against the six archetypes (§5.4): fields, validation, statuses, list columns, detail layout slots, and which fields are required before an AI may create the record. One set of components renders all of them.

**Layer 3 — Industry pack (data + content).**
Ships: default procedures, policy templates, required compliance gates, suggested integrations, seed discovery questions, a starter scenario suite, home-screen band presets, and default Authority Matrix recommendations (a clinic's default for *cancel appointment* is Approve; a restaurant's is Act).

**Layer 4 — Vertical code (deliberately rare).**
Only three things may be industry-specific in code, and each needs explicit sign-off: **compliance gates** (HIPAA-shaped consent/retention/BAA flows), **integration adapters** (EHR, PMS, DMS), and a small number of **specialised panels** (e.g. a clinical urgency banner). If a fourth candidate appears, the answer is almost always that Layer 2 needs to be more expressive.

**The trap to avoid:** fully generic schema-driven UI degenerates into key-value soup. The defence is that layout is hand-designed *per archetype*, not per industry — six well-crafted record experiences beat sixteen generated ones.

**Onboarding implication:** industry selection is inferred from the website ingest and confirmed, not asked first. Choosing the pack is a consequence of understanding the business, not a prerequisite.

---

## 10. Responsive strategy

### Desktop (≥1280px) — the primary surface
Three panes: navigation (collapsible) / list / detail. A fourth **contextual intelligence panel** overlays the detail rather than occupying reserved width — no permanently reserved space for optional panels. Density toggle (Comfortable / Compact). Full keyboard. Hover reveals secondary actions but never *only* reveals them — everything hover-revealed is also reachable by keyboard and by an explicit menu, because hover-only actions are inaccessible on touch and to screen readers.

At ≥1680px, Operate may show list + detail + context simultaneously. Wall mode targets 1920px+ and viewing distance: larger type, no hover, no small targets.

### Tablet (768–1279px)
Navigation collapses to icons or a sheet. Two panes maximum; detail arrives as a slide-over. Touch targets at 44px. Live monitoring, handoff, review, and approvals are all fully supported — a tablet at a reception desk is a genuine primary device for this product, not a compromise.

### Mobile (<768px) — an on-call product, not a shrunken dashboard
Five jobs, done excellently, and nothing else pretending to work:

1. **Receive a handoff** — push notification to accept screen with full context in under three seconds. This is the hardest performance target in the product and it drives the mobile architecture.
2. **Monitor a live call and take over** — transcript streaming, one-tap takeover.
3. **Approve or deny an action** — with enough context to decide responsibly, never a bare "Approve?" prompt.
4. **Review and correct** — read a conversation, fix a summary, flag an Issue.
5. **Know something is wrong** — alerts, kill switch, on-call status.

Everything else is read-only or absent. Build, Simulator, and workflow editing are explicitly *not* mobile experiences, and the interface says so rather than degrading into an unusable form. Bottom navigation, full-screen sheets, no hover dependency, reduced motion, simplified tables that become stacked rows rather than horizontally scrolling grids.

---

## 11. Major UX risks

Ordered by how much damage each does if unaddressed.

1. **Mode confusion — who is in control.** The single highest-severity risk. If a human thinks the AI is handling a call and it isn't (or vice versa), a customer is abandoned. *Mitigation:* control state is a persistent, redundantly encoded element on every conversation surface (colour + icon + text label), transitions are explicitly announced and logged, and takeover is confirmed with an unambiguous state change rather than an optimistic assumption.
2. **Automation complacency.** Humans rubber-stamp approvals within a week. *Mitigation:* approval requests must show evidence, not just an action name; deliberate friction on high-risk approvals; batch approval disabled for irreversible actions; periodic sampled audits surfaced in Review; track and expose per-approver approval latency and reversal rate.
3. **False confidence.** Covered in §3.2 — grounding states and named blockers instead of percentages.
4. **Empty day one.** *Mitigation:* onboarding produces a populated, simulated operating picture before the first real call; empty states are editorial and instructive, never a shrug icon.
5. **Alert fatigue in Review.** *Mitigation:* cluster by root cause (§5.3); strict severity ranking by blast radius; auto-close Issues when the underlying cause is fixed and verified by simulation.
6. **Takeover latency.** *Mitigation:* pre-warm the takeover path for any conversation currently visible; treat >1s as a defect, not a slow path.
7. **Configuration drift across employees and locations.** *Mitigation:* shared assets (§3.1), diffs at publish, and a drift view showing where a location deviates from the org default.
8. **Knowledge conflicts producing confidently wrong answers.** *Mitigation:* conflict detection at ingest with a mandatory resolution step; source precedence rules; stale-content flags with age thresholds; every answer traceable to a citation.
9. **Consent and recording law by jurisdiction.** *Mitigation:* jurisdiction-aware defaults; disclosure and recording behaviour as a blocking readiness gate, not a settings toggle.
10. **Cost surprise.** *Mitigation:* shell-level spend, budget caps with an explicitly chosen behaviour at the cap, cost per resolution as a first-class metric.
11. **Over-personification.** Presenting the AI as a person encourages staff over-trust and risks deceiving customers. *Mitigation:* professional, operational visual language; no avatars with faces; AI-vs-human status always explicit; disclosure behaviour built in and, in regulated verticals, not disableable.
12. **Real-time fragility.** Sockets drop. *Mitigation:* degraded and offline are designed states with visible staleness indicators ("last updated 40s ago"), never silent stale data. Silent staleness on a live operations screen is worse than an error.
13. **Simulation–reality gap.** Passing scenarios then failing real calls destroys trust in the Simulator. *Mitigation:* seed scenario suites from *real* failed conversations; report the correlation between simulation pass rate and live outcomes honestly; never present a green suite as a guarantee.
14. **Recording playback privacy.** Not everyone with a login should hear every call. *Mitigation:* `recording.listen` and `pii.reveal` as separate capabilities; access to a recording is itself an audit event.
15. **After-hours escalation with nobody there.** *Mitigation:* on-call rotation and fallback chains as product features; readiness gate blocks deployment if the escalation path terminates nowhere.
16. **Multi-location nav collapse.** Fifteen locations turns every list into noise. *Mitigation:* global scope selector in the shell from v1 (§7.2).

---

## 12. Decisions (resolved 2026-08-07)

All five were confirmed exactly as assumed in §2. No architectural changes follow — recorded here for traceability, since these are now load-bearing and any future reversal is a change request, not an edit.

1. **Handoff destination — Humanoid's own agent surface**, warm transfer to an external number as fallback. Operate mode keeps its full shape (§7.1); the agent-surface build-out (accept screen, context panel, takeover, coaching) is in scope for the first vertical, not deferred.
2. **Design partner shape — multi-location mid-market** (hospital/dental/hotel/restaurant groups). The scope selector, Location as a real dimension, and the two-level org hierarchy in §2.1 stand as designed. Confirms the stated rationale: building for multi-location and collapsing down to single-site is the safe direction; the reverse would force a redesign.
3. **Outbound calling — out of v1.** Campaigns, dialer compliance (TCPA/DNC), and calling-window UI are deferred past the first vertical. The Conversation object stays direction-agnostic in the data model so this is additive later, not a migration.
4. **Telephony — resell in-app (Twilio-class) as the only v1 path**, BYO-carrier/SIP explicitly deferred to a later enterprise-focused pass. Number provisioning in onboarding (J1) is a purchase flow, full stop, for v1 — no carrier-selection branch to design around yet.
5. **First vertical — healthcare.** Consent, recording disclosure, retention, and PHI handling are readiness-gate blockers from the first release, not a v2 hardening pass. This is the harder starting point deliberately: a Govern surface and compliance gate strong enough for healthcare should generalize down to hospitality/legal/real estate with configuration, not redesign — the inverse (starting lax and retrofitting compliance) is the failure mode we're avoiding.

**Still open, not blocking Phase 2:** whether the customer-facing side needs any UI of its own (SMS confirmation pages, reschedule links, post-call surveys). Currently scoped out — if it comes in later, it's a separate lightweight design system, not an extension of this one, and should be raised as its own change request when it becomes concrete.

---

## 13. What Phase 2 will deliver

On approval of this document:

- Complete sitemap across the three modes
- Screen inventory: ~45 screens, each with goal, role, required data, primary and secondary actions, permissions, all states (loading / empty / error / offline / degraded / success / real-time), audit events, analytics events, and mobile behaviour
- API contract sketch per screen
- The revised required-screens list, reconciled against the brief's forty

Then Phase 3 (design system extending `ui.md`), Phase 4 (shell), and Phase 5 (the first vertical journey: signup → discovery → employee → knowledge → procedure → voice → simulation → readiness → publish → test call → conversation timeline → appointment created).
