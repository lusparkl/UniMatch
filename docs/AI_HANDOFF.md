# AI Handoff

Updated: 2026-11-11T11:13:20Z
Base commit: aff4c9be2bbeeaecb23f6b2f0c4c1967460042e8
Branch: main (pushed; in sync with origin/main)
Working tree: clean. The commit hash cannot prove that any later uncommitted content is current. Curated and reviewed data lives in PostgreSQL, which git does not track. `data/catalog-snapshot.json` is a committed export of it.

## Purpose and architecture
UniMatch matches applicants to first-year bachelor's programmes in Hong Kong and South Korea, using evidence quoted from official pages. It is for international applicants. Stack: Next.js 16, React 19, Prisma 7/PostgreSQL, Redis/BullMQ.

- **Where things are documented:** stable architecture in `AGENTS.md` and `docs/ARCHITECTURE.md`; the plan in `docs/hackathon/01–05`. `docs/HACKATHON_LOG.md` is the authoritative detail.
- **Matching:** `lib/matching.ts` is deterministic PASS/FAIL/UNKNOWN; `annualCost()` combines only trusted cost rows by part. Also `lib/trust.ts`, `lib/whatif.ts`, and FX in `lib/fx-rates.json`.
- **Personas:** `lib/personas.ts`. Checked by `tests/integration/personas.spec.ts` and `npm run smoke`.
- **Catalog:** `lib/catalog.ts` reads the DB, or the snapshot when `CATALOG_SOURCE=snapshot` (`npm run catalog:export`).
- **Research:** `lib/research/` (guarded crawler). The registry is `prisma/registry.ts` plus the `registry-programs*.json` files.
- **Reviewer scripts:** dry run by default; `APPLY=1` writes; no model calls.
  - Shared helpers: `scripts/curation.ts`.
  - Per-university curation: the `curate-*.ts` scripts, including the new `curate-gaps.ts`.
  - Cost fixes: `polyu-costs.ts` and `postech-costs.ts` (new).
  - Other: `owner-confirm.ts`, `scholarship-rules.ts`, `recheck-sources.ts`, `evidence-report.ts`.

## Implemented state
- **Done:** Parts 1, 2, 4 and 5A. Part 3 has 286 published programmes across 12 enabled institutions. Debrecen (Hungary) is stored but disabled. 119 programmes have `requirementsComplete`.
- **Gap pass (Codex, `scripts/curate-gaps.ts`, applied):** all rows are SOURCE_BACKED.
  - HKBU: 69 Fall 2027 intake rows (early, main and extended rounds) for all 23 programmes.
  - PolyU: 8 missing intakes (deadline 17 Nov 2026).
  - HKU: 5 Business School programmes have HKD 250,000 annual tuition.
  - HKU requirement quotations were refreshed by rerunning `curate-hku-hkbu.ts` (80 programmes).
- **POSTECH costs (`scripts/postech-costs.ts`, applied):** 6 rows each.
  - Living KRW 7,235,000 and NHI 951,840 are SOURCE_BACKED.
  - Tuition KRW 5,580,000 is CONFLICTING. The 2026 table says 2,790,000 per semester, but its note gives 2,924,000 for semester 1.
  - Financial match therefore stays UNKNOWN.
- **Code fixes:**
  - Crawler detects PDFs served as `application/octet-stream` (`isPdfDownload`, with a unit test).
  - `fetchApproved` upserts page versions by `(universityId, url, contentHash)`.
  - `curate-hku-hkbu.ts` selects the newest candidate that names the programme.
- **Owner confirmation:** item 5 in `docs/OWNER_CONFIRM.md` proposes deleting 42 HKUST accommodation rows. They are ADMIN_VERIFIED and store HKD 21,000 "per semester", but the source gives HKD 21,000–51,000 per residential year. Status: pending owner confirmation.

