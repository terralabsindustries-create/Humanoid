API Conventions and Endpoints

API Style

Use resource-oriented JSON APIs for product operations and event streams for real-time activity.

Base path:

/api/v1

Breaking changes require a new version.

General Conventions

Authentication

Support session authentication for the web application and bearer tokens for programmatic access.

Headers

Recommended headers:

Authorization

Content-Type: application/json

X-Request-Id

Idempotency-Key for retryable writes

X-Workspace-Id only when workspace cannot be derived safely from the route or token

Prefer workspace-scoped routes over trusting workspace headers.

Identifiers

Use stable opaque identifiers.

Dates

Use ISO 8601 UTC timestamps.

Pagination

Prefer cursor pagination.

Example:

{
  "data": [],
  "page": {
    "next_cursor": null,
    "has_more": false
  }
}

Success Envelope

Single resource:

{
  "data": {}
}

Collection:

{
  "data": [],
  "page": {}
}

Error Envelope

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be processed.",
    "details": [],
    "request_id": "req_..."
  }
}

Never expose stack traces.

Error Codes

VALIDATION_ERROR

AUTHENTICATION_REQUIRED

PERMISSION_DENIED

RESOURCE_NOT_FOUND

RESOURCE_CONFLICT

RATE_LIMITED

IDEMPOTENCY_CONFLICT

INTEGRATION_UNAVAILABLE

DEPENDENCY_TIMEOUT

APPROVAL_REQUIRED

POLICY_BLOCKED

INTERNAL_ERROR

Workspace APIs

Workspaces

GET    /workspaces
POST   /workspaces
GET    /workspaces/{workspace_id}
PATCH  /workspaces/{workspace_id}

Members

GET    /workspaces/{workspace_id}/members
POST   /workspaces/{workspace_id}/members/invitations
PATCH  /workspaces/{workspace_id}/members/{membership_id}
DELETE /workspaces/{workspace_id}/members/{membership_id}

Roles

GET    /workspaces/{workspace_id}/roles
POST   /workspaces/{workspace_id}/roles
PATCH  /workspaces/{workspace_id}/roles/{role_id}
DELETE /workspaces/{workspace_id}/roles/{role_id}

Onboarding APIs

POST   /workspaces/{workspace_id}/onboarding/sessions
GET    /workspaces/{workspace_id}/onboarding/sessions/{session_id}
POST   /workspaces/{workspace_id}/onboarding/sessions/{session_id}/messages
POST   /workspaces/{workspace_id}/onboarding/sessions/{session_id}/complete
GET    /workspaces/{workspace_id}/business-model
PATCH  /workspaces/{workspace_id}/business-model

Onboarding output should be reviewable before becoming production configuration.

AI Employee APIs

GET    /workspaces/{workspace_id}/ai-employees
POST   /workspaces/{workspace_id}/ai-employees
GET    /workspaces/{workspace_id}/ai-employees/{ai_employee_id}
PATCH  /workspaces/{workspace_id}/ai-employees/{ai_employee_id}
DELETE /workspaces/{workspace_id}/ai-employees/{ai_employee_id}

Configuration

GET    /workspaces/{workspace_id}/ai-employees/{ai_employee_id}/configurations
POST   /workspaces/{workspace_id}/ai-employees/{ai_employee_id}/configurations
GET    /workspaces/{workspace_id}/ai-employees/{ai_employee_id}/configurations/{version_id}
POST   /workspaces/{workspace_id}/ai-employees/{ai_employee_id}/configurations/{version_id}/validate
POST   /workspaces/{workspace_id}/ai-employees/{ai_employee_id}/configurations/{version_id}/deploy
POST   /workspaces/{workspace_id}/ai-employees/{ai_employee_id}/pause
POST   /workspaces/{workspace_id}/ai-employees/{ai_employee_id}/activate

Configuration deployments must be versioned and auditable.

Voice Profiles

GET    /workspaces/{workspace_id}/voice-profiles
POST   /workspaces/{workspace_id}/voice-profiles
PATCH  /workspaces/{workspace_id}/voice-profiles/{voice_profile_id}
POST   /workspaces/{workspace_id}/voice-profiles/{voice_profile_id}/preview

