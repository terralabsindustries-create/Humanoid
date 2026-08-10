Database Model

Database Principles

PostgreSQL is the canonical source of truth.

All tenant-scoped records belong to a workspace.

Use migrations for all schema changes.

Use explicit foreign keys and constraints.

Keep audit records append-only.

Store flexible industry configuration in controlled JSONB schemas, not unvalidated blobs.

Separate operational records from analytics aggregates.

Treat recordings, transcripts, and sensitive customer data as protected data.

Identity and Tenancy

organizations

Represents the legal or parent organization.

Key fields:

id

name

slug

status

billing_customer_id

created_at

updated_at

workspaces

Represents an operational tenant environment.

Key fields:

id

organization_id

name

slug

industry_key

timezone

locale

status

settings_json

created_at

updated_at

users

Key fields:

id

email

name

avatar_url

status

last_login_at

created_at

updated_at

workspace_memberships

Key fields:

id

workspace_id

user_id

role_id

status

created_at

updated_at

roles

Key fields:

id

workspace_id nullable for system roles

name

description

is_system

created_at

updated_at

permissions

Key fields:

id

key

description

role_permissions

Key fields:

role_id

permission_id

Business Structure

locations

id

workspace_id

name

address_json

phone

timezone

status

departments

id

workspace_id

location_id nullable

name

description

status

business_services

id

workspace_id

department_id nullable

name

description

duration_minutes nullable

price_json nullable

status

metadata_json

business_hours

id

workspace_id

location_id nullable

department_id nullable

day_of_week

opens_at

closes_at

is_closed

AI Employees

ai_employees

id

workspace_id

name

role_name

department_id nullable

location_id nullable

status

default_language

timezone

current_configuration_version_id nullable

created_at

updated_at

ai_employee_configuration_versions

Immutable versioned configuration.

id

ai_employee_id

version_number

status

voice_profile_id

behavior_json

permissions_json

escalation_rules_json

operating_rules_json

prompt_bundle_version_id

created_by

created_at

deployed_at nullable

voice_profiles

id

workspace_id

provider

provider_voice_id

display_name

language

settings_json

preview_asset_id nullable

created_at

ai_employee_channels

id

ai_employee_id

channel_type

channel_endpoint_id

status

configuration_json

ai_employee_supervisors

ai_employee_id

user_id

supervision_type

Customers and Domain Records

customers

id

workspace_id

external_reference nullable

display_name

primary_phone nullable

primary_email nullable

preferred_language nullable

status

attributes_json

created_at

updated_at

customer_identifiers

id

workspace_id

customer_id

identifier_type

identifier_value_hash

encrypted_value nullable

verified_at nullable

customer_notes

id

workspace_id

customer_id

author_type

author_id nullable

note

visibility

created_at

domain_objects

A configurable record layer for industry-specific objects that are not yet promoted to first-class tables.

id

workspace_id

object_type

external_reference nullable

status

data_json

created_at

updated_at

Use first-class tables for high-value stable domains such as appointments.

appointments

id

workspace_id

customer_id nullable

service_id nullable

location_id nullable

department_id nullable

staff_external_reference nullable

integration_connection_id nullable

external_reference nullable

starts_at

ends_at

timezone

status

source

notes nullable

metadata_json

created_at

updated_at

Conversations

conversations

Represents a conversation across any channel.

id

workspace_id

ai_employee_id nullable

customer_id nullable

channel_type

direction

status

started_at

ended_at nullable

current_owner_type

current_owner_id nullable

language

outcome_code nullable

sentiment_summary nullable

summary nullable

metadata_json

created_at

updated_at

call_sessions

id

conversation_id

provider

provider_call_id

from_number

to_number

status

connected_at nullable

ended_at nullable

transfer_state nullable

recording_consent_state

latency_metrics_json

created_at

updated_at

conversation_participants

id

conversation_id

participant_type

participant_id nullable

display_name

joined_at

left_at nullable

conversation_messages

id

conversation_id

sequence_number

speaker_type

speaker_id nullable

content_type

text_content nullable

started_at nullable

ended_at nullable

confidence nullable

metadata_json

created_at

conversation_summaries

id

conversation_id

version_number

summary

structured_data_json

model_info_json

created_at

media_assets

id

workspace_id

asset_type

storage_key

mime_type

size_bytes

encryption_metadata_json nullable

retention_expires_at nullable

created_at

conversation_media

conversation_id

media_asset_id

media_role

Live Operations and Handoffs

handoffs

id

workspace_id

conversation_id

requested_by_type

requested_by_id nullable

reason_code

reason_details nullable

priority

status

assigned_user_id nullable

requested_at

accepted_at nullable

completed_at nullable

tasks

id

workspace_id

customer_id nullable

conversation_id nullable

assigned_user_id nullable

title

description nullable

status

priority

due_at nullable

created_at

updated_at

approvals

id

workspace_id

conversation_id nullable

