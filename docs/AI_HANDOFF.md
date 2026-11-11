# AI Handoff

Updated: 2026-11-11T06:10:20Z
Base commit: f79cc2059e312b0eb720df486318f09360f93937
Branch: main (in sync with origin/main)
Working tree: `data/` is untracked; it holds `catalog-snapshot.json`, exported 2026-11-11 after the scholarship fixes. Uncommitted content is a snapshot; the commit hash alone does not prove it is current. The curated and reviewed data lives in the PostgreSQL database, which git does not track.

## Purpose and architecture
UniMatch: evidence-led matching of first-year bachelor's programmes in Hong Kong and South Korea for international applicants. Stack: Next.js 16, React 19, Prisma 7/PostgreSQL, Redis/BullMQ. Stable architecture is in `AGENTS.md` and `docs/ARCHITECTURE.md`. The hackathon plan is in `docs/hackathon/01–05`. The running record, `docs/HACKATHON_LOG.md`, is the authoritative detail.

- **Matching:** `lib/matching.ts` (deterministic PASS/FAIL/UNKNOWN; `annualCost()` combines cost rows by part). Also `lib/trust.ts`, `lib/actions.ts`, `lib/whatif.ts`, `lib/arithmetic.ts`, and FX in `lib/fx-rates.json`.
- **Personas:** `lib/personas.ts` defines the persona stories. The integration test `tests/integration/personas.spec.ts` and `npm run smoke` both check them.
- **Catalog:** `lib/catalog.ts` reads from the DB, or from a snapshot (`CATALOG_SOURCE=snapshot`, `npm run catalog:export`).
- **Research:** `lib/research/` (guarded crawler, extraction, review). The registry is `prisma/registry.ts` with the `registry-programs*.json` files.
- **Reviewer scripts** (dry run by default; `APPLY=1` writes; no model calls):
  - shared helpers: `scripts/curation.ts`;
  - per-university curation: the `curate-*.ts` scripts, `add-tuition-hk.ts`, `polyu-costs.ts` and `import-browser.ts`;
  - maintenance: `recheck-sources.ts`, `evidence-report.ts`, `owner-confirm.ts`, `scholarship-rules.ts` (new) and `review:auto`.

## Implemented state
- **Parts 1, 2, 4 and 5A:** done.
- **Part 3 data:** 286 published programmes (12 institutions per `/api/health`).
  - HK: 119 requirementsComplete; 73 complete annual costs (CUHK).
  - Korea: 0 requirementsComplete; complete cost for KAIST only.
- **Owner confirmation, 2026-11-11 by lusparkl** (`docs/OWNER_CONFIRM.md`):
  - `ADMIN_VERIFIED` (18 rows): KAIST Scholarship, POSTECH Living Allowance, GIST tuition waiver.
  - Still `SOURCE_BACKED`: POSTECH Tuition Scholarship, because year-one semester 2 depends on GPA.
- **Engine changes, commit `f79cc20`:**
  - New rule type `ON_ADMISSION` for awards made to every admitted student. It evaluates PASS. Model extraction has its own schema and cannot emit it.
  - Scenario fields `ceiling` and `ceilingConverted`. With a complete total but no stored stipend amount, the ceiling is the total minus tuition coverage. A scenario passes if its ceiling is within budget; otherwise it stays UNKNOWN.
- **Data changes (`scripts/scholarship-rules.ts`, applied):**
  - KAIST: ON_ADMISSION rule plus a deadline of 2027-01-14 09:00Z.
  - GIST: ON_ADMISSION rule, no deadline.
  - 96 HK rows with residency categories (`local`, `non-local`, `international`) as nationality restrictions now carry an OTHER rule (UNKNOWN). They used to FAIL every student.
- **Persona results:** the KAIST guaranteed scenario now satisfies the "A-level, tight budget" story. Persona top results changed after the CUHK fix.

## Decisions and environment
- **Owner decisions:** see the log and `docs/OWNER_CONFIRM.md`. Live crawling is authorised. The model budget is up to 1M tokens (unused). Browser copies with purpose `owner-browser-copy` are never re-fetched automatically.
- **Verification statuses:** Claude Code sets only SOURCE_BACKED. ADMIN_VERIFIED comes from the owner, or from changes the owner explicitly approves; these are recorded in review records.
- **Runtime:**
  - Node 22.13+ and npm.
  - `docker compose up -d` starts PostgreSQL on 5434 (`unimatch`) and Redis on 6381.
  - Dev server: `npm run dev -- -p 3111`.
  - Local smoke: `CATALOG_SOURCE=snapshot PUBLIC_MODE=true DEMO_MODE=false npm run build`, then `next start -p 3112` with `FRESHNESS_DEADLINE_DAYS=30`, then `npm run smoke -- http://localhost:3112`.
  - Port 3000 is used by another project (CrIE).
- **FX:** NBU rates dated 2026-11-11, including KRW.
- **Env:** variable names are in `.env.example`. Never run `pkill -f "next dev"`.
- **DB backups** (temporary, session scratchpad): `/tmp/claude-1000/-mnt-data-Projects-UniMatch/ccb495de-af5b-433c-8766-85d985a6f0e0/scratchpad/unimatch-before-{owner-confirm,scholarship-rules}.dump`.

## Validation
2026-11-11, at `f79cc20` plus the applied DB changes:
- `npm run typecheck` and `npm run lint`: clean.
- Prettier: clean on the changed files.
- `npm test`: 212/212.
- `npm run test:integration`: 9/9.
- `npm run test:e2e`: 14/14 (11 public, 3 private).
- Snapshot-mode `npm run build`: ok.
- `npm run smoke` against a local `next start`: 4/4 personas.

Not run this session: `scripts/evidence-report.ts`. It does not check scholarships, and the new rule quotations were verified as verbatim when they were written.

## Known issues and uncertainties
- **HKU:**
  - Requirement quotations cite page versions that age out around 2026-12-10, unless `curate-hku-hkbu.ts` is rerun.
  - 59 "final" intakes are not Fall.
  - 11 Business School programmes have no tuition.
- PolyU (45) and HKBU (23) are not complete.
- An HKUST accommodation row is misparsed (HK$21,000 "per semester").
- **Korean tuition:** stored per semester (UIC, GIST, KU) or not at all (UNIST, SKKU, POSTECH). GIST therefore cannot pass financially. POSTECH and UIC Fall 2027 dates are unpublished.
- **Review records:** 10 university-level scholarships changed by `scholarship-rules.ts` have no review record, because there was no candidate to attach one to.
- **Snapshot:** `data/` is exported but not committed.

## Next actions
1. Part 5: deploy once the owner provides a server. Freeze the data, re-run `npm run catalog:export`, commit `data/`, tag `demo-freeze`, and run `npm run smoke -- <live url>` (`docs/hackathon/05-deploy-freeze-demo.md`).
2. Optional: rerun `curate-hku-hkbu.ts` before 2026-12-10, and fix the HKUST accommodation row.
3. Optional: GIST deadline. It needs a source quote linking the waiver to the application period (1 Dec 2026 to 29 Jan 2027).
