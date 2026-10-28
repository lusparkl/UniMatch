# Verification record

Implementation environment: Node 24, PostgreSQL 17, Redis 7, Chromium installed by Playwright. Verified suite: 72 offline unit/transport tests, 2 local integration tests, and 4 Chromium E2E tests. Typecheck, lint and production build passed. Rerun using README instructions.

## Exercised

- Prisma generation, both SQL migrations, and idempotent real seed.
- TypeScript, ESLint and Next.js production build.
- Offline tests: mandatory academic checks, language thresholds, unknown grade equivalencies, nationality/applicability, intake deadlines/timezones/routes, master's prerequisites, unknown costs, currencies, full coverage versus tuition-only, competitive versus guaranteed funding, and multiple independent awards.
- Local HTML extraction/link discovery; real generated PDF bytes parsed without a cloud service.
- URL/IP restrictions, mapped private addresses, public/private DNS mixtures, redirect-to-metadata blocking, DNS revalidation on redirects, pinned socket destination, robots denial and streaming size bounds.
- Fixture OpenAI responses: documented JSON-schema request, usage persistence, malformed output, authentication errors, rate-limit retries, daily budget, per-job cap and absent credentials.
- Local PostgreSQL/BullMQ integration: a transient failed attempt retries, extraction creates unpublished candidates, invalid evidence cannot publish, approved evidence changes real catalog matching, and an audit record is written.
- Local browser rendering integration with all source requests intercepted; separate HTML/browser queues avoid a shared-queue deadlock.
- Chromium flows: landing → bachelor's wizard → local profile → filtered results → detail; master's questions and mobile overflow; profile deletion; administrator authentication/logout, unauthenticated route rejection, cross-origin rejection and missing-key disabled research.
- Live guarded HTTP retrieval of official program pages for MIT, Stanford, HKU, HKUST, ELTE, Debrecen, TUM, Saarland, NUS and NTU. Source versions are in the local PostgreSQL volume. Only the tiny dated Debrecen excerpt snapshot is committed as reproducible seed data.

An obsolete HKU URL returned 404; the curated URL was updated to an official historical 2026 program page. An overly broad raw-HTML CAPTCHA detector initially rejected ELTE because page code mentioned CAPTCHA; restricting detection to actual page titles/short challenge text allowed ordinary public HTML retrieval. No access restriction was bypassed.

## OpenAI migration checks

- A live GPT-5.4 mini request retrieved Debrecen's official Computer Science page and produced one unpublished review candidate: 4,191 input + 756 output tokens, one call, no transport/schema errors. Inspection found a fabricated intake year and a one-time fee attached to annual tuition; a successful transport check alone does not establish extraction accuracy.
- The final provider uses low reasoning. Instructions now explicitly omit intakes without an explicit year and separate one-time fees. Evidence validation blocks unsupported intake/date years during publication. A unit regression covers the observed fabricated year.
- The opt-in synthetic quality check passed with the final provider: unknown intake year omitted, no invented scholarships despite embedded page instructions, annual tuition and one-time fees separated, missing living costs retained as null, verbatim quotations, and bounded explanation citations. Two calls used 3,015 tokens (including output/reasoning). This is a focused regression check, not a broad admissions benchmark.
- A further final-provider replay of the stored real Debrecen page failed exact-quotation validation on an English-proficiency excerpt. The replay job was recorded as FAILED and no facts were published. This demonstrates the remaining need for source review; the synthetic regression does not establish error-free real-page extraction.
- No model candidate was approved or automatically published during these checks.

## Not verified live

- Scholarship benefit completeness across five countries is not claimed. Approved funding-source URLs are starting points for review, not verified award amounts.
- No claim of an OCR pipeline, fully automated qualification recognition, admission probability, guaranteed competitive award, or live currency conversion.
- No public/cloud deployment or production security audit was performed.

Run `LIVE_OPENAI_TEST=1 npm run test:live` for a bounded real crawl/extraction (unchanged previously extracted pages may be skipped). Run `LIVE_OPENAI_TEST=1 npm run test:model` for the two-call synthetic extraction/explanation regression check using the seeded Debrecen institution. Both consume credits and persist actual usage. Neither approves facts. A complete reviewed real intake and funding evaluation remains future acceptance work.
