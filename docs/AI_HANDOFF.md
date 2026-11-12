# AI Handoff

Updated: 2026-11-12T07:20:51Z
Base commit: 575ac4f91642df50224c6cb143128e604d526f5a
Branch: main (pushed; in sync with origin/main)
Working tree: clean.

Any later uncommitted content is a snapshot. The commit hash cannot prove it is current. Curated data lives in PostgreSQL; `data/catalog-snapshot.json` is its committed export.

## Purpose and architecture

UniMatch matches international applicants to first-year bachelor's programmes in Hong Kong and South Korea. Every fact is quoted from an official page. Stack: Next.js 16, React 19, Prisma 7/PostgreSQL, Redis/BullMQ.

- **Documentation:** stable rules are in `AGENTS.md`. `docs/ARCHITECTURE.md` covers design. `docs/PRODUCT_OVERVIEW.md` covers features, catalog figures, known issues and next actions. `docs/HACKATHON_LOG.md` is the dated record. The plan and its per-part status are in `docs/hackathon/`.
- **Matching:** `lib/matching.ts`. Also `lib/trust.ts`, `lib/whatif.ts`, `lib/arithmetic.ts`, `lib/actions.ts`, and FX in `lib/fx.ts` / `lib/fx-rates.json`. Personas are in `lib/personas.ts`.
- **Catalog:** `lib/catalog.ts` reads the DB, or the snapshot when `CATALOG_SOURCE=snapshot`. `PUBLIC_MODE=true` hides admin and accounts (`proxy.ts`).
- **Curation:**
  - Reviewer scripts live in `scripts/`. They are dry runs by default and write only with `APPLY=1`; helpers are in `scripts/curation.ts`.
  - Owner-gated scripts (`OWNER_CONFIRMED=1`, `OWNER_NAME`): `owner-confirm.ts` and `hkust-accommodation.ts`.
  - Audits: `evidence-report.ts`, `coverage-report.ts` and `red-team.ts`.

## Implemented state

- **Catalog:** 286 published programmes at 12 institutions (5 in Hong Kong, 7 in Korea). 119 have `requirementsComplete` (CUHK 73, HKUST 44, PolyU 2). 79 have a complete 2027 cost (CUHK 73, KAIST 6). 73 are fully checked.
- **Done 2026-11-11 (docs committed 2026-11-12 as `575ac4f`):**
  - **Gap curation:** HKBU and PolyU intakes, and HKU Business tuition.
  - **POSTECH tuition** split into CONFLICTING rows.
  - **HKUST:** owner-confirmed deletion of 42 misparsed accommodation rows.
  - **Red-team check:** seed 20261111, 141 facts, 0 wrong (`docs/VERIFICATION_LOG.md`).
  - **Debrecen** removed from code and DB. Stale docs were deleted.
  - **Docs** brought up to date.
- **Plan status:**
  - Parts 1, 2 and 4 are done.
  - Part 3 is done except Korean `requirementsComplete` (0 of 15).
  - Part 5A and the red-team check are done.
  - Pending: deploy, the `demo-freeze` tag, `docs/DEMO_SCRIPT.md` and the video.

## Decisions and environment

- **Owner decisions** (`docs/OWNER_CONFIRM.md`, all answered):
  - Guaranteed awards confirmed: KAIST Scholarship, POSTECH Living Allowance and the GIST waiver.
  - POSTECH Tuition Scholarship: not confirmed.
  - HKUST: the 42 accommodation rows are deleted.
- **Live crawling** is authorised. The 1M-token model budget is unused. Browser copies are allowed for UIC, GIST and SKKU only, with no bot-check bypass.
- **Statuses:** agents set only SOURCE_BACKED or CONFLICTING. ADMIN_VERIFIED requires the owner.
- **Runtime:**
  - `docker compose up -d` starts PostgreSQL on 5434 and Redis on 6381. Port 3000 belongs to another project.
  - Dev: `npm run dev -- -p 3111`.
  - Snapshot check:
    1. Run `CATALOG_SOURCE=snapshot PUBLIC_MODE=true DEMO_MODE=false npm run build`.
    2. Start `next start -p 3112` with `FRESHNESS_DEADLINE_DAYS=30`.
    3. Run `npm run smoke -- http://localhost:3112` and `npm run screens -- http://localhost:3112`.
    4. Stop the `next-server` process listening on port 3112. Killing the `npx` wrapper does not stop it.
  - Never run `pkill -f "next dev"`. Running e2e rewrites `next-env.d.ts`; restore the build version before committing.
- **Environment variable names:** in `.env.example`.
- **DB backups:** none exist. The 2026-11-11 dumps were in a session scratchpad under `/tmp` and were gone on 2026-11-12. Take a fresh backup before any `APPLY=1` run.

## Validation

2026-11-11:

- After the Debrecen removal, at `4498481`:
  - typecheck and lint: clean.
  - `npm test`: 213/213.
  - `npm run test:integration`: 9/9.
  - `npm run test:e2e`: 14/14.
  - `scripts/evidence-report.ts`: 0 failures, 0 pending candidates.
  - `npm run db:seed`: ok.
- After the docs update (then uncommitted):
  - Snapshot build: ok.
  - `/api/health`: 286 programmes, 12 institutions.
  - `npm run screens`: no overflow or errors.
  - `npm run smoke`: 4/4.
  - `npm run coverage`: PolyU now reports 0 programmes without a Fall intake.

2026-11-12, before commit `575ac4f`:

- `npm test`: 213/213. typecheck and lint: clean.
- Not re-run: integration and e2e. Only docs, screenshots and one script line changed since `4498481`.
- The snapshot's `commit` field is `1660270`, the HEAD at export time. Re-export at the freeze.

## Known issues and uncertainties

- **Korea:**
  - 0 programmes with `requirementsComplete`.
  - UNIST and SKKU have no annual cost.
  - POSTECH tuition is CONFLICTING.
  - Hanyang, DGIST and SNU are absent.
- **PolyU:** living costs are CONFLICTING. 45 PolyU and 23 HKBU programmes are not complete.
- **HKU:**
  - 59 "final" intakes are not Fall.
  - Requirement quotations refreshed 2026-11-11 age out after 30 days.
  - Some rule labels are truncated or omit an option.
- **HKBU:** the intake quotation lacks the entry year.
- **Code:** `latestDocument()` sorts by `retrievedAt`, so a page that switches back to an older version is not marked as checked again.
- **Snapshot vs. local database:** the snapshot is committed, but the local database is the source; a re-export is needed after any data change.

## Next actions

1. Deploy once the owner provides a host. Set `PUBLIC_MODE=true`, `CATALOG_SOURCE=snapshot`, `ENABLED_COUNTRIES=Hong Kong,South Korea`, `FRESHNESS_DEADLINE_DAYS=30` and `NEXT_PUBLIC_APP_URL`. Then run `npm run smoke -- <live url>`.
2. Freeze:
   1. Run `npm run catalog:export`.
   2. Commit `data/`.
   3. Tag `demo-freeze`.
   4. After that, allow only logged fixes to proven errors.
3. Write `docs/DEMO_SCRIPT.md` from the frozen snapshot (plan §7). The owner records the video.
4. Before about 2026-12-10: back up the DB, then rerun `scripts/curate-hku-hkbu.ts` (dry run, then `APPLY=1`).