Knowledge APIs

GET    /workspaces/{workspace_id}/knowledge-sources
POST   /workspaces/{workspace_id}/knowledge-sources
GET    /workspaces/{workspace_id}/knowledge-sources/{source_id}
PATCH  /workspaces/{workspace_id}/knowledge-sources/{source_id}
DELETE /workspaces/{workspace_id}/knowledge-sources/{source_id}
POST   /workspaces/{workspace_id}/knowledge-sources/{source_id}/sync
GET    /workspaces/{workspace_id}/knowledge-sources/{source_id}/versions
GET    /workspaces/{workspace_id}/knowledge-gaps
GET    /workspaces/{workspace_id}/knowledge-conflicts
PATCH  /workspaces/{workspace_id}/knowledge-conflicts/{conflict_id}

Upload Flow

POST   /workspaces/{workspace_id}/uploads
POST   /workspaces/{workspace_id}/knowledge-sources/from-upload

Use signed upload URLs for large files.

Workflow APIs

GET    /workspaces/{workspace_id}/workflows
POST   /workspaces/{workspace_id}/workflows
GET    /workspaces/{workspace_id}/workflows/{workflow_id}
PATCH  /workspaces/{workspace_id}/workflows/{workflow_id}
DELETE /workspaces/{workspace_id}/workflows/{workflow_id}

Versions and Testing

POST   /workspaces/{workspace_id}/workflows/{workflow_id}/versions
GET    /workspaces/{workspace_id}/workflows/{workflow_id}/versions/{version_id}
POST   /workspaces/{workspace_id}/workflows/{workflow_id}/versions/{version_id}/validate
POST   /workspaces/{workspace_id}/workflows/{workflow_id}/versions/{version_id}/publish
POST   /workspaces/{workspace_id}/workflows/{workflow_id}/versions/{version_id}/simulate

Executions

GET    /workspaces/{workspace_id}/workflow-executions
GET    /workspaces/{workspace_id}/workflow-executions/{execution_id}
POST   /workspaces/{workspace_id}/workflow-executions/{execution_id}/retry
POST   /workspaces/{workspace_id}/workflow-executions/{execution_id}/cancel

Conversation APIs

GET    /workspaces/{workspace_id}/conversations
GET    /workspaces/{workspace_id}/conversations/{conversation_id}
PATCH  /workspaces/{workspace_id}/conversations/{conversation_id}
GET    /workspaces/{workspace_id}/conversations/{conversation_id}/messages
GET    /workspaces/{workspace_id}/conversations/{conversation_id}/events
GET    /workspaces/{workspace_id}/conversations/{conversation_id}/media
POST   /workspaces/{workspace_id}/conversations/{conversation_id}/feedback

Filters may include:

channel

status

direction

ai_employee_id

customer_id

outcome

sentiment

escalation

date range

Live Actions

POST   /workspaces/{workspace_id}/conversations/{conversation_id}/monitor
POST   /workspaces/{workspace_id}/conversations/{conversation_id}/takeover
POST   /workspaces/{workspace_id}/conversations/{conversation_id}/return-to-ai
POST   /workspaces/{workspace_id}/conversations/{conversation_id}/transfer
POST   /workspaces/{workspace_id}/conversations/{conversation_id}/end

These operations require strict permission and state validation.

Customer APIs

GET    /workspaces/{workspace_id}/customers
POST   /workspaces/{workspace_id}/customers
GET    /workspaces/{workspace_id}/customers/{customer_id}
PATCH  /workspaces/{workspace_id}/customers/{customer_id}
GET    /workspaces/{workspace_id}/customers/{customer_id}/conversations
GET    /workspaces/{workspace_id}/customers/{customer_id}/appointments
POST   /workspaces/{workspace_id}/customers/{customer_id}/notes

Appointment APIs

GET    /workspaces/{workspace_id}/appointments
POST   /workspaces/{workspace_id}/appointments
GET    /workspaces/{workspace_id}/appointments/{appointment_id}
PATCH  /workspaces/{workspace_id}/appointments/{appointment_id}
POST   /workspaces/{workspace_id}/appointments/{appointment_id}/cancel
POST   /workspaces/{workspace_id}/appointments/{appointment_id}/reschedule

