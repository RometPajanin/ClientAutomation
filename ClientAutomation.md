# Customer Inquiry Automation Backend — Implementation Plan

## 1. Goal

The MVP will receive customer inquiries from a web form, analyze them with AI, assign a category and priority, extract important information, decide what should happen next, optionally create a response draft, and expose the result through an admin API.

The first version only handles web-form submissions. Email ingestion, a real CRM integration, and automatic reply delivery are intentionally left for later.

## 2. MVP scope

The backend must:

1. Accept a web-form inquiry through a public API endpoint.
2. Validate and store the original submission before starting AI processing.
3. Analyze the inquiry through a hosted AI API.
4. Store the validated, structured analysis result.
5. Assign every inquiry to human review after AI analysis.
6. Generate a response draft when appropriate, but never send it automatically in the MVP.
7. Expose list and detail endpoints for an admin application.
8. Handle missing information, duplicate inquiries, AI failures, and situations that require human review.
9. Provide table-ready structured results for the admin area.
10. Let an authenticated admin manage a company-specific instruction that is included in every AI request.

## 3. Chosen stack

- **Runtime:** Node.js and TypeScript
- **API framework:** Fastify
- **Database:** PostgreSQL
- **ORM and migrations:** Prisma
- **Validation:** Zod
- **AI provider:** Gemini Developer API
- **Initial model:** `gemini-3.1-flash-lite`
- **AI output:** JSON Schema structured output, validated again with Zod
- **API documentation:** OpenAPI and Swagger
- **Testing:** Vitest and Fastify inject
- **Local environment:** Docker Compose

Fastify is a good fit for a small REST API, TypeScript keeps the API and AI result types explicit, and PostgreSQL allows the solution to grow without replacing the data layer.

### Hosted AI rather than a local model

The application server will not store or run a multi-gigabyte AI model. The backend sends requests to the hosted Gemini API, and Google runs the model infrastructure.

```text
Application backend -> HTTPS request -> Gemini API -> structured JSON result
```

The API key is stored only in the backend environment. It must never be included in frontend code or returned through an endpoint.

### Why the MVP does not need model training

Most task-specific AI assistants are not trained from scratch. Their behavior is usually defined using:

- a system instruction describing the model's role and rules;
- a strict output schema;
- a small number of representative examples when necessary;
- application code that validates the result and makes sensitive decisions;
- retrieval-augmented generation, or RAG, only when external company documents are needed.

This project only needs classification, information extraction, summarization, and draft generation. These tasks can be handled with instructions and structured output. Fine-tuning would add cost and complexity without providing meaningful value for the MVP.

### Zero-cost demo constraint

The demo will use a Gemini Developer API free-tier project created through Google AI Studio. The selected model currently supports free-tier input and output usage, subject to Google's rate limits and availability rules.

Important constraints:

- The application must not automatically switch to a paid model or paid provider.
- The demo should use synthetic customer data because Google states that free-tier content may be used to improve its products.
- Free-tier quotas and model availability can change, so setup documentation must point to the current Gemini pricing and rate-limit pages.
- A provider failure or exhausted quota must produce an `ANALYSIS_FAILED` state instead of losing the inquiry.

Configuration:

```env
GEMINI_API_KEY=replace-with-server-side-secret
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_TIMEOUT_MS=20000
GEMINI_MAX_RETRIES=2
```

Application code should depend on an `AnalysisProvider` interface instead of importing the Gemini SDK throughout the codebase. This makes the provider mockable in tests and replaceable later without changing the inquiry workflow.

## 4. High-level architecture

```text
Web form
   |
   v
Public API -> validation -> duplicate check -> database
                                      |
                                      v
                              analysis service
                                      |
                                      v
                              Gemini hosted API
                                      |
                     analysis and optional draft
                                      |
                                      v
                                  database
                                      |
                                      v
                                  Admin API
```

For the MVP, analysis can start as an asynchronous task in the same application process after the inquiry is saved. The public endpoint returns `202 Accepted` immediately, and the inquiry initially receives the `RECEIVED` status.