## Decisions and environment
- **Statuses:** Claude Code and Codex set only SOURCE_BACKED or CONFLICTING. ADMIN_VERIFIED requires the owner, recorded in `docs/OWNER_CONFIRM.md` and review records.
- **Authorisation:** live crawling through the guarded crawler is authorised. Browser copies (`owner-browser-copy`) are allowed only for UIC, GIST and SKKU. There must be no bot-check bypass. The 1M-token model budget is unused.
- **Runtime:**
  - `docker compose up -d` starts PostgreSQL on 5434 (`unimatch`) and Redis on 6381.
  - Dev server: `npm run dev -- -p 3111`.
  - Smoke test: run `CATALOG_SOURCE=snapshot PUBLIC_MODE=true DEMO_MODE=false npm run build`, then `next start -p 3112` with `FRESHNESS_DEADLINE_DAYS=30`, then `npm run smoke -- http://localhost:3112`.
  - Port 3000 belongs to another project. Never run `pkill -f "next dev"`.
- **Environment variables:** names are in `.env.example`.
- **DB backups (temporary):**
  - Codex: `/tmp/unimatch-curate-gaps.sjztyW/`.
  - POSTECH fix: `/tmp/claude-1000/-mnt-data-Projects-UniMatch/b4316dfc-333e-44a1-a81c-c86d17515996/scratchpad/unimatch-before-postech-costs.dump`.

## Validation
2026-11-11, after the POSTECH fix, on content identical to `aff4c9b`:
- typecheck and lint: clean.
- `npm test`: 213/213.
- `npm run test:integration`: 9/9. The existing pg deprecation warning remains.
- `scripts/evidence-report.ts`: 0 quotations not verbatim.
- `npm run catalog:export`: 287 programmes.

Codex ran the snapshot build and `npm run smoke` (4/4 personas) before the POSTECH fix. Neither has been re-run since. `npm run test:e2e` was last run at `f79cc20` (14/14).

## Known issues and uncertainties
- **POSTECH tuition:** stays CONFLICTING until the Fall 2027 guide (late January / early February 2027) or the owner resolves it.
- **No cost data:**
  - UNIST: the enrolment PDF timed out.
  - SKKU: the tuition table names no period.
- **Korea:** 0 programmes with `requirementsComplete`. No institution publishes an accepted-qualification list or a 2027 English minimum.
- **Not crawlable:**
  - Hanyang: Cloudflare check, and its 11.7 MB guide yielded no text.
  - DGIST: timeout.
  - SNU: no applicant-wide English-taught route.
- **HKU:**
  - The 59 "final" intakes are not Fall.
  - Requirement quotations refreshed 2026-11-11 age out after 30 days unless `curate-hku-hkbu.ts` is rerun.
- **PolyU:** living-cost rows stay CONFLICTING, because the official totals HKD 290,272 and 330,272 still disagree.
- **Incomplete requirements:** PolyU (45) and HKBU (23).
- **HKBU intakes:**
  - The quotation does not state the entry year; Fall 2027 is inferred from the round dates.
  - Opening dates are null.
- **`latestDocument()` sorts by `retrievedAt`:** if a page switches back to an older version, the newest stored version is not marked as checked again.
- **Cleanup:**
  - PolyU's 8 new deadlines use 23:59:00, while the existing rows use 23:59:59.
  - `namedPayload()` duplicates logic in `curate-hku-hkbu.ts`.
- **Review records:** 10 scholarships changed by `scholarship-rules.ts` have none.

## Next actions
1. Ask the owner about item 5 in `docs/OWNER_CONFIRM.md` (HKUST). If confirmed, delete only those 42 rows, with a backup and review records.
2. Part 5 deploy, once the owner provides a server (`docs/hackathon/05-deploy-freeze-demo.md`):
   1. Freeze the data.
   2. Re-export and commit `data/`.
   3. Tag `demo-freeze`.
   4. Run `npm run smoke -- <live url>`.
3. Before deploy: rerun the snapshot build, `npm run smoke` and `npm run test:e2e`.
4. Before about 2026-12-10: rerun `curate-hku-hkbu.ts` (dry run, then `APPLY=1`).
5. Optional:
   - quote the entry year for HKBU intakes;
   - fix `latestDocument()` ordering;
   - move `namedPayload()` into `scripts/curation.ts`.
