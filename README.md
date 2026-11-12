# UniMatch AI

University research and matching for international applicants. The real catalog covers first-year bachelor's programmes in Hong Kong and South Korea: 286 published programmes at 12 institutions (as of 2026-11-11). The matching engine also handles master's profiles.

**Live demo:** https://unimatch-inky.vercel.app

- **Deterministic matching.** Each requirement resolves to PASS, FAIL or UNKNOWN. UniMatch never predicts an admission probability.
- **Sourced facts.** Every published fact quotes an official university page and passes administrator review before students see it.
- **Safe public browsing.** Public pages cannot start a crawl or a model call. The public deployment needs no PostgreSQL, Redis or OpenAI key.

**Stack:** Next.js 16, React 19, TypeScript, Tailwind 4 with a shadcn-style Radix button, PostgreSQL + Prisma 7, Redis + BullMQ, Crawlee, local Playwright and PDF extraction, and a server-only OpenAI provider.

## Quick start: offline demo

Requires Node.js 22.13+ (tested on Node 24) and npm.

```bash
npm ci
cp .env.example .env
npm run db:generate
npm run dev
```

Open **http://localhost:3000** and choose **Find my universities**. The student-facing demo uses a fictional catalog and needs no OpenAI key, database, Redis or student account. The default `DEMO_MODE=DEMO_FIXTURES` is shown prominently. Admin features and optional student accounts (saved profile, documents, priorities) require PostgreSQL and Redis.

Student data stays in the browser:

- The profile is stored under `unimatch-profile-v2` in local storage; an older `unimatch-profile-v1` profile migrates automatically.
- The shortlist, document checklist and compare selection also stay in local storage.
- Edit the profile on **My profile**, or remove it with **Delete my saved profile**. No identity documents are collected.

## Real catalog and research workspace

```bash
docker compose up -d
npm run db:migrate
npm run db:seed
npx playwright install chromium
npm run admin:password
```

Then configure `.env`:

1. Set `ADMIN_EMAIL`.
2. Copy the generated `ADMIN_PASSWORD_HASH=base64:...` line. The base64 wrapper protects bcrypt's dollar signs from Next.js environment-variable expansion; it is still a bcrypt hash, not an encoded plaintext password.
3. Set `DEMO_MODE=false` to use the PostgreSQL catalog.
4. Optionally set `OPENAI_API_KEY` to enable live research.

Start the web app and the worker together:

```bash
npm run dev:all
```

Or run `npm run dev` and `npm run worker` in separate terminals. For a production-mode local run, use `npm run build && npm start` with the worker in a separate terminal.

- Restart both processes after editing environment variables.
- In production mode, rebuild after changing `DEMO_MODE` so the landing and profile banners match the catalog mode.
- PostgreSQL and Redis bind to loopback ports **5434** and **6381** to avoid typical local defaults. The Docker credentials are for local development only.
- Browser and admin origin checks use `NEXT_PUBLIC_APP_URL`. Its scheme, host and port must match the URL you visit.

## Run a research job

1. Sign in at **/admin** with your configured credentials.
2. Select a registered university such as **HKUST**; its official programme pages are pre-approved.
3. Enter a specific target such as "Computer Science BSc admission requirements and tuition".
4. Click **Research / refresh** and keep the worker running.
5. Watch the stages, logs, pages, errors and token usage. The dashboard polls every four seconds.
6. Open the candidate's retrieved source and editable JSON. Confirm the programme, year, scope, exact quotations and conditions.
7. Approve to publish, or reject. Tick the completeness checkbox only after checking the full mandatory requirement set.
8. Open **/results** in real mode. Published facts affect matching immediately.

For a first experiment, set `MAX_CRAWL_PAGES=1` and `MAX_AI_CALLS_PER_JOB=2`, then expand after inspecting the results.

**Registered universities** (HKU, HKUST, CUHK, PolyU, HKBU, KAIST, POSTECH, UNIST and Korea University, in `prisma/registry.ts`; programmes in `prisma/registry-programs.json` and `prisma/registry-programs-kr.json`):