For a production system, background processing should be moved to a durable queue such as BullMQ with Redis or a managed cloud queue. The initial interface should make that later change straightforward.

## 5. Processing flow

1. The web form calls `POST /api/v1/inquiries`.
2. The backend validates the request, normalizes the email address and phone number, and enforces input-length limits.
3. The backend calculates a fingerprint from normalized contact and message data for duplicate detection.
4. The original inquiry is stored before any external AI call.
5. If the inquiry is not a duplicate, AI analysis begins.
6. The backend loads the active company prompt version.
7. Gemini receives the fixed application instruction, company prompt, untrusted customer content, and required JSON Schema as clearly separated sections.
8. The backend validates the returned JSON with Zod. Invalid model output is treated as a processing failure, not as trusted data.
9. In the same response, Gemini recommends whether a reply would help a human reviewer and creates a short draft when appropriate.
10. The backend validates that a recommended reply has a draft and a non-recommended reply has a `null` draft.
11. The analysis, reply recommendation, optional draft, prompt version, and processing events are stored. Every successful result is assigned to human review.
12. The admin API exposes the resulting list and detail views; no response is sent automatically.

## 6. Public API

### `POST /api/v1/inquiries`

Receives an inquiry from the web form.

Example request:

```json
{
  "name": "Mari Maasikas",
  "email": "mari@example.com",
  "phone": "+37255555555",
  "service": "Website development",
  "message": "We need a new company website by the end of next month.",
  "consentToStore": true,
  "sourceReference": "optional-form-submission-id"
}
```

Validation rules:

- `message` and `consentToStore` are required.
- At least one contact method, `email` or `phone`, must be provided.
- `name` and `service` may be omitted because they can sometimes be extracted from the message.
- `message` should contain between 10 and 10,000 characters.
- Unknown fields are rejected.
- The endpoint has a request-body limit and rate limiting.
- `sourceReference`, when present, acts as an idempotency value for the originating form.

Successful response:

```json
{
  "id": "01J...",
  "status": "RECEIVED",
  "message": "Inquiry received"
}
```

The response uses `202 Accepted` because AI processing does not need to block the web-form submission.

Possible errors:

- `400 Bad Request` — invalid JSON.
- `422 Unprocessable Entity` — fields fail validation.
- `429 Too Many Requests` — rate limit exceeded.
- `500 Internal Server Error` — unexpected server error without internal details.

## 7. Admin API and interface

All admin endpoints are placed under `/api/v1/admin` and require authentication. The MVP can use an admin API key stored in an environment variable. A production version should use real users and role-based authorization.

The client sends the configured key in the following header:

```http
x-admin-api-key: replace-with-your-admin-api-key
```

Missing and incorrect keys receive `401 Unauthorized`. The key is compared using a timing-safe comparison and is never written to logs. The API key must contain at least 16 characters.

### `GET /api/v1/admin/inquiries`

Returns a paginated inquiry list.

Supported filters:

- `status`
- `category`
- `priority`
- `replyRecommended`
- `createdFrom` and `createdTo`
- `search` across name, email, and inquiry text
- `page` and `limit`
- `sortBy` - `createdAt`, `customerName`, `requestedService`, `category`, `priority`, or `status`
- `sortOrder` - `asc` or `desc`

The default sort order is newest first. The default page size is 25 and the maximum is 100. The response includes total-count and pagination metadata.

The response is deliberately shaped for an admin table so the frontend does not need to transform raw AI JSON. Each row contains:

- `id`
- `createdAt`
- `customerName`
- `contact`
- `requestedService`
- `messagePreview`
- `category`
- `priority`
- `summary`
- `replyRecommended`
- `hasDraft`
- `status`
- `confidence`

Example response:

```json
{
  "items": [
    {
      "id": "01J...",
      "createdAt": "2026-08-26T09:30:00.000Z",
      "customerName": "Mari Maasikas",
      "contact": "mari@example.com",
      "requestedService": "Website development",
      "messagePreview": "We need a new company website...",
      "category": "SALES",
      "priority": "HIGH",
      "summary": "The customer needs a new company website by the end of next month.",
      "replyRecommended": true,
      "hasDraft": true,
      "status": "READY",
      "confidence": 0.91
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 1,
    "totalPages": 1
  }
}
```

