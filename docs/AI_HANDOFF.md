# AI Handoff

Updated: 2026-11-12T15:48:48Z
Base commit: 9a198b0eb8c52c146bb4192f721d7452629efc89
Branch: main
Working tree: uncommitted redesign and qualification-picker work. Modified: `app/{globals.css,layout.tsx,page.tsx}`, 15 files in `components/`, `lib/{matching,personas}.ts`, `scripts/smoke.ts`, `tests/e2e/public/{app,features}.spec.ts`, `tests/part4.test.ts`, `docs/screens/*.png`. New: `components/{combo-box.tsx,program-facts.ts}`, `lib/{places,profile-options}.ts`.

The uncommitted content is a snapshot. The commit hash alone cannot prove it is current. Curated data lives in PostgreSQL; `data/catalog-snapshot.json` is its committed export and is unchanged.

## Purpose and architecture

UniMatch matches international applicants to first-year bachelor's programmes in Hong Kong and South Korea. Every fact is quoted from an official page. Stack: Next.js 16, React 19, Tailwind 4, Prisma 7/PostgreSQL, Redis/BullMQ.

- **Documentation:**
  - Stable rules: `AGENTS.md`.
  - Design: `docs/ARCHITECTURE.md`.
  - Features and catalog figures: `docs/PRODUCT_OVERVIEW.md`.
  - Dated record: `docs/HACKATHON_LOG.md`.
  - Plan: `docs/hackathon/`.
- **Matching:**
  - `lib/matching.ts`, plus `trust`, `whatif`, `arithmetic`, `actions` and `fx` in `lib/`.
  - Profile choices and qualification aliases: `lib/profile-options.ts`.
- **Catalog:** `lib/catalog.ts` reads the DB, or the snapshot when `CATALOG_SOURCE=snapshot`. `PUBLIC_MODE=true` hides admin and accounts.
- **UI (design "Crimson Serif"):**
  - Styles and tokens: `app/globals.css`. Buttons: `components/ui/button.tsx`.
  - Shared card and detail wording: `components/program-facts.ts`.
  - Place names, deadline parts and short university names: `lib/places.ts`.
  - Accessible type-ahead picker: `components/combo-box.tsx`.

## Implemented state

- **Catalog:** unchanged from commit `575ac4f`.
  - 286 programmes at 12 institutions.
  - 119 have `requirementsComplete`; 79 have a complete 2027 cost; 73 are fully checked.
- **Redesign (uncommitted, 2026-11-12):** implemented from the design artifact `claude.ai/artifact/5q3wnzRgHRYHkbNpTaM1pS`.
  - Pages: home, profile wizard, results, detail, shortlist, compare and deadlines.
  - Also: the footer, compare dock, mobile tab bar and profile drawer.
  - Visual parity checked against the design at 1440 and 390 px.
  - Not compared visually: the account and admin screens.
  - Deliberate deviations:
    - Budget stays required. No toasts.
    - Shows real catalog counts.
    - Status words instead of raw PASS/UNKNOWN.
    - Action links and programme chips are kept.
- **Pickers (uncommitted):** Nationality, Country of education and Current qualification use `ComboBox`.
  - Values are canonicalised; an unlisted value blocks the step.
  - Qualification options: IB Diploma, GCE A-Level, International A-Level, HKDSE, SAT / ACT / AP, Indian board exams, Australian ATAR, New Zealand NCEA, Canadian high school diploma, Russian Attestat, Chinese Gaokao, and Other qualification.
  - Persona qualifications: `sat` uses "SAT / ACT / AP" and `missing` uses "Other qualification".
- **Qualification aliases (uncommitted, user-approved):**
  - `sameQualification` maps page names ("International Baccalaureate", "GCE A-level / International A-level", "SAT/AP", "New Zealand", …) to the options above.
  - Used for `appliesToQualifications` and for QUALIFICATION `allowed`.
  - Programmes with rules for the qualification: IB 153→204, GCE A-Level 199→246, International A-Level 142→246.
  - No persona status changed.
  - Deliberately unmapped: "International Qualifications" and "Post-Secondary Qualifications".

## Decisions and environment

- **Owner decisions** are in `docs/OWNER_CONFIRM.md` (all answered).
- **Live crawling** is authorised. The model budget is unused.
- **Statuses:** agents set only SOURCE_BACKED or CONFLICTING.
- **Runtime:**
  - `docker compose up -d` starts PostgreSQL on 5434 and Redis on 6381. Both containers are still running.
  - Dev: `npm run dev -- -p 3111`. Use `localhost`, not `127.0.0.1`: Next dev blocks its resources there and hydration fails.
  - Snapshot check: build with `CATALOG_SOURCE=snapshot PUBLIC_MODE=true DEMO_MODE=false`, then `next start -p 3112` with `FRESHNESS_DEADLINE_DAYS=30`, then run `npm run smoke` and `npm run screens` against it. Stop the `next-server` process on port 3112.
  - Never run `pkill -f "next dev"`.
  - e2e rewrites `next-env.d.ts`. Restore it with `git checkout next-env.d.ts` before committing; it is currently clean.
- **Tailwind 4:** utilities sit in `@layer utilities`. Keep base element rules in `@layer base`, or they override utilities.
- **DB backups:** none exist. Take one before any `APPLY=1` run.

## Validation

2026-11-12, after the alias change:

- `npm test`: 218/218.
- typecheck and lint: clean.
- `npm run test:e2e`: 12/12 public, 3/3 private.

Earlier on 2026-11-12, after the redesign and before the pickers:

- Snapshot build, `npm run smoke` and `npm run screens`: passed.

Not re-run since the pickers and aliases:

- Production build, smoke and screens. `docs/screens/` predates the picker.
- `npm run test:integration`.

## Known issues and uncertainties

- **Korea:** 0 programmes with `requirementsComplete`. UNIST and SKKU have no annual cost. POSTECH tuition is CONFLICTING.
- **PolyU and HKBU:** PolyU living costs are CONFLICTING. 45 PolyU and 23 HKBU programmes are incomplete.
- **HKU:** 59 "final" intakes are not Fall. Requirement quotations age out after 30 days.
- **HKDSE:** no published rule names it.
- **Grade scales:** a GRADE rule's scale (e.g. "45", "80") rarely equals the student's free-text grading scale, so those rules stay UNKNOWN.
- **Old saved profiles:** a free-text qualification still matches only by exact name until the student edits the profile.
- **`latestDocument()`:** sorts by `retrievedAt`.

## Next actions

1. **Commit when the user asks.** Re-run the snapshot build, `npm run smoke` and `npm run screens` (refresh `docs/screens/`). Confirm `next-env.d.ts` is clean.
2. **Update the docs:** `docs/PRODUCT_OVERVIEW.md` and `docs/ARCHITECTURE.md` for the redesign, pickers and aliases. Log the work in `docs/HACKATHON_LOG.md`.
3. **Deploy** once the owner provides a host. Set `PUBLIC_MODE=true`, `CATALOG_SOURCE=snapshot`, `ENABLED_COUNTRIES=Hong Kong,South Korea`, `FRESHNESS_DEADLINE_DAYS=30` and `NEXT_PUBLIC_APP_URL`. Then run smoke against the live URL.
4. **Freeze:** run `npm run catalog:export`, commit `data/` and tag `demo-freeze`.
5. **Demo script:** write `docs/DEMO_SCRIPT.md`.
6. **HKU refresh**, before about 2026-12-10: back up the DB, then rerun `scripts/curate-hku-hkbu.ts` (dry run first, then `APPLY=1`).
