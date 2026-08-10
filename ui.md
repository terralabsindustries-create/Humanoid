UI and UX System

Design Goal

Humanoid should feel like an intelligent operating system for AI employees.

The interface must be premium, tactile, calm, fast, trustworthy, and operational. It should combine editorial composition with the precision and speed required for live business work.

It must not look like a generic SaaS dashboard.

Product Experience Principles

Tactile, Not Decorative

Motion should communicate state, action, hierarchy, and spatial relationships.

Fast Before Flashy

Important actions must feel immediate. Animation must never delay work.

Editorial, Not Template-Based

Avoid repeated card grids. Use typography, alignment, surfaces, dividers, timelines, tables, and asymmetry to create hierarchy.

Calm Futurism

Avoid cyberpunk styling, excessive neon, random gradients, and uncontrolled glass effects.

Trust Through Clarity

Always make clear:

Whether AI or a human is in control

Whether an action is pending or complete

Whether information is verified

Whether approval is required

Whether an integration is connected

Whether risk or urgency exists

Progressive Disclosure

Keep default views simple while allowing experts to inspect deeper configuration and execution details.

Accessible by Default

Support keyboard navigation, screen readers, reduced motion, sufficient contrast, and touch-friendly mobile behavior.

Creative Direction

Take inspiration without copying:

Recent.design

Tactile click feedback

Small responsive interactions

Optional functional sound

Immediate feedback

Razed Mods

Warm cream surfaces

Editorial typography

Bold but controlled composition

Asymmetric visual rhythm

No Art

Immersive transitions

Layered depth

Experimental but controlled layout

Apple

Spacing discipline

Clear hierarchy

Premium typography

Calm confidence

Linear

Speed

Keyboard-first operation

Dense but readable data

Precise states

Excellent dark surfaces

Color Tokens

Light Theme

--background-app: #F2EFE7

--background-elevated: #F8F5EE

--background-subtle: #ECE8DE

--text-primary: #171713

--text-secondary: #77746C

--border-subtle: rgba(23, 23, 19, 0.10)

--border-strong: rgba(23, 23, 19, 0.18)

Dark Theme

--background-app: #161714

--background-elevated: #20211E

--background-subtle: #292A26

--text-primary: #F4F1E9

--text-secondary: #A7A49B

--border-subtle: rgba(255, 255, 255, 0.09)

--border-strong: rgba(255, 255, 255, 0.16)

Semantic States

Define tokens for:

Success

Warning

Error

Information

AI listening

AI thinking

AI speaking

Human controlled

Approval required

Urgent

Verified

Unverified

Offline

Processing

Use color plus icon, label, or shape. Never rely on color alone.

Typography

Use:

Premium grotesk or neo-grotesk for product UI

Editorial display face for limited onboarding and marketing moments

Monospace for timestamps, IDs, latency, technical values, and shortcuts

Requirements:

Fluid scale with clamp()

Strong hierarchy

Readable dense tables

Comfortable transcript line lengths

Minimum practical UI sizes

Consistent numeric alignment for operational metrics

Spacing and Layout

Use a 4px base spacing system.

Guidelines:

Generous page-level spacing

Compact operational controls

Dense but readable tables

More space for onboarding and empty states

Avoid unnecessary containers

Use alignment and dividers before adding cards

Radius

Compact controls: 8–10px

Inputs: 10–12px

Panels: 12–16px

Large dialogs: 18–24px

Immersive surfaces: 24–32px

Pills: full radius

Do not use the same radius everywhere.

Shadows

Use subtle layered elevation. Prefer tonal separation and borders.

Motion

Centralize motion tokens.

Immediate feedback: 80–120ms

Small transition: 140–180ms

Standard transition: 200–280ms

Panel transition: 240–340ms

Large spatial transition: 350–500ms

Onboarding cinematic transition: up to 700ms

Use spring motion for:

Buttons

Toggles

Selection

Dragging

Reordering

Use eased motion for:

Panels

Modals

Routes

Workspace mode changes

Do not animate long operational lists repeatedly.

Respect reduced motion.

Sound

Sound is optional and disabled until user interaction or explicit enablement.

Possible events:

Deployment complete

Connection established

Human handoff received

Important workflow completed

Approval required

Test passed

Do not add sounds to ordinary navigation, typing, every click, or repeated updates.

Include:

Global mute

Volume control

Reduced sensory mode

Persistent preference

Press Feedback

Press feedback is a separate channel from alert sound and follows different rules. An alert tells you something happened while you were looking elsewhere. Press feedback tells you the control you just operated received the press. It carries no information a person can miss by having it off.

Three channels, in order of how loudly they assert themselves:

Compression. Every control scales down 1.5% while pressed. Always on, silent, and the reason the other two can default to off.

Haptics. A short tick on touch devices that support it. On by default, because it is silent and because on a phone it is the only press confirmation that survives a glance away from the screen.

Sound. A quiet click, under 60ms, on genuine controls only. Off by default. Operators run this product while listening to live calls, and a press tone competes with the audio that is the actual work. It also silences itself automatically whenever any audio is playing on the page.

The rule above still holds and is what makes this safe: feedback attaches to controls, never to the page. Clicking a heading, a paragraph, a table cell or empty space stays silent. A product that responds to every click tells you nothing about which things respond.