### Admin inquiry table

The admin interface renders the list endpoint as a sortable, filterable table.

| Column | Source | Purpose |
| --- | --- | --- |
| Received | `createdAt` | Shows when the inquiry arrived. |
| Customer | `customerName` and `contact` | Identifies the customer. |
| Service | `requestedService` | Shows the service extracted from the form or message. |
| Category | `category` | Groups sales, support, billing, and other inquiries. |
| Priority | `priority` | Makes urgent work visible. |
| AI summary | `summary` | Gives the admin a concise answer without opening the full inquiry. |
| Reply | `replyRecommended` | Shows whether Gemini prepared a reply for human review. |
| Draft | `hasDraft` | Shows whether a short editable draft is available. |
| Status | `status` | Shows whether processing succeeded or needs attention. |
| Review | constant human-review policy | Every inquiry remains visible for human review. |

Clicking a row opens the inquiry detail view with the original message, all extracted fields, AI summary, response draft, risk flags, prompt version, and audit history.

### `GET /api/v1/admin/inquiries/:id`

Returns:

- the original form submission;
- the structured AI analysis;
- status, category, and priority;
- the selected next action and its reason;
- the response draft, when present;
- a duplicate reference, when present;
- processing errors and timestamps;
- the company prompt version used for the analysis;
- the inquiry's audit events.

### `GET /api/v1/admin/settings/ai`

Returns the currently active company prompt and its metadata.

```json
{
  "companyPrompt": "We are a web-development agency serving small businesses. Never promise a delivery date or price. Use a friendly, concise tone.",
  "version": 3,
  "updatedAt": "2026-08-26T09:00:00.000Z"
}
```

Before the first prompt has been saved, the endpoint returns an empty `companyPrompt` with `null` for `version` and `updatedAt`.

### `PUT /api/v1/admin/settings/ai`

Updates the company-specific prompt used in every Gemini request.

```json
{
  "companyPrompt": "We are a web-development agency serving small businesses. Never promise a delivery date or price. Use a friendly, concise tone. Escalate WordPress security incidents."
}
```

The endpoint trims the value, enforces a maximum length of 5,000 characters, and creates a new immutable prompt version instead of overwriting history. An empty string is allowed and means that no additional company context is active. Updating the prompt affects only new AI operations; previously completed inquiries retain the prompt-version reference used for them.

The admin UI presents this setting as a multiline text area with Save and Reset actions, the active version, last-updated time, and a clear notice that secrets and personal data must not be placed in the prompt.

### API documentation

Interactive Swagger documentation is available at `GET /documentation`. The generated OpenAPI JSON is available at `GET /documentation/json`. Swagger declares `x-admin-api-key` as the `AdminApiKey` security scheme so authenticated requests can be tried from the documentation page.

### Recommended later endpoints

- `PATCH /api/v1/admin/inquiries/:id` — manually update status, category, or priority.
- `POST /api/v1/admin/inquiries/:id/reanalyze` — retry a failed analysis.
- `POST /api/v1/admin/inquiries/:id/approve-draft` — approve a draft before sending it.

## 8. AI analysis output

Gemini must return only data matching a predefined JSON Schema. The same data is validated again by the backend.

Recommended structure:

```json
{
  "language": "en",
  "category": "SALES",
  "priority": "HIGH",
  "sentiment": "NEUTRAL",
  "extracted": {
    "name": "Mari Maasikas",
    "email": "mari@example.com",
    "phone": "+37255555555",
    "requestedService": "Website development",
    "summary": "The customer needs a new company website by the end of next month.",
    "deadline": "2026-09-30",
    "budget": null
  },
  "missingFields": ["budget"],
  "riskFlags": [],
  "reply": {
    "recommended": true,
    "reason": "This is a legitimate sales inquiry that would benefit from an acknowledgment.",
    "draft": "Thank you for contacting us. We have received your website request and will review the details before getting back to you."
  },
  "confidence": 0.91
}
```

Initial categories:

