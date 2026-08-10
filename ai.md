AI Architecture

Objective

The AI layer should produce natural, useful conversations while safely executing approved business actions.

It must be reliable, observable, versioned, testable, and controllable.

Core Principles

The model is not the policy engine.

The model is not the permission system.

The model is not the source of truth for business data.

Tool calls must be validated before execution.

High-risk actions require deterministic rules and, where appropriate, human approval.

Prompts are versioned code.

Knowledge answers require grounded evidence.

Hidden chain-of-thought must not be displayed or stored.

Store concise operational explanations and tool traces instead.

Production changes require evaluation.

AI Runtime Layers

1. Session Context

Contains current-call information:

Workspace

AI employee

Channel

Customer identity state

Current intent

Conversation history

Workflow state

Tool results

Human supervision state

Timing and latency information

Keep only the necessary recent context in the active prompt.

2. Identity and Role

Defines:

Employee role

Responsibilities

Communication style

Supported languages

Business identity

Allowed and forbidden behavior

Escalation policy

3. Policy Layer

Deterministic controls outside the model:

Permissions

Data access

Risk thresholds

Required approvals

Compliance rules

Identity verification requirements

Emergency handling

Recording and consent

Tool constraints

4. Knowledge Retrieval

Retrieves permission-filtered evidence from approved sources.

Requirements:

Workspace isolation

Source access control

Citation metadata

Freshness metadata

Trust levels

Conflict detection

Relevance scoring

Fallback when evidence is weak

5. Memory

Memory must be separated into categories.

Session Memory

Temporary context for the active conversation.

Customer Memory

Durable customer preferences and verified facts.

Must distinguish:

Verified facts

Imported facts

Human notes

AI-inferred information

Unverified information

Business Memory

Policies, services, teams, terminology, and workflows.

Operational Memory

Recent system events, open tasks, workflow state, and unresolved issues.

Never store unrestricted model-generated summaries as trusted facts.

6. Dialogue Orchestration

Determines whether the next step is:

Ask a question

Answer from knowledge

Confirm information

Execute a workflow step

Call a tool

Request approval

Escalate

Transfer

End the conversation

7. Tool Execution

The model may propose a tool call, but the platform must:

Validate the schema.

Confirm permissions.

Check workflow state.

Check policy.

Apply risk rules.

Request approval if needed.

Execute with idempotency.

Record the result.

Return a sanitized response to the model.

8. Response Generation

Generate concise, channel-appropriate responses.

Voice responses should:

Use short spoken sentences

Avoid reading technical details

Confirm important actions

Handle interruptions

Avoid repetitive filler

Use empathy without pretending to have human emotions

Disclose AI identity when required

Agent Architecture

Use a controlled orchestrator rather than unrestricted autonomous agents.

Recommended agents or modules:

Conversation Orchestrator

Owns the dialogue state and next action.

Knowledge Specialist

Retrieves and ranks grounded information.

Workflow Planner

Maps intent to an approved workflow. It does not invent production workflows.

Tool Executor

Executes validated tools through deterministic interfaces.

Safety and Policy Evaluator

Checks risk, policy, verification, and escalation requirements.

Summarization and Extraction Worker

Produces post-call summaries, structured fields, and follow-up suggestions.

Quality Evaluator

Scores completed conversations against defined criteria.

These may be logical modules rather than separate model calls in the MVP.

Prompt Architecture

Prompts should be assembled from versioned components:

Platform behavior

Workspace policy

AI employee role

Channel instructions

Current workflow

Retrieved knowledge

Customer context

Tool definitions

Safety instructions

Output schema

Do not create one enormous unstructured prompt.

Prompt Versioning

Store:

Version

Author

Created time

Deployment time

Linked AI employee configurations

Model settings

Evaluation result

Rollback target

Structured Outputs

Use structured outputs for:

Intent

Extracted fields

Tool proposals

Risk classification

Escalation decision

Workflow transition

Summary fields

Validate all outputs.

Model Routing

Use task-specific routing.

Potential classes:

Real-time conversational model

Fast classification model

High-quality post-call summarization model

Embedding model

Speech recognition model

Speech generation model

Routing criteria:

Latency budget

Language

Cost

Risk

Context length

Tool-use reliability

Availability

Support provider fallback where practical.

Voice Pipeline

Input

Telephony audio stream

Noise handling

Voice activity detection

Turn detection

Speech recognition

Language detection

Orchestration

Partial transcript handling

Interruption detection

Response planning

Tool calls

Approval and escalation

Output

Speech synthesis

Streaming audio

Pronunciation dictionary

Speed, warmth, energy, and formality controls

Barge-in cancellation

Latency Budget

Track latency across:

Audio transport

Speech recognition

Orchestration

Retrieval

Tool execution

Speech generation

Non-critical post-processing must not block the live call.

Confidence and Escalation

Do not expose a fake universal confidence score.

Confidence should be task-specific and based on signals such as:

Retrieval strength

Input clarity

Identity verification

Tool availability

Workflow match

Policy ambiguity

Model agreement

Evaluation history

Escalate when:

Customer asks for a human

Required identity cannot be verified

Policy requires human review

Knowledge is missing or contradictory

Tool execution fails repeatedly

The customer is distressed or angry beyond configured limits

Medical, legal, financial, safety, or emergency risk is detected

The requested action is forbidden

Safety and High-Risk Domains

For healthcare:

Do not diagnose.

Do not provide unsupported medical advice.

Use approved emergency escalation language.

Separate scheduling and administrative support from clinical decisions.

For legal services:

Do not present general information as legal advice.

Escalate conflict, deadline, and representation questions as configured.

For financial workflows:

Require strong identity verification.

Use explicit approval boundaries.

Never expose full payment credentials to the model.

Memory Write Policy

The AI may propose a memory update.

Before writing durable memory:

Classify the information.

Determine whether it is necessary.

Check user or business consent.

Identify the source.

Assign verification status.

Apply retention rules.

Record provenance.

Sensitive inferred data should not be stored by default.

Knowledge Ingestion

Pipeline:

Acquire source

Scan and validate

Parse

Normalize

Extract metadata

Apply access policy

Chunk

Embed

Index

Evaluate retrieval quality

Publish source version

Do not replace a good source with an unreviewed AI rewrite.

Evaluation Strategy

Evaluation categories:

Intent accuracy

Knowledge grounding

Citation correctness

Tool selection

Tool argument accuracy

Workflow completion

Escalation correctness

Policy compliance

Tone and clarity

Hallucination rate

Latency

Cost

Maintain:

Golden test cases

Difficult edge cases

Industry-specific scenarios

Regression tests

Adversarial tests

Integration failure tests

Human handoff tests

No prompt or model configuration should reach production without passing required evaluations.

Observability

Record:

Model provider and model

Prompt version

Retrieved source IDs

Tool proposals

Policy decisions

Tool execution results

Workflow transitions

Latency

Token usage

Cost

Escalation reasons

Final outcome

Do not log unrestricted sensitive prompt content.

Failure Handling

The runtime must handle:

Speech recognition failure

Model timeout

Provider outage

Retrieval failure

Tool timeout

Integration error

Invalid structured output

Policy conflict

Customer silence

Repeated misunderstanding

Fallback options:

Ask for clarification

Use a safe approved response

Retry a safe operation

Switch provider

Continue without a non-critical feature

Transfer to a human

Create a follow-up task