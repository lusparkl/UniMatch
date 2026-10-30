# UniMatch AI

A locally runnable university research and matching MVP for international bachelor's and master's applicants. Next.js 16 / React 19 / TypeScript / Tailwind 4 with a shadcn-style Radix button, PostgreSQL + Prisma 7, Redis + BullMQ, Crawlee, local Playwright and PDF extraction, and a server-only OpenAI provider.

Student matching is deterministic. It never predicts an admission probability. Public browsing cannot start a crawl.

## Start the offline demo

Use Node.js 22.13+ (tested on Node 24) and npm.

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run dev
```

Open **http://localhost:3000** → **Find my universities**. No OpenAI key, database, Redis, or student account is needed for the student-facing fictional demo. The default `DEMO_MODE=DEMO_FIXTURES` is displayed prominently. Admin features, and optional student accounts (saved profile, documents, priorities), require PostgreSQL and Redis.

The profile is stored under `unimatch-profile-v1` in browser local storage. Edit it on **My profile**, or use **Delete my saved profile**. No identity documents are collected.

## Start the real catalog and research workspace

```bash
docker compose up -d
npm run db:migrate
npm run db:seed
npx playwright install chromium
npm run admin:password
```

1. Set `ADMIN_EMAIL` in `.env`.
2. Copy the generated `ADMIN_PASSWORD_HASH=base64:...` line into `.env`. The base64 wrapper protects bcrypt's dollar signs from Next.js environment-variable expansion; it is still a bcrypt hash, not an encoded plaintext password.
3. Set `DEMO_MODE=false` for the real PostgreSQL catalog.
4. Optionally set `OPENAI_API_KEY` to enable live research.
5. Start both processes:

```bash
npm run dev:all
```

Alternatively, run `npm run dev` and `npm run worker` in separate terminals. For a production-mode local run: `npm run build && npm start`, with the worker in a separate terminal. Restart processes after editing environment variables. In production mode, rebuild after changing DEMO_MODE so the landing/profile banners use the same mode as the catalog.

PostgreSQL and Redis bind to loopback ports **5434** and **6381**, avoiding typical local defaults. Docker credentials are for local development. Browser/admin origin checking uses `NEXT_PUBLIC_APP_URL`; its scheme, host and port must match the URL you visit.

## Run one real research job

1. Sign in at **/admin** with your configured credentials.
2. Select **University of Debrecen**; its official Computer Science program page is pre-approved.
3. Use a specific target such as “Computer Science BSc admission requirements and tuition”.
4. Click **Research / refresh**. Keep the worker running.
5. Watch actual stages, logs, pages, errors and returned token usage. The dashboard polls every four seconds.
6. Open the candidate's retrieved source and editable JSON. Confirm the program, year, scope, exact quotations and conditions.
7. Approve to publish, or reject. Mark the completeness checkbox only when you actually checked the full mandatory requirement set.
8. Open **/results** in real mode. Published facts immediately affect deterministic matching.

Set `MAX_CRAWL_PAGES=1` and `MAX_AI_CALLS_PER_JOB=2` for the first experiment. Expand after inspecting results. For universities in `prisma/registry.ts` (HKU, HKUST, PolyU) research makes one model call per registered program over its best-matching stored pages; add a degree there with its official page and the institution's international-admission, fee and scholarship pages. Elsewhere pages are gated before any model call: noise URLs and pages without amounts, deadlines, test scores, funding or admission wording are saved but skipped, and an extraction that yields a program with no facts creates no candidate. Candidates whose program title is generic or absent from the source are flagged for review. Institution-wide scholarship pages may return `program:null`; these may publish scholarship options but cannot create institution-wide admission rules. Institution-wide funding still needs explicit review of scope and restrictions.

A missing key disables submission and scheduling. A failed source or model request produces real errors, never substitute facts. Already-extracted unchanged source versions do not cause additional model calls.

## Initial data

The idempotent seed creates ten real institutions, two in each destination:

| Destination   | Institutions                 |
| ------------- | ---------------------------- |
| United States | MIT, Stanford                |
| Hong Kong     | HKU, HKUST                   |
| Hungary       | ELTE, University of Debrecen |
| Germany       | TUM, Saarland University     |
| Singapore     | NUS, NTU                     |

Each has a sourced program-discovery link and approved program/funding entry URLs. The catalog is intentionally sparse: discovering a degree does not establish admission eligibility.

A small dated Debrecen excerpt snapshot includes published tuition and two conditions that require manual assessment. It is **SOURCE_BACKED**, not **ADMIN_VERIFIED**. Living costs, other mandatory costs and unsupported fields stay null, so no complete annual budget is invented. Seed scripts do not overwrite existing reviewed facts.

HKU's supplied research URL is an explicitly historical 2026 page. It is useful for demonstrating source retrieval, not confirming a future intake. Replace it with the applicable intake source during review.

The fictional fixture catalog exists only in `lib/demo.ts`, never in the real database. It exercises missing scores, missing deadlines, nationality restrictions, conflicting requirements, tuition-only funding, competitive full coverage, guaranteed terms and master's prerequisites.

## Configuration

See [.env.example](.env.example) for all defaults.

| Variable                                  | Purpose                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`                            | PostgreSQL connection; needed for real catalog/admin/worker     |
| `REDIS_URL`                               | BullMQ, login throttling, model concurrency and budgets         |
| `OPENAI_API_KEY`                          | Optional secret; live OpenAI functionality requires it          |
| `OPENAI_MODEL`                            | Defaults to `gpt-5.4-mini`                                      |
| `OPENAI_BASE_URL`                         | Defaults to `https://api.openai.com/v1`; server-controlled only |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`      | Environment-configured administrator                            |
| `NEXT_PUBLIC_APP_URL`                     | Expected browser origin, default localhost:3000                 |
| `DEMO_MODE`                               | `DEMO_FIXTURES` or `false`                                      |
| `MAX_CRAWL_PAGES`, `MAX_CRAWL_DEPTH`      | 12 pages, depth 3 by default                                    |
| `MAX_CONCURRENT_CRAWLS`, `CRAWL_DELAY_MS` | 2 requests, minimum 2-second domain delay                       |
| `MAX_CONTENT_BYTES`                       | Download cap, default 2 MB per resource                         |
| `MAX_AI_CALLS_PER_JOB`                    | 6 attempts per job, including retries                           |
| `MAX_AI_CONCURRENCY`                      | 1 concurrent provider call by default                           |
| `MAX_AI_OUTPUT_TOKENS`, `AI_TIMEOUT_MS`   | Output and request bounds                                       |
| `DAILY_AI_TOKEN_LIMIT`                    | UTC daily token budget, default 100,000                         |
| `FRESHNESS_DEADLINE_DAYS`                 | 7 days                                                          |
| `FRESHNESS_SCHOLARSHIP_DAYS`              | 30 days; also admissions/cost facts                             |
| `FRESHNESS_METADATA_DAYS`                 | 90 days                                                         |

No exchange rates are assumed. Different currencies produce an unknown financial comparison. The application enforces a **token** budget; it does not report an invented dollar estimate. Provider-reported usage is persisted. Conservative reservations include input bytes plus maximum output tokens, then reconcile to reported usage. Failed requests retain their reservations because upstream billing is unknown.

## Refresh scheduling

```bash
npm run schedule
```

This CLI selects stale sources on existing approved universities, marks old facts outdated, and queues bounded jobs. Run it through local cron or your OS scheduler; for example, from this repository once daily. It requires the key, PostgreSQL, Redis and a running worker. No paid scheduling service is needed.

Facts also expire at catalog-read time even if the scheduler is not running. Unchanged rechecks can restore stale published facts without claiming a new human verification. Existing conflicting facts stay uncertain until review.

## Tests and verification

```bash
npm test                    # unit + mocked transport; no services or credits
npm run typecheck
npm run lint
npm run build
npm run test:integration     # real PostgreSQL/Redis + local fixtures + Chromium
npm run test:e2e             # Chromium; starts its own test app on port 3001
```

Integration/E2E prerequisites: start Compose, apply migrations, seed, and install Chromium. Tests never call OpenAI or real universities. Integration tests use unique temporary records/queues and clean them up. E2E credentials exist only in the test-server environment and are not a deployed login. E2E screenshots are written to ignored `output/playwright/`.

Optional live tests:

```bash
# Official university HTTP retrieval, no model credits:
LIVE_CRAWL_TEST=1 npm run test:crawl