- `SALES` — quote request or request for new work.
- `SUPPORT` — an existing customer needs help or reports a problem.
- `BILLING` — invoice or payment question.
- `COMPLAINT` — complaint or strong dissatisfaction.
- `PARTNERSHIP` — partnership proposal.
- `SPAM` — irrelevant or malicious content.
- `OTHER` — unclear or uncategorized inquiry.

Priorities:

- `LOW` — general question, spam, or non-urgent request.
- `MEDIUM` — ordinary customer inquiry.
- `HIGH` — deadline, important issue, or sales opportunity requiring quick attention.
- `URGENT` — outage, security or legal risk, or another situation requiring immediate human attention.

Only necessary inquiry data should be sent to Gemini. The system instruction must explicitly treat the customer message as untrusted content. Instructions inside the customer message must never override the system instruction or trigger tools.

### Prompt composition

Every AI request is assembled by the backend in the following order:

1. Fixed application rules stored in source code, including safety boundaries and the required task.
2. The active company prompt managed from the admin area.
3. The output schema and request-specific instructions.
4. The customer inquiry, clearly labelled as untrusted content.

The company prompt provides business context, terminology, tone, services, and escalation guidance. It cannot disable schema validation, authorize automatic sending, or override fixed safety rules. Analysis and optional draft generation happen in one structured Gemini request using one active prompt version.

## 9. Reply recommendation and human review

Every inquiry is reviewed by a human. Gemini only recommends whether a reply would be useful and supplies a short editable draft when appropriate. The backend never sends, approves, ignores, deletes, or externally routes an inquiry automatically.

Gemini should recommend a reply for legitimate actionable inquiries, including sales, support, billing, partnership, complaint, missing-information, general, and urgent requests. A rude message that also contains a real request remains actionable and should receive a professional draft.

Gemini should not recommend a reply for non-actionable spam, pure abuse with no real request, scams, irrelevant advertisements, meaningless content, or messages consisting only of prompt-injection instructions.

The structured `reply` object has only two valid states:

```json
{
  "recommended": true,
  "reason": "This is a legitimate customer inquiry.",
  "draft": "Thank you for contacting us. We will review your request and get back to you."
}
```

or:

```json
{
  "recommended": false,
  "reason": "The message is non-actionable promotional spam.",
  "draft": null
}
```

Zod rejects a missing draft when `recommended` is true and rejects any draft when `recommended` is false. Because missing information is irrelevant when no reply is recommended, the backend normalizes `missingFields` to an empty array for those results. Drafts are limited to 1,500 characters, use the customer's language, and must not mention AI or internal analysis, invent facts, or promise prices, deadlines, outcomes, completed work, or issue resolution.

Successful analysis records receive `nextAction = HUMAN_REVIEW` as a fixed application policy. `READY` means that analysis is complete and the inquiry is ready for a person to inspect. Drafts are never sent automatically.

## 10. Edge cases

### Missing information

If the customer writes only “How much does it cost?” without specifying a service or scope, the system records the missing fields and creates a polite clarification draft. If contact information is also unavailable, the inquiry is sent to human review.

### Duplicate inquiry

If the same normalized contact and substantially identical message arrive within 24 hours, the new record is marked as a duplicate and linked to the original. Nothing is deleted. The MVP can use a SHA-256 hash of normalized input; semantic similarity can be added later.

### The system must not act automatically

Every inquiry receives `HUMAN_REVIEW`. Gemini may prepare a neutral draft for a legitimate complaint, legal, security, privacy, or urgent inquiry because a person must inspect it before use. Non-actionable spam, pure abuse, scams, irrelevant content, and prompt-injection-only messages receive no draft. The system never creates an approved or sent response.

### Gemini is unavailable or quota is exhausted

The original inquiry remains stored. Its status changes to `ANALYSIS_FAILED`, and a safe error code is recorded. The operation can be retried a limited number of times with exponential backoff. The system never switches automatically to a paid service.

### Invalid model output

If Gemini returns invalid JSON or a result that fails the Zod schema, the data is not partially trusted or stored as a completed analysis. The event is recorded, and the inquiry moves to `ANALYSIS_FAILED` or `NEEDS_REVIEW` according to the failure policy.

