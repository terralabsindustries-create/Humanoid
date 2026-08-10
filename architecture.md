System Architecture

Architecture Goals

The architecture must support:

Multi-tenant SaaS

Real-time voice and messaging

Low-latency AI interactions

Reliable business workflow execution

Human supervision and takeover

Strong tenant isolation

Auditable AI actions

Configurable industry behavior

Horizontal scalability

Safe integration with external systems

Gradual evolution from MVP to enterprise deployment

Architectural Approach

Start with a modular monolith plus specialized real-time and AI services.

Do not begin with dozens of microservices. Separate a service only when latency, scaling, language choice, data isolation, or operational ownership justifies it.

Initial deployable units:

Web application

Product API

Real-time voice gateway

AI orchestration service

Background worker service

Workflow execution service

Media and ingestion worker

These may initially share a repository and infrastructure while retaining clear domain boundaries.

High-Level Components

Web Application

Responsibilities:

Onboarding

AI employee configuration

Knowledge management

Workflow builder

Live operations

Conversation review

Analytics

Settings and governance

Suggested stack:

Next.js

React

TypeScript

Tailwind CSS

Radix UI

TanStack Query

Zustand

Product API

Responsibilities:

Authentication and session handling

Workspace and organization management

AI employee configuration

Conversation records

Customer records

Knowledge metadata

Workflow definitions

Integrations

Permissions

Billing and usage

Audit access

Suggested stack:

TypeScript

Fastify, NestJS, or an equivalent structured framework

PostgreSQL

Redis

Real-Time Voice Gateway

Responsibilities:

Telephony provider connection

Inbound and outbound call control

Audio streaming

Turn detection

Interruption handling

Session state

DTMF

Transfers

Call recording controls

Connection health

It should expose a provider abstraction so Twilio, Telnyx, SIP, or future carriers can be supported.

AI Orchestration Service

Responsibilities:

Intent and dialogue orchestration

Prompt assembly

Retrieval

Memory access

Tool selection

Model routing

Guardrails

Confidence handling

Response generation

Operational explanation generation

The orchestration service must not directly bypass policy or permission checks.

Workflow Execution Service

Responsibilities:

Execute versioned workflows

Maintain workflow state

Run conditions and branching

Invoke approved tools

Request human approval

Retry safe operations

Handle compensation or rollback where possible

Emit execution events

Knowledge Service

Responsibilities:

Source ingestion

Parsing and chunking

Metadata extraction

Embedding

Indexing

Source synchronization

Access filtering

Conflict detection

Citation retrieval

Knowledge health

Background Workers

Responsibilities:

Document processing

Call summarization

Transcript post-processing

Analytics aggregation

Notifications

Data synchronization

Export generation

Evaluation jobs

Retention jobs

Core Infrastructure

Primary Database

PostgreSQL stores canonical transactional data.

Cache and Ephemeral State

Redis supports:

Session state

Rate limiting

Distributed locks

Short-lived call state

Queue coordination

Cached configuration

Redis must not become the canonical source of truth.

Object Storage

Store:

Call recordings

Uploaded documents

Generated exports

Audio previews

Large evaluation artifacts

Use signed access URLs and tenant-scoped paths.

Vector Retrieval

Use a vector-capable store or PostgreSQL extension for early stages.

Vector data is derived and rebuildable. Source documents, permissions, and metadata remain canonical elsewhere.

Event Bus and Queues

Use managed queues or a durable broker for:

Ingestion jobs

Post-call processing

Notification jobs

Workflow continuations

Evaluation jobs

Integration sync

Events should be versioned and idempotently consumed.

Real-Time Call Flow

Carrier receives or places a call.

Voice gateway creates a call session.

Workspace, phone number, AI employee, policy, and routing configuration are loaded.

Audio streams to speech recognition or a real-time multimodal model.

Turn detection identifies when the caller has paused or interrupted.

AI orchestration determines the next response or action.

Knowledge retrieval returns permission-filtered evidence.

Policy engine evaluates allowed behavior.

Workflow service performs approved actions.

Text-to-speech or real-time audio generation responds.

Events are streamed to the live operations interface.

On completion, transcript, summary, outcomes, actions, and audit records are finalized.

Multi-Tenancy

Every tenant-scoped entity must include a workspace or organization identifier.

Tenant isolation should include:

Application-layer authorization

Database-level constraints

Row-level security where appropriate

Tenant-scoped object storage paths

Tenant-scoped cache keys

Tenant-scoped vector filters

Tenant-scoped encryption strategy for high-value deployments

Never rely on UI filtering for tenant isolation.

Identity and Access

Support:

Email and password or passwordless authentication

SSO for enterprise

Multi-factor authentication

Workspace membership

Roles

Fine-grained permissions

Service accounts

API keys

Short-lived integration tokens

Initial roles:

Owner

Administrator

Operations Manager

AI Trainer

Agent

Developer

Compliance Reviewer

Billing Manager

Use permission checks rather than role-name checks inside domain logic.

Integration Architecture

Create a standard connector contract:

Authentication

Capability discovery

Read operations

Write operations

Webhook handling

Health checks

Rate limit handling

Retry policy

Audit metadata

Secret rotation

Integration calls must use:

Timeouts

Retries for safe operations

Idempotency

Circuit breakers

Structured errors

Correlation IDs

Observability

Capture:

Structured logs

Metrics

Distributed traces

Request IDs

Call session IDs

Workflow execution IDs

Model and prompt versions

Tool invocation events

Latency by stage

Token and cost usage

Error rates

Integration health

Sensitive data must be redacted.

Reliability

Use idempotent commands for external writes.

Persist workflow checkpoints.

Support graceful degradation when a model or integration is unavailable.

Separate synchronous call-critical operations from post-call processing.

Define timeout budgets for speech recognition, orchestration, tools, and speech generation.

Avoid making the customer wait for non-critical analytics.

Provide safe fallback phrases and human escalation.

Security

Encrypt data in transit and at rest.

Store secrets in a managed secret store.

Rotate credentials.

Redact sensitive logs.

Scan uploaded files.

Restrict document parsing environments.

Apply least privilege to cloud identities.

Sign webhooks.

Validate callback sources.

Audit sensitive reads and writes.

Isolate development, staging, and production.

Deployment Direction

Suggested early deployment:

Managed PostgreSQL

Managed Redis

Managed object storage

Containerized product and worker services

Managed queue

CDN and edge delivery for the web application

Region-aware voice infrastructure

Use infrastructure as code.

Scaling Strategy

Scale independently by workload:

Web and API by request volume

Voice gateway by concurrent calls

AI orchestration by active sessions

Workers by queue depth

Knowledge processing by ingestion volume

Analytics by event volume

Partition high-volume conversation and event data when necessary.

Repository Direction

Recommended monorepo:

apps/
  web/
  api/
  voice-gateway/
  ai-orchestrator/
  worker/
packages/
  ui/
  config/
  database/
  contracts/
  auth/
  observability/
  integrations/
  workflows/
  ai-core/
  testing/
infra/
  environments/
  modules/
docs/

Use shared packages carefully. Do not create tight coupling through uncontrolled imports.