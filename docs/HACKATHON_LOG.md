# Hackathon log

Running log for the hackathon plan (`docs/hackathon/`). Each entry records what changed, what was measured, and what was decided. Times are UTC.

## 2026-11-04 14:00: Part 1 begins, W0 baseline at `b03cd0e`

**Measured:**

- `npm run build`: passed (Next.js 16.4.3, 14 routes).
- `npm run test:integration`: 3 files, 4/4 passed. Warnings: pg `client.query()` deprecation only.
- `npm run test:e2e`: 5/5 passed (account, landing/wizard/results/detail, master's mobile, admin rejection, admin auth).
- `npm run coverage` (new, `scripts/coverage-report.ts`): output in `docs/coverage-baseline.md`.

**Findings:**

1. **Programme count.** 251 published programmes: CUHK 75, HKU 61, PolyU 47, HKUST 44, HKBU 23, Debrecen 1. The 2026-11-01 handoff and `PRODUCT_OVERVIEW.md` said "241 Hong Kong programmes". The per-university figures were right, but their sum is 250.
2. **The evidence year is not the blocker for intake 2027-Fall.** No programme is UNKNOWN only because of the year. HKUST has 2 programmes with a mandatory rule or cost from another year. W2b's fallback (changing the default intake) is therefore not needed. Only the reason text changes.
3. **The real blocker is free-text intake terms.** Stored terms include "September", "Sept", "September entry", "Sept 2027 entry", "advance offer round", "regular round", "final", "main", "priority round", "rolling basis" and "unknown".
   - `sameTerm()` maps only Autumn to Fall. A 2027-Fall student therefore gets "Requested intake is not verified" (UNKNOWN) for most CUHK, HKU, PolyU and HKUST programmes, even where a verified deadline exists.
   - Decision: in Part 2, normalise "Sept…" and "September…" to Fall. This is a deterministic synonym and safe.
   - Round names ("regular round", "final", "advance offer round") do not state a term. They are not mapped in the engine, because that would infer a term the evidence does not state.
   - Part 3 data hygiene: where the quotation states September entry, store term Fall and keep the round as the route.
   - Flagged for the owner: until this is fixed, most Hong Kong application checks stay UNKNOWN.
4. **No complete annual cost exists anywhere.** 0 programmes have tuition, living and other all verified. W4's target of 20 starts from zero.
5. **HKBU:** 23 programmes with no intake at all.

## 2026-11-04 15:00: Part 1 done (W1 scope cut, W3 local-first, section 4 config)

**Changed:**

- **Config** (`lib/config.ts`): `enabledCountries()` (default `Hong Kong,South Korea`), `isPublicMode()`, `catalogSource()`. `.env.example` lists the names and sets `DAILY_AI_TOKEN_LIMIT=500000`.
- **Scope cut:**
  - `countries` is now Hong Kong and South Korea. The admin keeps `researchCountries`, so older records stay manageable.
  - `getPrograms()` filters by `ENABLED_COUNTRIES` in the Prisma `where` clause and for the fixtures.
  - The wizard has no destination picker and no degree select (always bachelor's). The budget starts blank and is required. KRW added; HUF and SGD removed.
  - Results have a Both / Hong Kong / South Korea toggle (also driven by `?country=` from the home pills).
  - The home page, metadata and footer copy cover only Hong Kong and South Korea.
  - Demo fixtures are now fictional Hong Kong and Korea institutions with the same five test cases.
- **Local-first:**
  - `components/local-store.ts` holds the profile (`unimatch-profile-v2`, migrating v1 silently), the shortlist (`unimatch-shortlist-v1`) and documents (`unimatch-docs-v1`). Every access is in try/catch.
  - `/shortlist` replaces `/priorities` (now a 308 redirect).
  - Student pages make no `/api/account/*` calls.
  - Account code is kept for local use. `account-client.ts` now holds only API helpers.
- **Public mode:** `proxy.ts` returns 404 for `/admin`, `/account`, `/api/admin/*`, `/api/account/*` and `/api/auth/*`. Footer admin link and Account nav entry are hidden.
  - A page-level `notFound()` alone gave 200, because root `loading.tsx` streams the page. The proxy is therefore required.
- **Accessibility fix:** shortlist button labels name the programme and the university. Fixture titles repeat, so the old labels were ambiguous.
- **Tests:**
  - New `tests/local-first.test.ts` (10 tests): migration, storage failures, config parsing, catalog filter.
  - E2E split into `tests/e2e/public` (5 tests, `PUBLIC_MODE=true`, unreachable `REDIS_URL`) and `tests/e2e/private` (3 tests: admin, account). `npm run test:e2e` runs both.
  - The integration fixture university moved from Germany to Hong Kong, because Germany is now hidden by design.

**Measured:**

- typecheck and lint clean.
- `npm test`: 145/145.
- `npm run test:integration`: 4/4.
- `npm run test:e2e`: public 5/5, private 3/3.
- Production build with `PUBLIC_MODE=true DEMO_MODE=false` against the real database, Redis container stopped:
  - `/`, `/profile`, `/results`, `/shortlist`: 200.
  - `/admin`, `/account`, `/api/admin/dashboard`, `/api/auth/me`: 404.
  - `/priorities`: 308.
  - Results payload: 250 Hong Kong programmes, Debrecen hidden.
  - Zero console errors on public pages and one detail page.
  - Detail opened 915 ms after the click.
- No file under `app/` or `components/` outside admin, account and auth imports `lib/queue` or `lib/account`.

**Decided:**

- Static pages (`/`, `/profile`) read `PUBLIC_MODE` at build time. The deployment must set it before building, the same as `DEMO_MODE`.
- Account documents (server) and shortlist documents (browser) are now separate lists. Accounts are out of the public product, so this is acceptable. Logged as a known gap.

**Open (for Part 5):**

- `/results` HTML is 5.7 MB: the whole catalog with evidence, plus up to 12 retrieved-source excerpts per programme. Trim the per-programme `sources` in the snapshot export or the client payload before deployment.
- The `/` home page is static, so its live numbers (7.10) will need it to become dynamic or to be computed from the snapshot at build time.

**Owner actions pending:**

- Approve `git push` of `main`: 2 earlier commits plus Part 1.

## 2026-11-04 16:30: Part 2 done (W2a–W2f, section 3 reviewer)

**Changed (engine, `lib/matching.ts`):**

- **W2a lower bound.** With a partial total, tuition is a floor: no-aid floor = tuition; scholarship floor = max(0, tuition × (1 − coverage) − stipend).
  - A floor converted to the budget currency above budget × 1.05 (or above the budget exactly, in the same currency) makes that scenario FAIL.
  - Financial is FAIL only when every scenario allowed by the funding preference fails; if the preference allows none, every scenario must fail.
  - A partial total never gives PASS.
  - `Scenario` gains `lowerBound`, `lowerBoundConverted` and `partial` for the Part 4 arithmetic panel.
- **Cost rows combine by part.** Rows may each quote one part (tuition, living, other). Parts in one currency now add up to a total.
  - Previously any two rows counted as "differing estimates", so a complete total could never form from separate quotations. This was a blocker for W4.
  - Two different figures for one part, or rows in different currencies, give UNKNOWN with "Official figures disagree: …" (W2f). The smallest tuition still bounds from below.
- **W2b.** Other-year evidence still gives UNKNOWN. The reason now reads "Published for the {year} cycle; {intake} not yet published.", and `Check.url` carries the evidence URL.
  - Other-year costs say the same, prefixed "Costs:".
  - The default intake stays 2027-Fall: the coverage report shows 0 programmes blocked by the year alone.
- **Intake terms.** "Sept…" and "September…" now equal Fall. Round names stay unmapped.
- **W2c field tiers** (`fieldTier`):
  - Tier 1: the field or title equals the query.
  - Tier 2: the query words are in the title's first conjunct.
  - Tier 3: the words appear only in a later conjunct or inside parentheses. This gives a "Related field" check with UNKNOWN.
  - `compareMatches` sorts tiers 1–2, then 3, then 0.
- **W2d.** A-level route rules use the existing `appliesToQualifications`. Tests cover PASS, FAIL, not applicable to IB students, and UNKNOWN without a qualification. Data is in Part 3.
- **W2e.** `documentScope`: documents tied to one school system (Standard X/CBSE, HKDSE, Gaokao, IB, A-level) are dropped for other qualifications. Without a qualification they are shown as unverified and not counted as missing.
- **Other modules:**
  - `lib/trust.ts`: three trust tiers and the review disclosure text.
  - `lib/research/timezone.ts`: South Korea, `Asia/Seoul` +09:00.

**Changed (reviewer):**

- `lib/research/auto-review.ts` holds pure rules 3.1(1–6) and the 3.2 checklist.
- `scripts/auto-review.ts` (`npm run review:auto`, `APPLY=1` writes) runs them against the database.
- It publishes `SOURCE_BACKED` through `reviewCandidate` with reviewer `claude-code-auto`.
- It marks contradicted machine-reviewed rows `CONFLICTING` and records an `AUTO_CONFLICT` ReviewRecord.
- It sets `requirementsComplete` (never clears it) with an `AUTO_COMPLETE` ReviewRecord.
- It exits on `OWNER_APPROVED`.
- Human-reviewed rows are never replaced or demoted. Claims that would replace one are withheld. Programme duration and language only fill gaps.
- The reviewer pre-checks what `reviewCandidate` would reject wholesale: the programme quotation, intake year in the quote, and an approved scholarship `officialUrl`. One bad claim no longer blocks a whole candidate.

**Decided (checklist 3.2, item 3):** a qualification "route" counts only as a mandatory `QUALIFICATION` allow-list that applies to every applicant.

- A route rule scoped to IB is skipped for an A-level student. Marking such a programme complete would let that student reach a wrong PASS.
- The allow-list makes unlisted qualifications UNKNOWN ("equivalency not verified"). The 4 owner-reviewed flagships already use this pattern.

**Measured:**

- typecheck, lint and Prettier clean.
- `npm test`: 189/189 (new: `tests/engine-part2.test.ts` 24, `tests/auto-review.test.ts` 20).
- Integration: 4/4. E2E: public 5/5, private 3/3.
- The hedge-guard test was vacuous at first (`snapExcerpt` returned null before the guard ran). It was rebuilt so that the snap succeeds and only the guard refuses it.
- `npm run review:auto` dry run on the current database:
  - 0 pending candidates (all were reviewed before).
  - 4 programmes already complete.
  - 246 left UNKNOWN: all 246 lack an applicant-wide qualification allow-list; 98 also lack an English minimum. This is Part 3 data work.
- Old engine (`b03cd0e`) against new, real catalog (250 programmes), three profiles:
  - **No new PASS anywhere.**
  - Application UNKNOWN → PASS on 30 programmes (September terms).
  - Financial UNKNOWN → FAIL on 39 programmes for a US$12k budget, 39 for a US$15k full-ride seeker, and 2 for US$40k (tuition-only lower bound).
  - Academic: no change.

## 2026-11-10 19:40: open items from Parts 1–2 closed

**Changed:**

- **Push:** `main` pushed to `origin` (`066db3e..5bdd9d5`), owner-approved.
- **Results payload:** `listPrograms()` in `lib/catalog.ts` drops the retrieved-page `sources` and the evidence excerpts. `/results` and `/shortlist` use it; the detail page keeps both.
  - `/results` HTML: 5.7 MB to 3.4 MB (97 KB gzipped). `/shortlist`: 2.6 MB (81 KB gzipped).
- **Home page live numbers (7.10):** `/` is now dynamic. It shows programmes, universities, "fully checked for 2027" and the latest source retrieval date.
  - Fully checked = `requirementsComplete` and a complete trusted annual cost. The cost part reuses the new `annualCost()` from `lib/matching.ts`, which `matchProgram` now calls, so the home page and matching agree.
  - Current values: 250 programmes, 5 universities, 0 fully checked, sources last retrieved 31 Oct 2026.
- **W2f PolyU cost decision** (`scripts/polyu-costs.ts`, `APPLY=1` writes, rerun-safe). The live other-fees page was re-read today:
  - The items add up to HK$330,272 (US$42,344), while the page states HK$290,272 (US$37,214). Both figures stand.
  - Tuition HK$240,000 stays: the tuition-fees page states it for 2027/28, and its US$30,770 agrees.
  - Every living figure quoted from the other-fees page is now `CONFLICTING`: 2 flagship rows were split, and 45 accommodation-only rows were marked.
  - The 45 "initial fee HK$20,000" rows were removed. They were a misread: the tuition page says the fee "will be converted to form part of the first semester tuition fee upon admission".
  - Each change has a `POLYU_COST_*` ReviewRecord.
- **HKU and HKBU requirements** (`scripts/curate-hku-hkbu.ts`, `APPLY=1` writes, `SOURCE_BACKED`, additive):
  - **HKU, what was tried:** the "Admissions Standards" selector rendered in Chromium, but it shows standards only after a qualification and a programme are chosen. It loads them from `/api/international_qualification/admission_standard/<country>`.
  - **HKU, result:** IB Diploma and GCE A-level standards are identical for Ukraine, India, the UK and Singapore. They are stored as a new version of the international-qualifications page, as the selector renders them.
  - **HKU, encoded:** 57 programmes get the IB and GCE A-level "lower boundary for admissions" and subject requirements, scoped by qualification. Lower boundaries are OTHER rules (UNKNOWN), because the page does not call them minimums.
  - **HKU, skipped:** BEng CS and BEng AI and Data Science already carry the CDS standards. Global Leadership (self-financed) and MBBS Distinguished MedScholar are not on the standards list.
  - **HKBU:** the accordions were already in the stored page text. For all 23 programmes we now encode:
    - the IB Diploma entrance route (QUALIFICATION, scoped to IB);
    - the A-level/IAL route (OTHER, scoped);
    - IELTS 6.0;
    - TOEFL 79, SAT EBRW 590, IB English and GCE AS/A-level English as English alternatives.
  - **HKBU, fix:** the old "SAT evidence-based reading and writing minimum" rule applied to every applicant, which made every HKBU programme UNKNOWN for everyone. It was removed and recorded as `SUPERSEDED_REQUIREMENT`.
  - **Not set:** no `requirementsComplete`. Neither university has an accepted-qualification list that applies to every applicant.

**Measured:**

- typecheck and lint clean. `npm test`: 189/189. Integration: 4/4. E2E: public 5/5, private 3/3.
- `npm run review:auto` dry run: programmes with no English minimum fell from 98 to 75 (HKBU fixed). 246 still lack an applicant-wide qualification list.
- IB profile:
  - HKBU BBA: "General entrance requirement: IB Diploma" PASS; English UNKNOWN (IELTS 5.5 is below 6.0, but other tests could qualify).
  - HKU BBA: lower boundary 38 and subject requirements shown, UNKNOWN.
- DB backups (outside the repo, temporary): `unimatch-before-open-items.dump` and `unimatch-before-hku-hkbu.dump` in the session scratchpad.

**Still open:**

- HKBU "Authorization for verification of results" is an OTHER rule for everyone, so HKBU academic results stay UNKNOWN.
- Several HKU English-route rules ("Bachelor's or higher degree study in English", "Mature applicant rule") are stored as requirements for everyone.
- HKBU deadlines (an image) are not verified.

## 2026-11-10 21:00: Part 5A (no deploy) and Part 4, on branch `hackathon-part-4-5`

Built in a separate worktree (`../UniMatch-p45`), because the Part 3 session works in the main checkout. This branch never writes to the database. The first deployment waits for the owner's server.

**Changed (Part 5A):**

- **Catalog modes** (`lib/catalog.ts`):
  - `queryRows()` returns rows ordered by id, without page text per evidence. `toProgram(row, now)` applies freshness when the catalog is read.
  - `CATALOG_SOURCE=snapshot` reads `data/catalog-snapshot.json` (`CATALOG_SNAPSHOT_PATH` overrides) and never imports the database module.
- **Export:** `npm run catalog:export` writes the snapshot with sorted keys and IDs. `next.config.ts` traces the file into the build.
- **`/api/health`:** catalog source, programme and institution counts, last verified date, commit.
- **Smoke test:** `npm run smoke -- <url>` checks HTTP 200 and no browser errors on every page. It also checks each persona's story against the local snapshot, and that the site shows each persona the same top result and status.
- **Screenshots:** `npm run screens -- <url>` writes `docs/screens/` at 390 and 1440 px and checks for horizontal overflow.

**Changed (Part 4):** all P0 and P1 items.

- **7.1 Sample students:** `lib/personas.ts`, with buttons on the home page and the wizard.
- **7.2 Live drawer:** "Adjust scores and budget" on `/results`. Edits re-rank at once and are saved 250 ms after the last change.
- **7.3 What would change this?:** `lib/whatif.ts`, shown on the detail page.
- **7.4 Cost ledger:** `lib/arithmetic.ts`. Each part shows its source, plus the dated exchange rate, the ±5% budget band and the lower-bound FAIL line.
- **7.5 Actions:** `lib/actions.ts`. Actions appear in "Why this result?", on cards (first action) and on the shortlist. `/profile#field` opens the right step with the field focused.
- **7.6 Trust:** a trust badge on every card and evidence block, and a "Fully checked only" filter. `fullyChecked` in `lib/trust.ts` is shared with the home page count.
- **7.7 Compare:** `/compare?ids=`, with selection from cards and "Compare top 3" on the shortlist.
- **7.8 Deadlines:** `/deadlines`, grouped by month in each intake's time zone, with a toggle for passed deadlines.
- **7.9 Printable shortlist:** print stylesheet, "Copy link" (`/shortlist?ids=`) and "Save to my shortlist".
- **Section 8 polish:**
  - one status token set with icons; skeletons for results and detail;
  - `--fg-3` darkened to meet AA contrast;
  - university names on cards are no longer headings;
  - focus ring;
  - programmes with complete requirements come first within a relevance tier;
  - money is shown as US$/HK$ everywhere.

**Measured:**

- Re-ranking 250 programmes takes about 11 ms in development (target: under 50 ms).
- typecheck, lint and Prettier clean. `npm test`: 206/206. Integration: 9/9 (new: snapshot parity, 4 persona stories). E2E: public 11/11, private 3/3.
- **Snapshot-mode production build:** `PUBLIC_MODE=true`, unreachable `DATABASE_URL` and `REDIS_URL`, 270 programmes in an 8.0 MB snapshot.
  - `/api/health` is OK.
  - `npm run smoke` passes for all 4 personas.
  - `npm run screens` finds no overflow and no errors.
- **Lighthouse accessibility:** `/results` 100; detail page 95 (remaining issues: heading order, link-in-text-block).

**Decided:**

- The persona A-level story's Korean half is checked only once a Korean GUARANTEED scholarship is `ADMIN_VERIFIED`, because only then does the engine treat it as guaranteed (plan 3.7).
- The Part 3 data now has Korean GUARANTEED scholarships as `SOURCE_BACKED`, and there is no KRW rate in `lib/fx-rates.json`. Korean costs therefore cannot be compared with a USD budget yet.
- The snapshot is not committed until the data freeze (5B step 4).

**Owner actions pending:**

- Provide the server.
- Approve Korean guaranteed scholarships.
- Run `npm run fx:update` once KRW is needed.
- Merge `hackathon-part-4-5` into `main`.

## 2026-11-10 22:30: Part 3 (W4, W5, W6, sections 2.1–4)

**Authorised by the owner for this run:** live crawling of the official sites (guarded crawler: approved hosts, robots.txt, 2 s delay, SSRF checks), and a model budget of up to 1M tokens. **No model calls were made** (0 `ModelUsage` rows since Part 2). Every fact is quoted by reviewer scripts from pages fetched through the crawler. Backups (`pg_dump -Fc`) were taken before each write step in the session scratchpad: `unimatch-before-{part3,hkust-reqs,auto-review-hk,auto-review-cuhk,korea}.dump`.

**Token budget (§1):** measured 714 earlier Hong Kong programme calls, about 7k tokens each. It was not needed, because the curation scripts quote pages directly.

**Hong Kong (W4):**

- 2.1/2.2 `scripts/add-tuition-hk.ts`: one SOURCE_BACKED cost row per part, quoted from the re-fetched fee pages.
  - Tuition for 2027/28: CUHK HK$230,000 (all except the two dual-degree programmes), HKUST HK$260,000, PolyU HK$240,000 (government-funded JUPAS programmes), HKBU HK$240,000 (already present).
  - HKU tuition goes by the programme page's FACULTY field against the fee page's lists: STEM HK$280,000, non-STEM HK$250,000, MBBS/BDS HK$590,000. 13 programmes get none: 11 "HKU Business School" (the fee page names "Business and Economics") and 2 without a FACULTY field.
  - CUHK living: about HK$17,000 accommodation plus about HK$45,000 living expenses, HK$62,000 in total. This supersedes the 73 rows of HK$45,000 (living expenses only), by owner decision 2026-11-10; the old rows are kept in ReviewRecords.
  - CUHK other: HK$450 caution fee paid on enrolment (owner decision).
  - HKU, HKUST and HKBU accommodation are ranges, so their totals stay partial.
- 2.3 The CUHK IB guide PDF (2027 entry) is now an approved registry source. `scripts/curate-cuhk-requirements.ts` encodes for 73 programmes: IB Diploma 30/45 (GRADE), IB Chinese grade 4 (OTHER, Dean may exempt), the A-level route (OTHER), and English (IELTS 6.0 and alternatives). The guide says subject preferences "are NOT subject requirements". Dual-degree programmes are untouched.
- `scripts/curate-hkust-requirements.ts` covers 42 programmes in the flagship pattern: IB/A-level allow-list, English alternatives, and the subject requirement quoted from each programme's requirement page. Application choice and interview are informational.
- Freshness: `scripts/recheck-sources.ts` re-fetched the 151 cited HK pages without model calls. Evidence whose quotation is still verbatim moved to the current page version (4,082 rows). HKUST changed its date format ("Nov. 25"), so `scripts/curate-intakes.ts` re-quoted the HKUST intakes.
- W6 hygiene rule: CUHK rounds were stored as terms. The date table states "Early Sep 2027 1st teaching term commences", so the term is now Fall and the round is the route.
- 2.4 HKU/HKBU (`scripts/curate-hku-hkbu.ts`, run earlier today): HKU standards were read from the selector's API. HKBU's IB and A-level routes and English alternatives are encoded. Neither university gets `requirementsComplete`.
- 2.6 `scripts/polyu-costs.ts` (earlier today): both PolyU figures still stand, so the living rows are CONFLICTING, and the misread HK$20,000 initial-fee rows were removed.
- 2.5 `npm run review:auto` (APPLY): requirementsComplete set on 42 HKUST + 73 CUHK. Total complete is now 119 (HKUST 44, CUHK 73, PolyU 2). **Accept: 119 ≥ 10.** Complete annual cost: **73 (CUHK) ≥ 20.**
- 2.7 A-level routes (scoped OTHER rules) are encoded for every HKUST and CUHK complete programme. The 2 PolyU flagships still have the IB route only.

**South Korea (W5):**

- Selection (§3.1). Kept: KAIST (script-rendered; approved with browser rendering), POSTECH, UNIST, Korea University (English track only).
  - Skipped Yonsei UIC, GIST, SKKU (admission-global): robots.txt disallows the admission pages.
  - Skipped DGIST (connection reset / timeout), Hanyang (HTTP 403), SNU (no English-taught route page reached).
  - **4 institutions, short of 6.**
- Programmes: 19 in total. KAIST 6, POSTECH 6 and UNIST 6 are majors listed on the admission pages (all three admit to an undeclared major). KU has 1: International Studies (English Track). **Short of 25.** The registry is `prisma/registry-programs-kr.json` plus Korean universities and pages in `prisma/registry.ts`; `npm run db:seed` applies them.
- `scripts/curate-korea.ts` writes the facts:
  - eligibility (OTHER: parents' citizenship is not in the profile, so it stays UNKNOWN), intakes in `Asia/Seoul`, costs and scholarships;
  - intakes: KAIST regular Fall 2027 closes 2027-01-14 18:00 KST; UNIST Fall 2027 is 2026-12-02 to 2027-01-22 16:00 KST; POSTECH Fall 2027 is "late March to early April 2027" (no dates); the POSTECH and KU Spring 2027 rounds are closed.
- **requirementsComplete: 0 (target 15).** No institution publishes an accepted-qualification list (any recognised high school graduation). KAIST and POSTECH publish no 2027 English rule: KAIST's guideline PDF is the 2025 edition, and POSTECH's Fall 2027 guideline is due in late January / early February 2027. UNIST and KU ask for an English report without a minimum.
- **Complete cost: KAIST (6 programmes)**, from the cost-of-attendance table: KRW 6,866,000 tuition + 6,803,000 housing and food + 1,216,680 insurance and books. The table states no year, so it counts for any intake.
  - KU tuition is per semester for 2026 (stored, not annual).
  - UNIST tuition has no stated period, so it is not stored.
- KRW added to `npm run fx:update`. The NBU table lists KRW; rates are dated 2026-11-11.
- Scholarships:
  - COMPETITIVE: UNIST tuition waiver (the guideline also admits through a non-scholarship track), KU Anam Global.
  - GUARANTEED candidates: KAIST Scholarship, POSTECH tuition waiver, POSTECH living allowance. They are listed in `docs/OWNER_CONFIRM.md` and promoted only by `scripts/owner-confirm.ts` with `OWNER_CONFIRMED=1`.
  - **Not confirmed yet:** until the owner confirms, the "guaranteed scholarship" demo moment is unavailable.

**W6 hygiene:**

- `scripts/evidence-report.ts` (read-only): every published requirement, intake, cost and document quotation is verbatim in its cited page version (0 failures).
- 1 pending candidate is left (Debrecen; Hungary is not enabled).
- `scripts/coverage-report.ts` now counts complete costs by part, as matching does. The result is in `docs/coverage-after.md`.

**Measured:** typecheck and lint clean; Prettier clean on changed files; `npm test` 193/193 (new `tests/curation.test.ts`, 4 tests). Not run: `npm run test:integration`, `npm run test:e2e`, `npm run build`.

**Still open:**

- 185 HKU requirement quotations cite the page version that `curate-hku-hkbu.ts` extended with the selector's API data. A plain re-fetch no longer contains them, so they age out after 30 days unless that script is rerun.
- HKU "final" intakes have no September statement on the page, so they stay unmatched for Fall (59 programmes).
- PolyU (45) and HKBU (23) are not complete: no applicant-wide allow-list, and PolyU programme subject requirements are unchecked.
- A misparsed HKUST accommodation row (HK$21,000 "per semester"; the page gives a range per residential year) remains ADMIN_VERIFIED.
- Curation dry runs fetch and store page versions (no facts are written).
- Korea falls short on institutions (4/6), programmes (19/25) and requirementsComplete (0/15). Guaranteed scholarships await the owner.

## 2026-11-10 23:30: Part 3 addendum: UIC, GIST and SKKU through browser copies

**Owner decision:** the pages of Yonsei UIC, GIST and SKKU that the crawler may not fetch (robots.txt) are to be opened in a browser at the owner's request.

- `scripts/import-browser.ts` (APPLY) opened 18 official pages and PDFs one at a time in plain headless Chromium, 2 s apart, with no stealth and no bot-check handling. It stored 17 as page versions; one UIC download had an unknown file type and was skipped.
- Their approved sources have purpose `owner-browser-copy`. The pipeline and `recheck-sources.ts` never re-fetch them automatically, so their freshness ages normally. A later refresh means rerunning the import.
- Hanyang showed a Cloudflare bot check and DGIST timed out in the browser too. Both were left out.

**Curated** by `scripts/curate-korea-browser.ts` (SOURCE_BACKED, verbatim quotes, no model calls):

- **Yonsei UIC (6 majors):**
  - From the 2027 intake, English proof is required, with no minimum.
  - Eligibility (non-Korean applicant and parents) is an OTHER rule.
  - Spring 2027 1st round closed on 22 Sep 2026. Fall 2027 2nd round: online application in "March, 2027", dates TBD.
  - 2026 tuition per semester: KRW 8,202,000 + 56,000.
  - Admissions Scholarship: COMPETITIVE.
- **GIST (6 majors, 2027 Fall guideline):**
  - Application from 1 Dec 2026 to 29 Jan 2027.
  - English report required, no minimum; at least one standardized test report.
  - Tuition KRW 4,050,000 per semester.
  - The tuition waiver is "Granted to all international students without any conditions": GUARANTEED, added to `docs/OWNER_CONFIRM.md` as item 4.
- **SKKU (5 English-track units, 2027 Spring guide):**
  - Spring 2027 2nd round closes 13 Nov 2026 at 17:00 KST. Fall 2027 is listed for Computer Science and Engineering, with dates not yet published.
  - English report required, no admission minimum (IELTS 6.5 / TOEFL 80 for major placement).
  - The tuition table names no period, so it is not stored.

**Totals:**

- South Korea: **7 institutions, 36 programmes** (plan: ≥6 and ≥25, met).
- requirementsComplete: still 0, because no institution publishes an accepted-qualification list.
- Complete cost: 6 (KAIST).
- `scripts/evidence-report.ts`: 0 non-verbatim quotations.

## 2026-11-11: owner confirmation, scholarship rule fixes

**Owner confirmation** (lusparkl, `docs/OWNER_CONFIRM.md`): the KAIST Scholarship, POSTECH Living Allowance and GIST tuition waiver are `ADMIN_VERIFIED` (18 rows). The POSTECH Tuition Scholarship stays `SOURCE_BACKED`, because the second semester of year one depends on GPA.

**Why more was needed:** the confirmation switched on the Korean half of the "A-level, tight budget" persona check, and that check failed in integration and smoke tests. A confirmed award still never counted as guaranteed: it had no mandatory rules and no deadline, so its eligibility was UNKNOWN. KAIST also stores no annual stipend, so the amount left to pay was unknown.

**Engine changes (approved by the owner):**

- New rule type `ON_ADMISSION`: the source awards it to every student admitted through the route. It evaluates PASS, because every match already assumes admission. Only reviewer scripts set it; model extraction cannot.
- Unquantified stipend: with a complete total, a scholarship scenario leaving the stipend out gives a ceiling. If the ceiling fits the budget, the scenario passes; above the budget it stays UNKNOWN. The arithmetic panel shows the ceiling, and the what-if budget suggestions use it.

**Data** (`scripts/scholarship-rules.ts`, 108 changes, the database backed up first):

- KAIST (6 rows):
  - ON_ADMISSION rule quoting "Upon being selected for admission, you will automatically be entitled to the KAIST Scholarship."
  - Deadline 14 Jan 2027, 18:00 KST. The award page says "Application Period Same as Admission Application", and the KAIST timeline gives that date for the Regular route.
- GIST (6 rows): ON_ADMISSION rule, but no deadline, because nothing links the waiver to the application period. Its eligibility stays UNKNOWN.
- 96 rows had residency categories (`local`, `non-local`, `international`) as nationality restrictions: CUHK 88, PolyU 4, HKU 3, HKUST ECE 1. These failed every student. The categories moved to an OTHER rule, so these rows are now UNKNOWN.
- 10 university-level scholarships had no candidate to record a review on.

**Effect:** the persona's top results changed, because CUHK admission scholarships no longer fail.

**Checks:** typecheck and lint are clean. `npm test` passes 212/212, integration 9/9 and e2e 14/14. The snapshot build succeeds, and `npm run smoke` against a local `next start` passes for all 4 personas.

## 2026-11-11 09:00: Part 3 gap curation and Korean retry audit

**Scope and safety:** the owner authorised live retrieval from official university sites through the guarded crawler. No model calls were made; `ModelUsage` has 0 rows since 2026-11-11 00:00 UTC. Every database write used `APPLY=1` only after a dry run and a fresh `pg_dump -Fc` backup. Backups are outside the repository under `/tmp/unimatch-curate-gaps.sjztyW/`. No `ADMIN_VERIFIED` fact was changed: a restored pre-write database and the current database have identical counts and row fingerprints for `AdmissionRequirement`, `ApplicationIntake`, `CostEstimate`, `RequiredDocument`, `Scholarship`, and `SourceEvidence` rows backed by `ADMIN_VERIFIED` evidence.

**Published SOURCE_BACKED facts:**

- HKU: added 5 annual 2027 tuition rows of HKD 250,000 for programmes whose official programme pages name HKU Business School. Source: https://www.admissions.hku.hk/fees-and-scholarships/fees. The September 2027 statement was re-fetched from https://admissions.hku.hk/sites/default/files/2026-09/HKU_General_Information_NJ_2027.pdf, but the existing `final` deadline is on another page. No intake fact was assembled across sources.
- HKBU: added 69 Fall 2027 intake rows for 23 programmes: early, main and extended rounds from https://iss.hkbu.edu.hk/amsappl_nj/eventcalendar.jsf. Opening dates remain null because the page gives no opening time; all 69 deadlines include the published 23:59 time. An initial correction apply exposed an existing stored-page deduplication bug and wrote no facts. After the fix, all 69 rows were replaced with the corrected null opening times.
- PolyU: added 8 Fall 2027 intake rows with the 17 November 2026 deadline. Evidence came from the official international programme listings and their `?page=1` / `?page=2` pages. Current cost sources still conflict: https://www.polyu.edu.hk/study/2027/international-other-qualifications-other-fees-and-expenses states HKD 290,272 but its itemised amounts total HKD 330,272; https://www.polyu.edu.hk/study/ug/admissions/jee/frequently-asked-questions states HKD 330,272. Existing living-cost rows stay `CONFLICTING`.
- POSTECH: added 6 annual 2026 cost rows from https://adm-iu.postech.ac.kr/user/comm/menu/4a69b7aee6a156d3c2ddb7413544ab2c/content/index.do. Each row stores KRW 5,580,000 tuition, KRW 7,235,000 living (housing, phone and food), and KRW 951,840 NHI.
- `scripts/curate-hku-hkbu.ts` was rerun for its 80 eligible programmes. Its newest candidate could be an institution-wide candidate with `program: null`; selection now finds the newest reviewed candidate that explicitly names the programme. One candidate from the failed run was rejected before the successful rerun.

**Facts deliberately left unknown:**

- UNIST: the official Fall 2025 enrolment PDF at https://admg-intl.unist.ac.kr/wp-content/uploads/2025/08/6.-Fall-2025-Notice-of-Enrollment_1.pdf timed out on both guarded attempts and produced no stored page version. Search-engine text was not accepted as evidence, so no cost was written.
- SKKU: the current official tuition table still names no period, so no cost was written.
- KAIST: the 2027 guide PDF first hit the content-size bound, then the single guarded retry failed with `read ECONNRESET` and `requestHandler timed out after 180 seconds`. Indexed text describes English scores as recommended or optional, not a mandatory applicant-wide minimum. No requirement was written.
- POSTECH: the site says the Fall 2027 guide will be published in late January or early February 2027. No current English minimum was written.
- DGIST retry ended with `Source request timed out`. Hanyang's homepage became reachable, but its current 11.7 MB guide yielded only 405 characters of page markers and no quotable facts. SNU's 2027 notice was reachable, but it directs applicants to departments about English availability and does not establish an applicant-wide English-taught route. No institution or fact was added for these retries.
- Scholarship quotations remain current: POSTECH 12/12, UNIST 6/6, Yonsei UIC 6/6 and Korea University 1/1. No new unconditional award was found. POSTECH tuition renewal depends on GPA, UNIST has a non-scholarship track, and UIC/KU awards remain competitive.

**HKUST owner proposal:** 42 `ADMIN_VERIFIED` rows store HKD 21,000 per semester, but the source states a HKD 21,000–51,000 range per residential year. `docs/OWNER_CONFIRM.md` now proposes deleting only those 42 accommodation-only rows while preserving every tuition row and HKD 65,000 annual personal-expenses row. No HKUST row was changed.

**Code and audit fixes:**

- `scripts/curate-gaps.ts` provides one-university dry-run/apply curation for HKU, HKBU, PolyU, POSTECH and UNIST, plus a read-only scholarship recheck.
- `lib/research/crawler.ts` recognises a standard `%PDF-` signature when an official server labels a PDF `application/octet-stream`. A unit regression covers binary PDF detection.
- `scripts/curation.ts` now upserts stored page versions by the existing `(universityId, url, contentHash)` unique key. This handles a dynamic page returning an older known hash instead of failing with Prisma `P2002`.
- Approved-source registry additions cover the cited HKU, HKBU, PolyU, POSTECH and UNIST pages.

**Coverage before and after:** total published programmes remain 286 and `requirementsComplete` remains 119. Before this pass, 23 HKBU and 8 PolyU programmes had no intake; all 31 now have cited 2027 intakes. Five HKU and six POSTECH programmes had no cost; all 11 now have cited cost rows. UNIST and SKKU costs remain unknown. The strict 2027 cost-completeness figure does not increase because HKU still lacks a supported complete living total and POSTECH's cost evidence is explicitly as of 2026. `npm run review:auto` stayed dry: 150 qualification-list gaps, 45 conflicting/outdated-row gaps, 15 English-rule gaps.

**Verification:**

- typecheck and lint: clean; Prettier and `git diff --check`: clean.
- `npm test`: 14 files, 213/213 passed. Focused PDF regression: 31/31 passed.
- `npm run test:integration`: 5 files, 9/9 passed. The existing pg warning remains: `Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0.`
- `scripts/evidence-report.ts`: every published requirement, intake, cost and document quotation is verbatim; 0 failures. One pre-existing Debrecen candidate remains pending.
- `npm run catalog:export`: 287 stored programmes and 9,105,212 bytes. This is 286 enabled Hong Kong/South Korea programmes plus the disabled Debrecen record.
- Snapshot production build passed with unreachable DB and Redis URLs. Turbopack still warns that dynamic `path.resolve` in `lib/catalog.ts` traces the whole project.
- `npm run smoke` passed all 4 personas against `next start` on port 3112. The server was stopped afterward; port 3000 was not touched.
- `npm run test:e2e` was not requested or run in this pass.

## 2026-11-11 09:20: POSTECH tuition marked CONFLICTING

**Reason:** the cited table "Estimated Essential Expenses (as of 2026)" states "Tuition Fees 2,790,000 2,790,000 5,580,000", but its own note states "First semester tuition fee of 2026 : KRW 2,924,000 (automatically waived)". These are two tuition figures for the same semester. The table's tuition is gross, because the waiver is subtracted separately in "POSTECH Scholarship" (B). The stored tuition therefore did not double-count the POSTECH Tuition Scholarship.

**Change:** `scripts/postech-costs.ts` (APPLY) follows the `polyu-costs.ts` pattern.

- On each of the 6 POSTECH rows added in the gap pass, the tuition part moved to its own `CONFLICTING` row, with the same quotation and KRW 5,580,000 annual.
- Housing, phone and food (KRW 7,235,000) and NHI (KRW 951,840) stay `SOURCE_BACKED`.
- Each change has a `POSTECH_COST_SPLIT_CONFLICTING_TUITION` review record.
- Backup: `unimatch-before-postech-costs.dump` in the session scratchpad.

**Effect:** POSTECH has no complete trusted annual cost, so its financial match stays UNKNOWN, as it was before the gap pass.

**Checks:**

- typecheck and lint: clean.
- Prettier: clean on the new script.
- `npm test`: 213/213.
- `npm run test:integration`: 9/9.
- `scripts/evidence-report.ts`: 0 quotations not verbatim.
- `npm run catalog:export`: 287 programmes.
- Not run: snapshot build, `npm run smoke`, `npm run test:e2e`.

## 2026-11-11 13:15: HKUST accommodation rows deleted (owner-confirmed)

**Owner decision:** lusparkl confirmed item 5 in `docs/OWNER_CONFIRM.md`.

**Change:** `scripts/hkust-accommodation.ts` was run with `OWNER_CONFIRMED=1` and `OWNER_NAME=lusparkl`.

- It deleted exactly 42 `ADMIN_VERIFIED` accommodation-only rows: HKD 21,000, period `SEMESTER`, each citing "~HKD 21,000 – HKD 51,000 ... per residential year".
- Each deletion has an `OWNER_CONFIRMED_DELETE_MISPARSED_COST` review record.
- Preserved:
  - 42 SOURCE_BACKED tuition rows (HKD 260,000);
  - 42 ADMIN_VERIFIED personal-expense rows (HKD 65,000);
  - 2 combined ADMIN_VERIFIED annual rows.
- Backup: `unimatch-before-hkust-accommodation.dump` in the session scratchpad.

**Effect:** matching only combines `ANNUAL` rows, so these `SEMESTER` rows never counted. Match results do not change; the misleading figure no longer appears.

## 2026-11-11 15:50: Red-team spot check and full check run

**Red team (plan 3.3, §5):** `scripts/red-team.ts` (new, read-only, seed 20261111) sampled 15 programmes: 8 Hong Kong, of which 3 are auto-approved HKUST programmes with PASS, and 7 Korea. It checked 141 trusted facts against 28 live pages.

- **Result:** 0 wrong values.
  - 8 HKU quotations come from the selector API. They were checked against the live API, and all match.
  - Details and observations are in `docs/VERIFICATION_LOG.md`.
- **No overall PASS:** no persona gets an overall PASS, so "shows PASS" was read as academic or financial PASS.
- **Changes:** none; no programme lost `requirementsComplete`.

**Full checks (on the data after the HKUST deletion):**

- typecheck and lint: clean.
- `npm test`: 213/213.
- `npm run test:integration`: 9/9. The existing pg deprecation warning remains.
- `npm run test:e2e`: 14/14 (11 public, 3 private).
- `scripts/evidence-report.ts`: 0 quotations not verbatim. 1 Debrecen candidate is still pending.
- Snapshot build: ok. Turbopack still warns that `app/api/health/route.ts` traces the whole project.
- `next start -p 3112`: `/api/health` reports 286 programmes and 12 institutions.
- `npm run smoke`: 4/4 personas passed. The server was stopped afterwards.

**Found:** `scripts/coverage-report.ts` has its own `season()`, which treats only "autumn" as Fall. It therefore reports 30 PolyU programmes without a 2027 Fall intake. Matching's `season()` also accepts "sept" and "september", and under it PolyU has 0 such programmes. This is a reporting bug only. HKU's 59 "final" intakes are genuinely not Fall.

## 2026-11-11 16:20: Repository cleanup (owner request)

**Deleted docs:**

- `docs/coverage-baseline.md` and `docs/coverage-after.md`. `npm run coverage` regenerates them.
- `docs/VERIFICATION.md` (the 27 Oct record), replaced by this log and `docs/VERIFICATION_LOG.md`.
- `docs/COST_LOG.md`. `scripts/cost-benchmark.ts` recreates it on its next run.
- `docs/AI_HANDOFF.template.md`.

README and AGENTS.md links were updated.

**Debrecen removed:**

- **Files:** `prisma/curated-evidence.json`, `prisma/seed-evidence.ts` and `scripts/capture-curated-snapshot.ts` are deleted, and the Debrecen entry in `prisma/curated.ts` is gone.
- **Opt-in smoke tests:** `scripts/live-smoke.ts` and `scripts/model-smoke.ts` now default to HKUST.
- **Database:** one transaction deleted the university, its programme, 2 approved sources, 2 page versions, 3 evidence rows, 3 research jobs, 4 `ModelUsage` rows and 3 candidates. No `ReviewRecord` referenced them.
- **Backup:** `unimatch-before-debrecen-removal.dump` in the session scratchpad.
- **Result:** 12 institutions and 286 published programmes. The snapshot was re-exported with 286 programmes, and no candidates are pending.

**Checks:**

- Prettier: clean on the changed files.
- typecheck and lint: clean.
- `npm test`: 213/213.
- `npm run test:integration`: 9/9.
- `npm run test:e2e`: 14/14.
- `scripts/evidence-report.ts`: 0 quotations not verbatim.
- `npm run db:seed`: runs, and the counts are unchanged.