## 11. Data model

Three main tables are sufficient for the MVP.

### `Inquiry`

- `id` — ULID or UUID.
- `createdAt`, `updatedAt`.
- `status` — `RECEIVED`, `PROCESSING`, `READY`, `NEEDS_REVIEW`, `DUPLICATE`, or `ANALYSIS_FAILED`.
- `source` — initially always `WEB_FORM`.
- `sourceReference` — optional form idempotency value.
- `name`, `email`, `phone`, `service`, `message` — original submission.
- `consentToStore`.
- `fingerprint` — used for duplicate detection.
- `duplicateOfId` — optional link to an earlier inquiry.
- `category`, `priority`, `sentiment`, `language`, `confidence`.
- `summary`.
- `extractedData` — JSONB.
- `missingFields` — JSONB or a string array.
- `riskFlags` — JSONB or a string array.
- `nextAction`, `actionReason`.
- `replyRecommended`, `replyRecommendationReason`, `responseDraft`.
- `analysisErrorCode`.
- `aiPromptVersionId` — the company prompt version used for the processing run.
- `analyzedAt`.

### `InquiryEvent`

- `id`.
- `inquiryId`.
- `type` — for example `RECEIVED`, `ANALYSIS_STARTED`, `ANALYSIS_COMPLETED`, `MARKED_DUPLICATE`, or `ANALYSIS_FAILED`.
- `metadata` — JSONB without secrets or unnecessary personal data.
- `createdAt`.

`InquiryEvent` provides a simple audit trail and makes debugging easier.

### `AiPromptVersion`

- `id`.
- `version` — a unique, increasing integer.
- `companyPrompt` — the admin-defined business instruction.
- `isActive` — only one version may be active.
- `createdAt`.
- `createdBy` — optional until real admin users are implemented.

Prompt updates create a new row and deactivate the previous version in one database transaction. Keeping immutable versions makes past AI results reproducible and auditable.

## 12. Suggested project structure

```text
src/
  app.ts
  server.ts
  config/
    env.ts
  modules/
    inquiries/
      inquiry.routes.ts
      inquiry.schemas.ts
      inquiry.service.ts
      inquiry.repository.ts
      inquiry.types.ts
    admin/
      admin.auth.ts
      admin.repository.ts
      admin.routes.ts
      admin.schemas.ts
      admin.service.ts
    settings/
      ai-settings.routes.ts
      ai-settings.schemas.ts
      ai-settings.service.ts
      ai-settings.repository.ts
    analysis/
      analysis.provider.ts
      gemini.provider.ts
      analysis.service.ts
      analysis.prompt.ts
      analysis.schema.ts
    decisions/
      decision-engine.ts
  plugins/
    database.ts
    error-handler.ts
    swagger.ts
  shared/
    errors.ts
    logger.ts
prisma/
  schema.prisma
  migrations/
tests/
  unit/
  integration/
```

## 13. Security and data protection

- Require authentication for every admin endpoint.
- Keep `GEMINI_API_KEY`, the admin API key, and database credentials in server-side environment variables.
- Never expose the Gemini key to the browser or return it through an API response.
- Do not log full messages, email addresses, phone numbers, prompts, or model responses.
- Do not allow secrets, credentials, or customer personal data in the company prompt.
- Treat the admin-defined company prompt as lower priority than the application's fixed safety and output rules.
- Record prompt changes and retain the prompt-version reference used for each analysis.
- Apply input-length limits, rate limiting, and strict schema validation.
- Treat AI output as untrusted until it passes backend validation.
- Ensure customer text cannot override system instructions or invoke tools.
- Do not expose stack traces or internal provider errors in public responses.
- Use only synthetic customer data with the Gemini free tier.
- Agree on retention and deletion rules before processing real personal data.
- Restrict CORS to known web-form and admin-application origins.
- Add timeouts and bounded retries to all Gemini API calls.

## 14. Testing plan

### Unit tests