- Research reads the institution's international-admission, fee and scholarship pages once per university.
- It then makes one model call per registered programme over that programme's own pages and merges the shared facts into its candidate.
- A fee page whose tuition differs by programme is registered with `fees: "per-program"` and read by every programme call instead.
- When only institution facts change, candidates are rebuilt without new model calls.
- To add a degree, register it there with its official page.

**Other universities:**

- Pages are gated before any model call. Noise URLs and pages without amounts, deadlines, test scores, funding or admission wording are saved but skipped.
- An extraction that yields a programme with no facts creates no candidate.
- Candidates whose programme title is generic or absent from the source are flagged for review.
- Institution-wide scholarship pages may return `program:null`. These can publish scholarship options but cannot create institution-wide admission rules, and their scope and restrictions still need explicit review.

A missing key disables submission and scheduling. A failed source or model request produces real errors, never substitute facts. Unchanged source versions that were already extracted cause no further model calls.

## Catalog data

`npm run db:seed` is idempotent. It creates the Hong Kong and South Korean institutions, registered programmes and approved source URLs from `prisma/curated.ts` and `prisma/registry.ts`. `scripts/import-browser.ts` adds Yonsei UIC, GIST and SKKU. Discovering a degree does not establish admission eligibility: facts come only from reviewed research, and seed scripts never overwrite reviewed facts.

HKU's supplied research URL is an explicitly historical 2026 page. It demonstrates source retrieval but does not confirm a future intake; replace it with the applicable intake source during review.

The fictional fixture catalog lives only in `lib/demo.ts`, never in the real database. It exercises missing scores, missing deadlines, nationality restrictions, conflicting requirements, tuition-only funding, competitive full coverage, guaranteed terms and master's prerequisites.

### Curation and review scripts

Reviewer scripts in `scripts/` curated most of the published catalog without model calls: the `curate-*.ts` scripts, `add-tuition-hk.ts`, `polyu-costs.ts`, `postech-costs.ts`, `scholarship-rules.ts` and others.

- Each script fetches pages through the guarded crawler, quotes the stored page text verbatim, and writes `SOURCE_BACKED` facts with review records.
- Scripts are dry runs by default and write only with `APPLY=1`. Back up the database (`pg_dump -Fc`) first.
- `ADMIN_VERIFIED` comes only from the project owner. `scripts/owner-confirm.ts` and `scripts/hkust-accommodation.ts` require `OWNER_CONFIRMED=1` and `OWNER_NAME`.

```bash
npm run review:auto                                  # dry run of the requirementsComplete auto-review
npx tsx --env-file=.env scripts/evidence-report.ts   # every published quotation is verbatim in its page
npm run coverage                                     # per-university coverage report (Markdown)
SEED=20261111 npx tsx --env-file=.env scripts/red-team.ts   # read-only red-team spot check against live pages
```

### Refresh scheduling

```bash
npm run schedule
```

This CLI selects stale sources on approved universities, marks old facts outdated and queues bounded jobs. Run it from local cron or your OS scheduler, for example once a day; no paid scheduling service is needed. It requires the OpenAI key, PostgreSQL, Redis and a running worker.

Facts also expire at catalog-read time, even when the scheduler is not running. Unchanged rechecks can restore stale published facts without claiming a new human verification. Conflicting facts stay uncertain until review.

## Configuration

See [.env.example](.env.example) for all defaults.