workflow_execution_id nullable

action_type

action_payload_json

risk_level

status

requested_by_type

requested_by_id nullable

assigned_user_id nullable

decided_at nullable

decision_reason nullable

created_at

Knowledge

knowledge_sources

id

workspace_id

source_type

name

status

trust_level

access_policy_json

sync_configuration_json

last_synced_at nullable

created_at

updated_at

knowledge_source_versions

id

knowledge_source_id

version_number

content_hash

status

raw_asset_id nullable

metadata_json

created_at

knowledge_documents

id

workspace_id

knowledge_source_version_id

title

canonical_uri nullable

language

status

metadata_json

created_at

knowledge_chunks

id

workspace_id

knowledge_document_id

chunk_index

text_content

token_count

embedding_reference nullable

metadata_json

created_at

knowledge_conflicts

id

workspace_id

source_a_id

source_b_id

topic

description

status

resolution_notes nullable

created_at

resolved_at nullable

knowledge_gaps

id

workspace_id

topic

evidence_json

frequency

severity

status

created_at

resolved_at nullable

Workflows and Tools

workflows

id

workspace_id

name

description

trigger_type

status

current_version_id nullable

created_at

updated_at

workflow_versions

Immutable definitions.

id

workflow_id

version_number

definition_json

created_by

created_at

published_at nullable

workflow_executions

id

workspace_id

workflow_version_id

conversation_id nullable

customer_id nullable

status

current_step_key nullable

input_json

output_json nullable

error_json nullable

started_at

completed_at nullable

workflow_execution_events

Append-only execution timeline.

id

workflow_execution_id

sequence_number

event_type

step_key nullable

payload_json

created_at

tools

id

workspace_id nullable

key

name

description

risk_level

schema_json

status

ai_employee_tool_permissions

ai_employee_id

tool_id

permission_mode

constraints_json

tool_invocations

id

workspace_id

conversation_id nullable

workflow_execution_id nullable

tool_id

ai_employee_id nullable

request_json

response_json nullable

status

idempotency_key nullable

started_at

completed_at nullable

error_json nullable

Integrations

integration_connections

id

workspace_id

provider_key

display_name

status

encrypted_credentials_reference

scopes_json

configuration_json

last_health_check_at nullable

created_at

updated_at

integration_sync_runs

id

integration_connection_id

sync_type

status

cursor_json nullable

started_at

completed_at nullable

stats_json

error_json nullable

webhook_endpoints

id

workspace_id

url

secret_reference

subscribed_events_json

status

created_at

webhook_deliveries

id

webhook_endpoint_id

event_id

attempt_number

status

response_code nullable

delivered_at nullable

error nullable

AI Configuration and Evaluation

prompt_bundles

id

workspace_id nullable

name

purpose

current_version_id nullable

created_at

prompt_bundle_versions

id

prompt_bundle_id

version_number

prompt_templates_json

model_policy_json

created_by

created_at

model_configurations

id

workspace_id nullable

name

task_type

provider

model_name

settings_json

status

created_at

evaluation_suites

id

workspace_id

name

description

status

created_at

evaluation_cases

id

evaluation_suite_id

name

input_json

expected_behavior_json

risk_level

created_at

evaluation_runs

id

evaluation_suite_id

prompt_bundle_version_id nullable

model_configuration_id nullable

status

aggregate_results_json

started_at

completed_at nullable

evaluation_results

id

evaluation_run_id

evaluation_case_id

status

score_json

observed_output_json

failure_reason nullable

Audit, Usage, and Billing

audit_events

Append-only.

id

workspace_id

actor_type

actor_id nullable

action

resource_type

resource_id nullable

request_id nullable

ip_address_hash nullable

metadata_json

created_at

usage_events

id

workspace_id

event_type

quantity

unit

conversation_id nullable

model_configuration_id nullable

metadata_json

occurred_at

billing_accounts

id

organization_id

provider_customer_id

plan_key

status

created_at

updated_at

subscriptions

id

billing_account_id

provider_subscription_id

plan_key

status

current_period_start

current_period_end

Important Relationships

Organization has many workspaces.

Workspace has many members, AI employees, customers, conversations, sources, workflows, and integrations.

AI employee has many configuration versions and channels.

Conversation belongs to a workspace and may belong to a customer and AI employee.

Call session is a channel-specific extension of a conversation.

Workflow execution may be linked to a conversation and customer.

Tool invocations may belong to a workflow execution or direct AI action.

Knowledge chunks belong to versioned source documents.

Prompt bundles and workflow definitions are versioned and immutable after deployment.

Indexing Priorities

Initial indexes should support:

Workspace-scoped lists

Conversations by status and start time

Active calls

Customers by phone and email hashes

Appointments by start time and status

Workflow executions by status

Pending approvals and handoffs

Knowledge source sync status

Audit events by resource and time

Usage events by workspace and time

Use query analysis before adding speculative indexes.