Feedback is delegated, not wired per component. A new button is tactile the moment it is written, and `data-tactile` overrides the tone or opts an element and its subtree out of all three channels.

Application Shell

The shell may include:

Collapsible primary navigation

Contextual secondary navigation

Workspace switcher

AI employee switcher

Global search

Command palette

Context breadcrumbs

Main workspace

Optional intelligence panel

Activity center

Notifications

Global connection state

User menu

Do not permanently reserve space for unused panels.

Navigation Model

Initial top-level structure:

Home

Live

Conversations

Customers

AI Employees

Knowledge

Workflows

Analytics

Quality

Integrations

Settings

Adapt navigation by role, enabled capabilities, and industry.

Home

An operational briefing, not a generic metric-card dashboard.

Show:

What is happening now

What changed

What needs attention

What the AI completed

Where the AI struggled

Recommended actions

Live

Real-time calls, transcripts, AI state, confidence signals, workflow progress, and human takeover.

Conversations

Unified voice and messaging history with filtering and detailed timelines.

AI Employees

Create, configure, test, deploy, pause, and evaluate AI employees.

Knowledge

Manage sources, sync, trust, conflicts, citations, and gaps.

Workflows

Create and test business processes.

Quality

Review failures, low-confidence cases, evaluations, and proposed improvements.

Core Screens

Onboarding

Workspace creation

Business discovery interview

Business model review

Suggested AI employee

Knowledge connection

Integration connection

Readiness review

The interface should visibly build an understanding of the business as the user answers.

AI Employee Workspace

Sections:

Overview

Role and behavior

Voice

Knowledge

Workflows

Tools and permissions

Testing

Deployment

Performance

Simulation Studio

Support text and voice simulations.

Show:

Live transcript

Intent

Knowledge used

Workflow step

Tool action

Policy check

Latency

Outcome

Recommended improvements

Live Operations

Prioritize calm monitoring.

Show:

Active calls

Waiting callers

AI state

Sentiment or urgency

Current workflow step

Human takeover

Failure state

Avoid distracting ambient motion.

Conversation Detail

Use a timeline combining:

Transcript

Recording

Summary

Extracted information

Tool actions

Workflow events

Knowledge citations

Human interventions

Follow-up tasks

Audit information

Human Handoff

Immediately show:

Customer identity

Reason for escalation

Summary

Important facts

Sentiment

Actions completed

Current workflow state

Suggested next step

Risks

The customer should not need to repeat information.

Component Architecture

Primitive Components

Button

Icon button

Split button

Input

Textarea

Select

Combobox

Toggle

Checkbox

Radio

Tabs

Dialog

Drawer

Popover

Tooltip

Command menu

Toast

Inline alert

Data table

Virtualized list

Timeline

Progress

Status

Empty state

Skeleton

Upload area

Audio player

Waveform

Transcript viewer

Domain Components

AI employee status

Live call row

AI state indicator

Conversation timeline

Human takeover panel

Knowledge citation

Knowledge health

Workflow execution

Tool invocation

Approval request

Risk warning

Customer context

Voice preview

Evaluation scorecard

Integration health

Every component must include:

Default

Hover

Pressed

Focus-visible

Selected

Disabled

Loading

Empty

Error

Success

Dark mode

Reduced motion

Mobile behavior

Responsive Behavior

Desktop

Multi-panel workspaces

Keyboard-first navigation

Dense information

Hover and contextual actions

Tablet

Collapsible panels

Touch-friendly targets

Simplified split views

Mobile

Compact or bottom navigation

Full-screen sheets

Minimum 44px targets

No hover dependency

Reduced animation

Preserve live monitoring, handoff, review, and approvals

Do not create a desktop-only product.

Accessibility

Target WCAG 2.2 AA where possible.

Requirements:

Complete keyboard navigation

Visible focus states

Screen-reader labels

Accessible form errors

Logical headings

Skip navigation

Accessible live regions

Captions and transcripts

Non-color status indicators

Reduced motion

Reduced sensory mode

Accessible chart alternatives

Content Design

Use concise, operational language.

Prefer:

“Appointment booked”

“Human approval required”

“Calendar connection unavailable”

“Escalated because identity could not be verified”

Avoid vague language such as:

“Something happened”

“AI processing magic”

“Smart result”

Do not expose hidden reasoning. Show useful operational explanations.

Frontend Implementation Rules

Use realistic mock data.

Define API contracts alongside each screen.

Mark simulated behavior clearly.

Build loading, empty, error, offline, and success states.

Use Server Components by default when appropriate.

Lazy-load heavy charts, audio tools, and motion.

Centralize design, motion, and sound tokens.

Keep primitive components separate from domain components.

Support configurable industry terminology.

Avoid fake buttons.

First Vertical Journey

Build this flow before expanding:

Sign up

Workspace onboarding

Business discovery

AI employee creation

Knowledge import

Voice setup

Appointment workflow

Simulation

Deployment readiness

Test call

Conversation summary

Appointment result

This vertical slice should be polished, responsive, accessible, and realistic.

Quality Review Checklist

Before approving a screen, check:

Is it generic?

Are there unnecessary cards?

Is the hierarchy clear?

Is the most important action obvious?

Are system states understandable?

Is AI versus human control clear?

Are risk and approval clear?

Does it work with keyboard and touch?

Does it handle failure?

Does it adapt to dark mode and reduced motion?

Does every button have a defined purpose?