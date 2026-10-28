# Architecture

## Two independent paths

```mermaid
flowchart LR
  S[Student browser] --> C[Published catalog]
  C --> M[Local deterministic matching]
  P[Local profile] --> M
  A[Authenticated administrator] --> Q[BullMQ / Redis]
  Q --> W[Node worker]
  W --> D[Approved URLs + pinned public IP transport]
  D --> H[Cheerio HTML / local PDF / guarded browser]
  H --> V[Immutable source versions]
  V --> L[OpenAI GPT-5.4 mini / strict JSON]
  L --> Z[Zod + quotation and domain checks]
  Z --> R[Review candidates]
  A --> R
  R -->|explicit approval| C
```

The public interface reads only published PostgreSQL records (or an explicitly separate in-memory fictional catalog). Matching is evaluated on the student's device. The administrator endpoints require database-backed sessions for each request, not just page navigation.

## Persistence and publication

Prisma models separate universities, approved sources, degree programs, application intakes/routes, requirements, scholarships and eligibility links, annual costs, documents, source versions, quotations, jobs/logs, usage, sessions and review records. Arrays represent scalar lists; relationships use foreign keys.

An extraction is a candidate, never automatic administrator verification. Exact excerpts must occur in the immutable source text, and official URLs must belong to approved domains. Explicit review runs in a serializable transaction. It records the original candidate, previous published program state, revised payload, reviewer and timestamp. Values with matching scopes are replaced only by approval; previous source versions and audit payloads remain.

Source-backed means a citation passed structural checks, not semantic certainty. Admin-verified means a human explicitly approved. Conflicting and stale evidence cannot establish definitive eligibility. Incomplete coverage stays unknown even if every known score passes.

Institution-wide scholarships are linked at university scope and filtered by supported degree levels and explicit restrictions. Program-specific scholarship relationships remain separate. Institution-wide admission requirements are not blindly copied to every degree.

## Matching

Academic fit, application eligibility, and financial fit remain independent. Mandatory checks use three-valued logic. Missing values, unsupported equivalencies, outdated evidence and unresolved conflicts become UNKNOWN; they never silently PASS.

Dates require an explicit year, deadline and timezone. Multiple application routes are alternatives: one verified open route can satisfy the route condition. Older-year requirement evidence cannot automatically apply to a future intake. English-test alternatives and complex qualification pathways remain manual OTHER rules until a verified rule representation exists.

Financial scenarios never stack scholarships. They show no award, an eligible competitive award, or verified guaranteed terms. Scholarship eligibility is separate from award status. A full ride covers tuition, living and other mandatory costs. Partial/semester prices and currency mismatches cannot create a precise annual affordability claim.

Sorting is lexicographic: confirmed failures last, relevant field first, financial feasibility, evidence completeness, then research recency. There is no opaque numeric match score.

## Crawling and untrusted content

Crawlee controls queues, depth, retry and page limits. CheerioCrawler deliberately skips its built-in network navigation; a pinned-IP transport fetches bounded data and Cheerio extracts text/links. This avoids a validate-then-unrestricted-fetch SSRF vulnerability.

Each URL and redirect must use HTTP(S), approved hostnames, ordinary ports and no credentials. Every resolved address must be globally routable; the actual socket connects to the validated IP with the original Host and TLS SNI. Private, loopback, link-local, metadata, mapped private IPv6 and reserved ranges are rejected. Robots rules are loaded before content and failures are conservative. Same-host requests are delayed; network concurrency is bounded.

Browser fallback requires an explicit source flag and sparse normal HTML. It uses a separate Crawlee queue. Browser HTTP requests are intercepted and fulfilled through the same guarded transport; service workers and WebSockets are disabled. Only bounded approved resources load. It does not use proxies, evasion, login or CAPTCHA solving. Production deployment should add an OS/container egress boundary as defense in depth.

Sources are never instructions or executable server code. Only the browser-rendering path intentionally runs public JavaScript in Chromium. Model instructions remain a stable prefix and explicitly separate source data from commands. The model receives relevant text windows capped at 18,000 characters, not entire websites.

## Model provider

`lib/ai/openai.ts` is the shared server-side provider for extraction and administrator explanations. It calls OpenAI Chat Completions with GPT-5.4 mini by default, strict JSON Schema, `reasoning_effort:low`, and `store:false`. It has no larger-model fallback. `OPENAI_MODEL` allows an explicitly configured compatible model or snapshot; source crawling and student matching require no model calls.

The API schema preserves required nullable fields and closed objects. URI format annotations are omitted because OpenAI does not support that format; the original Zod validators still enforce URLs and all local constraints. Refusals, truncation, malformed data and unsupported evidence fail explicitly. Model usage, including billed output tokens, is recorded before response validation.

Credentials use `OPENAI_API_KEY`, with `OPENAI_BASE_URL` defaulting to the official endpoint. Shared leases, cooldowns and daily reservations use the `openai:` Redis namespace. Limits are provider-neutral `MAX_AI_*`, `DAILY_AI_TOKEN_LIMIT`, and `AI_TIMEOUT_MS` environment variables. No database schema change is needed: usage records already store the actual model identifier.

## Work and budgets

The BullMQ queue has global concurrency one; crawler network concurrency defaults to two. A partial PostgreSQL unique index prevents duplicate active jobs for the same institution. Redis persists queue state, login throttling, OpenAI leases and UTC token reservations.

Provider requests have a timeout, bounded retries, exponential backoff, rate-limit cooldown, output limits, persisted per-job attempt caps and a daily token cap. A short Redis lease controls model concurrency across processes. Reported usage is stored in PostgreSQL; failed or missing usage keeps conservative reservations. Admin displays both reported tokens and consumed/reserved budget.

Successful unchanged source versions skip extraction. Failed or never-extracted versions can retry. Budgets stop jobs with explicit errors rather than purchasing unbounded calls. Local scheduling picks approved stale records; read-time expiry prevents old data from remaining definitive if scheduling stops.

## Authentication and privacy

The sole administrator identity and bcrypt hash are configured in environment variables. A random 256-bit session token is stored only in an HttpOnly, SameSite=Strict cookie; PostgreSQL stores its SHA-256 hash and an eight-hour expiry. HTTPS origins use Secure cookies. Writes enforce the configured Origin, and login attempts use an atomic Redis limit. There is no account signup or default production password.

Anonymous student profiles are browser-local and deletable. No sensitive document uploads exist. Public browsing uses no model requests. The optional administrator explanation API is explicitly server-only, metered, and validates cited URLs against supplied evidence.