| Variable                                  | Purpose                                                              |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`                            | PostgreSQL connection; needed for real catalog/admin/worker          |
| `REDIS_URL`                               | BullMQ, login throttling, model concurrency and budgets              |
| `OPENAI_API_KEY`                          | Optional secret; live OpenAI functionality requires it               |
| `OPENAI_MODEL`                            | Defaults to `gpt-5.4-mini`                                           |
| `OPENAI_BASE_URL`                         | Defaults to `https://api.openai.com/v1`; server-controlled only      |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`      | Environment-configured administrator                                 |
| `NEXT_PUBLIC_APP_URL`                     | Expected browser origin, default localhost:3000                      |
| `DEMO_MODE`                               | `DEMO_FIXTURES` or `false`                                           |
| `ENABLED_COUNTRIES`                       | Destinations students see; default `Hong Kong,South Korea`           |
| `PUBLIC_MODE`                             | `true` hides admin and accounts; no Redis needed                     |
| `CATALOG_SOURCE`, `CATALOG_SNAPSHOT_PATH` | `db` (default) or `snapshot`; default `data/catalog-snapshot.json`   |
| `MAX_CRAWL_PAGES`, `MAX_CRAWL_DEPTH`      | 12 pages (max 500), depth 3 by default                               |
| `MAX_CONCURRENT_CRAWLS`, `CRAWL_DELAY_MS` | 2 requests, minimum 2-second domain delay                            |
| `MAX_CONTENT_BYTES`                       | Download cap, default 2 MB per resource                              |
| `MAX_AI_CALLS_PER_JOB`                    | 6 attempts per job (max 500), including retries                      |
| `MAX_AI_CONCURRENCY`                      | 1 concurrent provider call by default                                |
| `MAX_AI_OUTPUT_TOKENS`, `AI_TIMEOUT_MS`   | Output and request bounds                                            |
| `DAILY_AI_TOKEN_LIMIT`                    | UTC daily token budget; code default 100,000, `.env.example` 500,000 |
| `FRESHNESS_DEADLINE_DAYS`                 | 7 days; 30 on the demo deployment                                    |
| `FRESHNESS_SCHOLARSHIP_DAYS`              | 30 days; also admissions/cost facts                                  |
| `FRESHNESS_METADATA_DAYS`                 | 90 days                                                              |

**Currency.** Costs in another currency are converted at dated National Bank of Ukraine reference rates (`lib/fx-rates.json`, currently 2026-11-11; refresh manually with `npm run fx:update`). A converted amount within 5% of the budget stays UNKNOWN, and a currency without a rate is never converted.

**Model budget.** The application enforces a token budget, not an invented dollar estimate. Provider-reported usage is persisted. Reservations conservatively count input bytes plus maximum output tokens, then reconcile to reported usage. Failed requests keep their reservations because upstream billing is unknown.

## Testing

```bash
npm test                    # unit + mocked transport; no services or credits
npm run typecheck
npm run lint
npm run build
npm run test:integration     # real PostgreSQL/Redis + local fixtures + Chromium
npm run test:e2e             # Chromium; starts its own test app on port 3001
```

Integration and E2E tests need Compose running, migrations applied, the seed loaded and Chromium installed.

- Tests never call OpenAI or real universities.
- Integration tests use unique temporary records and queues, then clean them up.
- E2E credentials exist only in the test-server environment and are not a deployed login.
- E2E screenshots go to the git-ignored `output/playwright/`.

HTML and PDF fixture extraction, browser fallback, PostgreSQL publication, BullMQ retry and the student and admin browser flows were exercised during implementation. Fixture responses cover request format, usage parsing, schema rejection, retries and budgets.

Optional live tests:

```bash
# Official university HTTP retrieval, no model credits:
LIVE_CRAWL_TEST=1 npm run test:crawl

# Restrict the crawl smoke test:
CRAWL_UNIVERSITY_IDS=hkust LIVE_CRAWL_TEST=1 npm run test:crawl

# Real OpenAI extraction; requires OPENAI_API_KEY and consumes credits:
LIVE_OPENAI_TEST=1 npm run test:live
# Bounded synthetic extraction + explanation quality regression (2 calls):
LIVE_OPENAI_TEST=1 npm run test:model
```

The OpenAI smoke test creates a real research job for `LIVE_UNIVERSITY_ID` (default HKUST), limits it to one page and two model attempts, and requires a metered extraction candidate to succeed. It does not approve the result.

## Deployment

The public site serves a frozen catalog snapshot, so the host needs no PostgreSQL, Redis or OpenAI key. `PUBLIC_MODE=true` hides the admin and account pages.

```bash
npm run catalog:export       # data/catalog-snapshot.json from the published catalog
CATALOG_SOURCE=snapshot PUBLIC_MODE=true DEMO_MODE=false npm run build && npm start
npm run smoke -- <url>       # pages, browser errors and sample-student results against the snapshot
npm run screens -- <url>     # output/screens/ at 390 and 1440 px, with an overflow check
```