- Input validation and normalization.
- Fingerprint generation and duplicate rules.
- Reply recommendation and draft consistency rules.
- AI JSON result validation.
- Priority and risk rules.
- Gemini provider error mapping.
- Prompt-injection and sensitive-data scenarios.
- Prompt composition order and company-prompt length validation.
- Prompt-version creation and selection of exactly one active version.

### Integration tests

- A valid form submission returns `202` and is stored.
- Invalid or oversized input is rejected.
- Reusing a `sourceReference` does not create two independent inquiries.
- A mocked Gemini provider returns analysis and the inquiry reaches `READY`.
- A provider failure preserves the original inquiry and produces `ANALYSIS_FAILED`.
- Invalid model output is rejected safely.
- Admin endpoints reject requests without authentication.
- Admin filters and pagination work correctly.
- The admin list response contains all fields required by the inquiry table.
- An authenticated admin can read and update the company prompt.
- An unauthenticated caller cannot read or update the company prompt.
- Updating the company prompt creates a new version and does not change old inquiry records.
- Analysis and optional draft generation use one request and one active prompt version.
- A duplicate is linked to the original inquiry.
- A legitimate inquiry stores a short draft for human review.
- Non-actionable spam stores a no-reply recommendation and a `null` draft.

Automated tests must never call the real Gemini API. They use a deterministic mock provider, so the test suite remains free, fast, and repeatable.

## 15. Implementation phases

### Phase 1 — Project foundation

- Create the Node.js, TypeScript, and Fastify project.
- Add environment-variable validation.
- Configure PostgreSQL, Prisma, and the first migration.
- Add central error handling, structured logging, and health endpoints.
- Document how to obtain a Gemini API key from Google AI Studio.

Result: the server starts locally and verifies its database connection.

### Phase 2 — Web-form ingestion

**Status: completed on 2026-08-27.**

- Implemented `POST /api/v1/inquiries` with a `20,000`-byte route body limit.
- Added strict Zod validation, blank-field handling, and normalization for names, email addresses, phone numbers, services, and messages.
- Stored each original inquiry and its `RECEIVED` audit event through one atomic Prisma nested write.
- Added `sourceReference` idempotency, including a database unique constraint and race-condition recovery.
- Added SHA-256 fingerprint duplicate detection for the same normalized contact and equivalent message within the configured 24-hour window.
- Linked duplicates through `duplicateOfId`, set their status to `DUPLICATE`, selected `MARK_DUPLICATE`, and created a `MARKED_DUPLICATE` audit event.
- Added configurable per-client rate limiting with a standard `429` response.
- Added a composite database index for the fingerprint and creation-time duplicate query.
- Added unit and integration coverage for successful storage, normalization, validation, idempotency, duplicates, body limits, audit events, and rate limiting.

Result: the web form can safely submit an inquiry and immediately receive its ID.

### Phase 3 — Gemini analysis

- **Status: completed on 2026-08-27.**
- Defined a Gemini-compatible JSON Schema and stricter backend Zod validation.
- Added the provider-independent `AnalysisProvider` contract and Gemini implementation.
- Composed prompts from fixed safety rules, the active immutable company-prompt version, the analysis date, and clearly labelled untrusted customer data.
- Added a 20-second configurable request timeout and two configurable bounded SDK retries.
- Mapped timeout, quota, authentication, invalid-output, and availability failures to safe internal codes.
- Added an atomic `RECEIVED` to `PROCESSING` claim so concurrent work cannot analyze one inquiry twice.
- Triggered analysis asynchronously for fresh non-duplicate submissions while preserving the immediate `202` response.
- Persisted validated analysis fields, then set successful records to `READY` for human review.
- Preserved the original form data and set failures to `ANALYSIS_FAILED` with audit events.
- Added mock-provider unit and integration coverage; automated tests never call Gemini.

Result: a stored inquiry is enriched with a category, priority, summary, and extracted fields.

### Phase 4 — Reply recommendation and draft