# Restrict the crawl smoke test:
CRAWL_UNIVERSITY_IDS=debrecen LIVE_CRAWL_TEST=1 npm run test:crawl

# Real OpenAI extraction; requires OPENAI_API_KEY and consumes credits:
LIVE_OPENAI_TEST=1 npm run test:live
# Bounded synthetic extraction + explanation quality regression (2 calls):
LIVE_OPENAI_TEST=1 npm run test:model
```

The OpenAI smoke creates an actual research job for Debrecen, limits it to one page and two model attempts, and requires a metered extraction candidate to succeed. It does not approve the result.

During implementation, the guarded local crawler successfully retrieved program pages for all ten institutions; HTML and PDF fixture extraction, browser fallback, PostgreSQL publication, BullMQ retry and student/admin browser flows were exercised. Request format, usage parsing, schema rejection, retries and budgets are covered with fixture responses. The live verification status is recorded separately. See [verification notes](docs/VERIFICATION.md).

## Repository map

```text
app/                  App Router pages and protected admin APIs
components/           Responsive student/admin interfaces and UI primitives
lib/domain.ts         Profile, program and evidence contracts
lib/matching.ts       PASS / FAIL / UNKNOWN matching and funding scenarios
lib/catalog.ts        Published PostgreSQL → student view
lib/ai/openai.ts        Structured OpenAI extraction/explanation and budget control
lib/research/         Pinned-IP transport, crawler, schemas, pipeline, review
prisma/               Normalized schema, migrations, seed and source snapshot
worker/               BullMQ worker and retry processor
scripts/              Password hashing, scheduling and opt-in live checks
tests/                Offline unit, local integration and browser tests
docs/                 Architecture, verification and limitations
```

## Boundaries and next improvements

This is an MVP with deliberately conservative eligibility decisions. It does not cover every qualification equivalency, legal/visa pathway or scholarship rule. Complex OR conditions, credential recognition, service obligations and need-based calculations remain manual-review conditions; the model is instructed not to turn alternatives into independent mandatory failures.

The real catalog is not a complete admissions database. Most seed facts are unknown until researched and reviewed. Real scholarships are researched through approved funding sources; the seed does not fabricate scholarship amounts or awards. Scanned/image-only PDFs need OCR, which is not included. Browser fallback only loads approved resources and can fail on sites dependent on unapproved third-party scripts. The browser is for public rendering, not bypassing access controls.

Extraction handles one explicit program or institution-wide scholarships per document. Semantic verification remains a human responsibility; matching a quotation does not prove the interpretation is correct. Conflict detection identifies overlapping structured fields, not every possible contradiction in prose. Review uses editable JSON rather than a comprehensive admissions editor. The administrator-only `POST /api/admin/explain` endpoint accepts `{ programId, profile }` and explains deterministic results with OpenAI; ordinary students use local deterministic explanations and do not send profiles to an LLM.

Next priorities: review a complete real intake end to end, build a friendlier field-level review editor, add verified qualification/OR-pathway rules, then broaden funding evidence and add dated exchange-rate support if needed. Before public hosting, add deployment-specific network isolation for browsers, stronger administrator identity management, and operational monitoring.

## Provider documentation

The provider uses OpenAI's [Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) with [strict structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), `max_completion_tokens`, `store:false`, and Zod runtime validation. Crawling and PDF extraction remain local.

The default is [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), a non-frontier model suited to bounded extraction and explanation. Standard text pricing checked October 27, 2026: $0.75 per million input tokens, $0.075 cached input, and $4.50 output. For illustration, 6,000 uncached input + 1,500 output tokens costs about $0.0113 per successful call; actual length and retries vary. `reasoning_effort:low` gives extraction a small reasoning budget within the output cap. No automatic fallback to a larger model exists. `OPENAI_MODEL` can pin a compatible snapshot if needed.

Provider credentials use `OPENAI_API_KEY` and an optional `OPENAI_BASE_URL` (the official endpoint by default). Research limits use provider-neutral `MAX_AI_*`, `DAILY_AI_TOKEN_LIMIT`, and `AI_TIMEOUT_MS` names. These variables are server-only; restart both web and worker processes after changing them.
