# AI Handoff

Updated: 2026-10-30T07:27:00Z
Base commit: e784f8368cec30f50f5de062518da47ef822a85a
Branch: main (not pushed)
Working tree: clean apart from this handoff. Uncommitted content is a snapshot; the commit hash alone does not prove it is current.

## Purpose and architecture
UniMatch: evidence-led university research and matching MVP for international bachelor's/master's applicants (Next.js 16 App Router, React 19, Tailwind 4, Prisma 7/PostgreSQL, Redis/BullMQ). Stable architecture is in `AGENTS.md` and `docs/ARCHITECTURE.md`.
- UI: `app/`, `components/`; one global stylesheet `app/globals.css` (class-name rules).
- Matching: `lib/matching.ts`, `lib/domain.ts` (deterministic PASS/FAIL/UNKNOWN); `lib/readiness.ts` and `lib/documents.ts` build per-program readiness (tests + document checklist).
- Research: `lib/research/` (crawler, extraction, review, security, `programs.ts`, `relevance.ts`); `prisma/registry.ts` lists registered programs; `worker/` runs queued jobs.
- Accounts: `lib/account.ts`, routes `app/api/auth/[action]`, `app/api/account/[...path]`; pages `app/account`, `app/priorities`. Prisma models `User`, `UserSession`, `UserDocument`, `Priority`.

## Implemented state
All committed in `e784f83`:
- Crimson/DM Sans redesign: home, sticky nav (`components/nav.tsx`), shell, button variants, real logo (`public/assets/logo-mark.png`, `app/icon.png`).
- User accounts, priority programs, document readiness panel.
- Program-level extraction: one model call per registered program over the best-matching stored official pages (`PROMPT_VERSION` `program-v12`), with free deterministic page-ranking and noise gates.
- `scripts/cost-benchmark.ts` (`npm run test:cost`) logs model cost to `docs/COST_LOG.md`.
Not built from the design: tabbed detail view, funding-scenario layout, mobile filter toggle on results. Admin page is CSS-restyled only.

## Decisions and environment
- Node 22.13+, npm. Verified commands: `npm run typecheck`, `npm run lint`, `npm test`. Service-backed: `npm run test:integration`, `npm run test:e2e` (PostgreSQL, Redis, migrations, seed, Chromium; port 3001).
- Env variable names (see `.env.example`): `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `DEMO_MODE`, plus crawl/AI budget limits (`MAX_CRAWL_PAGES`, `MAX_AI_CALLS_PER_JOB`, `DAILY_AI_TOKEN_LIMIT`, …).
- Unlayered global element rules must not override Tailwind utilities: links use `a:where(:not(.btn))`; `button` has no background/border reset.
- Live crawl/model runs are opt-in and need authorization. Model in use for extraction: gpt-5.4-mini; cost per job was roughly $0.02–0.07 on 2026-10-29 (`docs/COST_LOG.md`).

## Validation
2026-10-30: `npm run typecheck` clean; `npm run lint` clean; `npm test` 108/108 pass (7 files).
Not run: `npm run test:integration`, `npm run test:e2e`, `npm run build`, prettier check, visual checks of admin, accounts/priorities pages, and phone-width layouts.

## Known issues and uncertainties
- From the cost log (2026-10-29 runs on HKUST, PolyU, HKU): some excerpts fail verbatim validation, and some candidate "programs" were admission categories or departments. Later prompt/relevance changes (`program-v12`, `programTitleIssues`) may have addressed this; unverified against a live run. Nothing approved or published.
- Some PolyU runs reported 7 crawl errors.
- Dev server on port 3111 may still be running: `pkill -f "next dev"`.
- Unverified assumption: e2e selectors in `tests/e2e/app.spec.ts` still match after the redesign; `tests/e2e/account.spec.ts` was added but not run in this session.
- Migrations `202610290001` to `202610300002` were not applied/checked this session.

## Next actions
1. Bring up PostgreSQL and Redis, run migrations and seed, then `npm run test:integration` and `npm run test:e2e` (acceptance: all pass).
2. Run `npm run build`.
3. Visually check admin, account, priorities, and results/profile/detail at 390px; fix `app/globals.css`.
4. With authorization, re-run one live program extraction and compare against the cost-log quality problems.
5. Optionally build the tabbed detail view and mobile filter toggle (`components/university-detail.tsx`, `components/results.tsx`).
6. Commit this handoff; push when ready.
