# AI Handoff

Updated: 2026-11-12T16:38:04Z
Base commit: dd22372a1cf5d19db89ee0827bf0c42a8d4736da
Branch: main (pushed to `origin/main`)
Working tree: clean

Uncommitted content, if any appears later, is a snapshot that the commit hash alone cannot prove current.

## Purpose and architecture

UniMatch matches international applicants to first-year bachelor's programmes in Hong Kong and South Korea. Every fact is quoted from an official page. Stack: Next.js 16, React 19, Tailwind 4, Prisma 7/PostgreSQL, Redis/BullMQ.

- **Stable rules:** `AGENTS.md`. Setup and env variables: `README.md`. The other design and planning docs were deleted on 2026-11-12. They remain in git at `9a198b0`; `docs/OWNER_CONFIRM.md` there holds the owner decisions behind ADMIN_VERIFIED rows.
- **Matching:** `lib/matching.ts`, plus `trust`, `whatif`, `arithmetic`, `actions` and `fx` in `lib/`. Profile choices and qualification aliases: `lib/profile-options.ts`.
- **Catalog:** `lib/catalog.ts` reads the DB, or `data/catalog-snapshot.json` when `CATALOG_SOURCE=snapshot`. `PUBLIC_MODE=true` hides admin and accounts.
- **UI ("Crimson Serif"):** tokens in `app/globals.css`; buttons `components/ui/button.tsx`; card/detail wording `components/program-facts.ts`; place names and deadline parts `lib/places.ts`; type-ahead picker `components/combo-box.tsx`.

## Implemented state

- **Catalog:** 286 programmes at 12 institutions. 119 have `requirementsComplete`; 79 have a complete 2027 cost; 73 are fully checked.
- **Redesign (committed):** home, profile wizard, results, detail, shortlist, compare, deadlines, footer, compare dock, mobile tab bar and profile drawer. Account and admin screens were not compared visually.
- **Pickers (committed):** Nationality, Country of education and Current qualification use `ComboBox`. Values are canonicalised; an unlisted value blocks the step.
- **Qualification aliases (committed):** `sameQualification` maps page names to picker options for `appliesToQualifications` and QUALIFICATION `allowed`. "International Qualifications" and "Post-Secondary Qualifications" stay unmapped.
- **Deployment (2026-11-12):** Vercel project `lusparkls-projects/unimatch`, production URL https://unimatch-inky.vercel.app, deployed from the CLI in public snapshot mode. Admin, account and admin API routes return 404.

## Decisions and environment

- **Vercel production env:** `PUBLIC_MODE`, `CATALOG_SOURCE`, `DEMO_MODE`, `ENABLED_COUNTRIES`, `FRESHNESS_DEADLINE_DAYS`, `NEXT_PUBLIC_APP_URL`. No DB, Redis or OpenAI key on the host.
- **Deploy:** `vercel deploy --prod --yes` from the repo root. The GitHub repo is not connected ("Failed to connect lusparkl/UniMatch to project"), so pushes do not deploy.
- **Ignore files:** `.vercelignore` keeps `.env*` and local artifacts out of uploads. `.vercel/` and `.env.local` (Vercel OIDC token) are git-ignored.
- **Statuses:** agents set only SOURCE_BACKED or CONFLICTING. Live crawling is authorised; the model budget is unused.
- **Local runtime:** `docker compose up -d` (PostgreSQL 5434, Redis 6381). Dev: `npm run dev -- -p 3111` on `localhost`, not `127.0.0.1`. Never run `pkill -f "next dev"`.
- **Screenshots:** `npm run screens -- <url>` now writes to git-ignored `output/screens/`.
- e2e rewrites `next-env.d.ts`; restore with `git checkout next-env.d.ts` before committing.
- Tailwind 4: keep base element rules in `@layer base`, or they override utilities.
- No DB backups exist. Take one before any `APPLY=1` run.

## Validation

2026-11-12:

- `npm test`: 218/218, run just before commit `dd22372`.
- `npm run typecheck`, `npm run lint`: clean after the docs cleanup.
- `npm run smoke -- https://unimatch-inky.vercel.app`: passed (6 personas).
- `npm run test:e2e`: 12/12 public, 3/3 private, before the docs cleanup.

Not run since the pickers: local production build, `npm run screens`, `npm run test:integration`.

## Known issues and uncertainties

- **Korea:** 0 programmes with `requirementsComplete`. UNIST and SKKU have no annual cost. POSTECH tuition is CONFLICTING.
- **PolyU and HKBU:** PolyU living costs are CONFLICTING. 45 PolyU and 23 HKBU programmes are incomplete.
- **HKU:** 59 "final" intakes are not Fall. Requirement quotations age out after 30 days.
- **HKDSE:** no published rule names it.
- **Grade scales:** a GRADE rule's scale rarely equals the student's free-text scale, so those rules stay UNKNOWN.
- **Old saved profiles:** a free-text qualification matches only by exact name until edited.
- **`latestDocument()`:** sorts by `retrievedAt`.
- `.vercelignore` still lists the removed `docs/screens/`; harmless.

## Next actions

1. **Auto-deploy (optional):** install the Vercel GitHub app on `lusparkl/UniMatch`, then `vercel git connect`. Check: a push creates a deployment.
2. **Freeze:** `npm run catalog:export`, commit `data/`, tag `demo-freeze`, redeploy, rerun smoke against the live URL.
3. **HKU refresh**, before about 2026-12-10: back up the DB, then rerun `scripts/curate-hku-hkbu.ts` (dry run first, then `APPLY=1`), export, redeploy.