- **Status: completed on 2026-08-27.**
- Extended the single structured Gemini response with a reply recommendation, internal reason, and nullable short draft.
- Instructed Gemini to draft for legitimate actionable inquiries and omit drafts for non-actionable spam, pure abuse, scams, irrelevant content, and meaningless content.
- Added strict Zod consistency checks between the recommendation and draft.
- Normalized irrelevant `missingFields` to an empty array for no-reply results.
- Stored `replyRecommended`, `replyRecommendationReason`, and `responseDraft` with an indexed recommendation field.
- Assigned every successful analysis to `HUMAN_REVIEW`; no response is sent, approved, ignored, deleted, or externally routed automatically.
- Added `DRAFT_CREATED` and `REPLY_NOT_RECOMMENDED` audit events without storing draft text in event metadata.
- Added mock-provider coverage for both legitimate-draft and spam-no-draft workflows.

Result: every analyzed inquiry is ready for human review with urgency, a short analysis, and an optional editable reply draft.

### Phase 5 — Admin API

- Add admin API-key authentication.
- Implement the table-ready list endpoint with filters, sorting, and pagination.
- Implement the detail endpoint.
- Implement the read and update endpoints for the versioned company prompt.
- Define the admin table columns and company-prompt text-area contract for the frontend.
- Document endpoints with Swagger.

- **Status: completed on 2026-08-27.**
- Protected the complete `/api/v1/admin` scope with the `x-admin-api-key` header and a timing-safe key comparison.
- Added table-ready list output with bounded pagination, explicit sortable fields, combined filters, case-insensitive search, and newest-first defaults.
- Added a detail response containing the original submission, structured AI analysis, reply draft, required human-review state, duplicate reference, prompt version, and audit history without exposing the internal fingerprint.
- Added company-prompt read and update endpoints. Each save trims the prompt and creates a new immutable version in a serializable transaction; an empty prompt acts as Reset.
- Added Swagger UI at `/documentation` and OpenAPI JSON at `/documentation/json` with an admin API-key security scheme.
- Added Phase 5 integration tests for authentication, filters, pagination, sorting, detail retrieval, missing records, prompt history, and OpenAPI publication.

Result: an admin application can securely display organized AI results and manage the business-specific prompt used in future AI requests.

### Phase 6 — Quality and demo setup

- Add unit and integration tests.
- Add Docker Compose and `.env.example`.
- Add seed data containing synthetic inquiries.
- Document API-key setup, startup, migrations, and API usage.
- Verify type checking, tests, and the production build.

Result: the backend can be started locally from one documented workflow and is ready for demonstration.

## 16. MVP completion criteria

The backend is complete for the MVP when:

- A valid web-form inquiry is stored and returns an inquiry ID.
- Analysis produces a validated category, priority, summary, and structured fields.
- Gemini recommends whether a reply is appropriate and explains why.
- A short draft is generated for legitimate inquiries when appropriate but is never sent automatically.
- Missing information, duplicates, high-risk content, invalid AI output, and provider failures are handled.
- An authenticated admin can retrieve the inquiry list and details.
- The inquiry list is returned in a table-ready structure containing the most important AI results.
- An authenticated admin can edit a versioned company prompt included in every new AI request.
- Each analyzed inquiry records which company prompt version was used.
- Core workflows are covered by automated tests using a mock AI provider.
- The project starts through documented local commands.
- No model download is required.
- The demo works within a free-tier Gemini project and contains no automatic paid fallback.

## 17. Later extensions

- Email inbox integration.
- Integration with a real CRM such as HubSpot or Pipedrive.
- A durable Redis and BullMQ processing queue.
- Role-based admin authentication.
- Draft approval and reply delivery.
- SLA deadlines and owner assignment.
- Semantic duplicate detection using embeddings.
- RAG or Gemini File Search for company service descriptions and policies.
- Analytics for categories, response times, and conversions.
- Multi-tenant support.
- Optional paid provider configuration for a production deployment.
- Fine-tuning only if measured evaluation results show that prompting and retrieval are insufficient.

## 18. Technical references

- [Google AI Studio](https://ai.google.dev/aistudio)
- [Gemini API getting started](https://ai.google.dev/gemini-api/docs/get-started)
- [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Vertex AI model tuning overview](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/tune-models)