Use idempotency keys for booking, cancellation, and rescheduling.

Handoff and Approval APIs

Handoffs

GET    /workspaces/{workspace_id}/handoffs
GET    /workspaces/{workspace_id}/handoffs/{handoff_id}
POST   /workspaces/{workspace_id}/handoffs/{handoff_id}/accept
POST   /workspaces/{workspace_id}/handoffs/{handoff_id}/complete
POST   /workspaces/{workspace_id}/handoffs/{handoff_id}/reassign

Approvals

GET    /workspaces/{workspace_id}/approvals
GET    /workspaces/{workspace_id}/approvals/{approval_id}
POST   /workspaces/{workspace_id}/approvals/{approval_id}/approve
POST   /workspaces/{workspace_id}/approvals/{approval_id}/reject

Approval decisions must record actor, time, and reason.

Integration APIs

GET    /workspaces/{workspace_id}/integrations
POST   /workspaces/{workspace_id}/integrations/{provider_key}/connect
GET    /workspaces/{workspace_id}/integrations/{connection_id}
PATCH  /workspaces/{workspace_id}/integrations/{connection_id}
DELETE /workspaces/{workspace_id}/integrations/{connection_id}
POST   /workspaces/{workspace_id}/integrations/{connection_id}/test
POST   /workspaces/{workspace_id}/integrations/{connection_id}/sync
GET    /workspaces/{workspace_id}/integrations/{connection_id}/sync-runs

OAuth callback routes should be separate and protected against CSRF.

Phone Number APIs

GET    /workspaces/{workspace_id}/phone-numbers
POST   /workspaces/{workspace_id}/phone-numbers/search
POST   /workspaces/{workspace_id}/phone-numbers/purchase
GET    /workspaces/{workspace_id}/phone-numbers/{phone_number_id}
PATCH  /workspaces/{workspace_id}/phone-numbers/{phone_number_id}
POST   /workspaces/{workspace_id}/phone-numbers/{phone_number_id}/assign
POST   /workspaces/{workspace_id}/phone-numbers/{phone_number_id}/release

Purchases and releases require explicit confirmation and auditing.

Simulation and Evaluation APIs

POST   /workspaces/{workspace_id}/simulations
GET    /workspaces/{workspace_id}/simulations/{simulation_id}
POST   /workspaces/{workspace_id}/simulations/{simulation_id}/messages
POST   /workspaces/{workspace_id}/simulations/{simulation_id}/complete
GET    /workspaces/{workspace_id}/evaluation-suites
POST   /workspaces/{workspace_id}/evaluation-suites
POST   /workspaces/{workspace_id}/evaluation-suites/{suite_id}/runs
GET    /workspaces/{workspace_id}/evaluation-runs/{run_id}

Analytics and Usage APIs

GET    /workspaces/{workspace_id}/analytics/overview
GET    /workspaces/{workspace_id}/analytics/conversations
GET    /workspaces/{workspace_id}/analytics/ai-employees
GET    /workspaces/{workspace_id}/analytics/workflows
GET    /workspaces/{workspace_id}/usage
GET    /workspaces/{workspace_id}/billing

Analytics endpoints should return metric definitions, units, comparison windows, and data freshness.

Audit APIs

GET    /workspaces/{workspace_id}/audit-events
GET    /workspaces/{workspace_id}/audit-events/{audit_event_id}
POST   /workspaces/{workspace_id}/audit-exports

Real-Time Events

Use WebSocket or server-sent events for dashboard updates.

Example event types:

conversation.started

conversation.updated

conversation.ended

transcript.segment.created

ai.state.changed

tool.invocation.started

tool.invocation.completed

workflow.execution.updated

handoff.requested

handoff.accepted

approval.requested

integration.health.changed

Every event should include:

event ID

event type

version

workspace ID

occurred at

resource ID

correlation ID

payload

Webhooks

External webhooks should use signed requests and retry with exponential backoff.

Example public events:

conversation completed

appointment created

handoff requested

workflow completed

approval required

customer updated

Webhook deliveries must be idempotent and auditable.