Production runs on Vercel (project `unimatch`). The project sets `PUBLIC_MODE=true`, `CATALOG_SOURCE=snapshot`, `DEMO_MODE=false`, `ENABLED_COUNTRIES`, `FRESHNESS_DEADLINE_DAYS=30` and `NEXT_PUBLIC_APP_URL`. Deploy with `vercel deploy --prod`, then run `npm run smoke -- https://unimatch-inky.vercel.app`. `.vercelignore` keeps `.env` files and local artifacts out of uploads.

`/api/health` reports the catalog source, counts, last verification and commit. Freshness still expires at read time, so set `FRESHNESS_DEADLINE_DAYS` on the host as well.

## Repository map

```text
app/                  App Router pages and protected admin APIs
components/           Responsive student/admin interfaces and UI primitives
lib/domain.ts         Profile, program and evidence contracts
lib/matching.ts       PASS / FAIL / UNKNOWN matching and funding scenarios
lib/catalog.ts        Published PostgreSQL or JSON snapshot → student view
lib/trust.ts, whatif.ts, arithmetic.ts, actions.ts   Trust tiers, "what would change this", cost lines, next steps
lib/personas.ts       Sample students whose stories tests and the smoke test enforce
lib/fx.ts             Dated reference exchange rates (lib/fx-rates.json)
lib/ai/openai.ts      Structured OpenAI extraction/explanation and budget control
lib/research/         Pinned-IP transport, crawler, schemas, pipeline, review
prisma/               Normalized schema, migrations, seed and programme registry
data/                 Catalog snapshot served by the public deployment
worker/               BullMQ worker and retry processor
scripts/              Curation, review, export, smoke, screenshots, scheduling and opt-in live checks
tests/                Offline unit, local integration and browser tests
docs/                 AI handoff notes
```

## Limitations and roadmap

Eligibility decisions are deliberately conservative.

- **Coverage.** UniMatch does not cover every qualification equivalency, legal or visa pathway, or scholarship rule. Complex OR conditions, credential recognition, service obligations and need-based calculations remain manual-review conditions. The model is instructed not to turn alternatives into independent mandatory failures.
- **Catalog.** The real catalog is not a complete admissions database. Most seed facts stay unknown until researched and reviewed. Real scholarships are researched through approved funding sources; the seed never fabricates scholarship amounts or awards.
- **Retrieval.** Scanned or image-only PDFs need OCR, which is not included. Browser fallback loads only approved resources and can fail on sites that depend on unapproved third-party scripts. The browser renders public pages; it never bypasses access controls.
- **Extraction and review.** Extraction handles one explicit programme, or institution-wide scholarships, per document. Semantic verification remains a human responsibility: a matching quotation does not prove the interpretation is correct. Conflict detection finds overlapping structured fields, not every contradiction in prose. Review uses editable JSON rather than a full admissions editor.
- **Explanations.** The administrator-only `POST /api/admin/explain` endpoint accepts `{ programId, profile }` and explains deterministic results with OpenAI. Students get local deterministic explanations and never send profiles to an LLM.

Next priorities:

- Complete Korean requirements once institutions publish accepted-qualification lists and 2027 English rules.
- Resolve the conflicting PolyU living costs and POSTECH tuition.
- Build a friendlier field-level review editor.
- Add verified qualification and OR-pathway rules.
- Before hosting the admin workspace publicly, add network isolation for browsers, stronger administrator identity management and operational monitoring.

## OpenAI provider

The provider uses OpenAI's [Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) with [strict structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), `max_completion_tokens`, `store:false` and Zod runtime validation. Crawling and PDF extraction stay local.

The default model is [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), a non-frontier model suited to bounded extraction and explanation. Standard text pricing, checked 2026-10-27: $0.75 per million input tokens, $0.075 cached input and $4.50 output. For illustration, 6,000 uncached input plus 1,500 output tokens costs about $0.0113 per successful call; actual length and retries vary. `reasoning_effort:low` gives extraction a small reasoning budget within the output cap. There is no automatic fallback to a larger model. `OPENAI_MODEL` can pin a compatible snapshot.

Credentials use `OPENAI_API_KEY` and an optional `OPENAI_BASE_URL` (the official endpoint by default). Research limits use the provider-neutral `MAX_AI_*`, `DAILY_AI_TOKEN_LIMIT` and `AI_TIMEOUT_MS` names. These variables are server-only; restart both the web and worker processes after changing them.
