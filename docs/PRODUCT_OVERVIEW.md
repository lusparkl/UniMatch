# UniMatch: Product Overview

Snapshot: 2026-11-11 on `main`. Pages, features and rules come from the source code. Catalog figures come from the reviewed database and `data/catalog-snapshot.json`, both checked on 2026-11-11.

## 1. What UniMatch is

UniMatch is an evidence-led university research and matching tool for international applicants. The real catalog covers first-year bachelor's programmes in **Hong Kong and South Korea**. The matching engine also supports master's profiles.

It answers three questions for each programme, separately:

1. **Academic fit:** does the student meet the published academic and English requirements?
2. **Application eligibility:** is there a verified, still-open intake and application route? Do nationality or education-country rules apply?
3. **Financial feasibility:** can the student afford the verified annual cost, with or without a specific scholarship?

Core principles:

- **Deterministic matching.** The student's browser computes every result from published facts. There is no admission probability and no opaque match score.
- **Three-valued logic.** Every check is `PASS`, `FAIL` or `UNKNOWN`. Missing, unverified, stale or conflicting evidence gives `UNKNOWN`, never a silent `PASS`.
- **Evidence first.** Every published fact links to an exact quotation from an official page, with its URL and retrieval date.
- **Human publication.** Model extraction only creates review candidates. Reviewer scripts write `SOURCE_BACKED` facts with verbatim quotations. Only the project owner makes a fact `ADMIN_VERIFIED`.
- **Public browsing is passive.** Students never trigger crawls or model calls.
- **Privacy.** No document uploads. The profile, shortlist and document checklist stay in the browser.

## 2. Technology

| Area             | Technology                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Runtime          | Node.js 22.13+ (tested on 24), npm                                                                                |
| Web              | Next.js 16.4.3 App Router, React 19, TypeScript 5.9                                                               |
| Styling          | Tailwind 4, custom CSS in `app/globals.css`, Radix Slot button (`components/ui/button.tsx`), `lucide-react` icons |
| Data             | PostgreSQL 17 through Prisma 7 (`@prisma/adapter-pg`), or a bundled JSON snapshot                                 |
| Queue and limits | Redis 7, BullMQ 5, ioredis                                                                                        |
| Crawling         | Crawlee 3, Cheerio, Playwright Chromium fallback, `pdf-parse`, `robots-parser`, `ipaddr.js`                       |
| AI               | OpenAI Chat Completions, default `gpt-5.4-mini`, strict JSON Schema, Zod validation                               |
| Auth             | bcryptjs, database-backed sessions, Redis attempt limits                                                          |
| Tests            | Vitest (unit and integration), Playwright (E2E, smoke, screenshots)                                               |

`docker compose up -d` starts PostgreSQL on loopback port **5434** (user and database `unimatch`) and Redis on **6381**.

## 3. Operating modes

| Mode                                                              | What students see                                                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Offline demo (`DEMO_MODE=DEMO_FIXTURES`, or no `DATABASE_URL`)    | 10 fictional programmes from `lib/demo.ts`. A banner on every page says all data is fictional.                         |
| Real catalog (`DEMO_MODE=false`, `CATALOG_SOURCE=db`)             | Published, reviewed programmes from PostgreSQL. Admin and optional student accounts are available.                     |
| Public deployment (`PUBLIC_MODE=true`, `CATALOG_SOURCE=snapshot`) | The same published catalog, read from `data/catalog-snapshot.json`. No admin, accounts, Redis, database or OpenAI key. |

In every mode, only countries in `ENABLED_COUNTRIES` (default `Hong Kong,South Korea`) reach students. The fictional catalog has 5 institutions in those two destinations, each with a BSc and an MSc in Computer Science. The fixtures exercise a guaranteed award, a missing deadline, full-cost funding, conflicting evidence and a nationality restriction. They never enter the database.

## 4. Student pages

All pages share `components/shell.tsx` and `components/nav.tsx`:

- **Header links:** Explore (`/results`), My profile (`/profile`), Shortlist (`/shortlist`), Deadlines (`/deadlines`), plus Account (`/account`) outside public mode. The button is "Find my match".
- **Mobile tab bar:** Home, Explore, Shortlist, Profile.
- **Footer:** "Study in Hong Kong and South Korea, with every answer traced to an official source." Outside public mode it also links to "Research administration" (`/admin`).

Layouts are checked at 390 px and 1440 px (`npm run screens`, `docs/screens/`).

### 4.1 Home: `/`

- Hero "Your next chapter. Within reach." (eyebrow "Big ambitions. Clearer possibilities."), with "Find my universities" and "Explore programs".
- A count of universities and of programmes **fully checked** for the default intake (`requirementsComplete` plus a complete trusted annual cost), and the last retrieval date.
- **Try a sample student:** four persona buttons (§7.6) that load a profile and open the results.
- The panel "Three questions, answered separately.", destination pills for Hong Kong and South Korea, and three feature cards.

### 4.2 Profile wizard: `/profile`

Three steps (`components/profile-wizard.tsx`): Your direction, Your qualifications, Your budget. The sample-student buttons appear on step 1.

1. Nationality, country of education, field of study, and desired intake (2027 to 2029 with Fall, Spring, Winter, Summer or Autumn; default `2027-Fall`). The wizard asks for no destination or degree: the catalog is bachelor's programmes in Hong Kong and South Korea.
2. Qualification (exact name, for example IB Diploma or GCE A-Level), grading scale and grade, IELTS, TOEFL iBT, Duolingo, PTE Academic, SAT and ACT. A profile with degree level master's also shows previous bachelor's field, GPA, GRE and GMAT. Free-text other credentials. Every field is optional, and missing values stay unknown.
3. Annual budget and currency (USD, EUR, GBP, HKD, KRW, INR, UAH), and funding preference: full ride, tuition scholarship, partial funding, or none.

The profile is stored in `localStorage` as `unimatch-profile-v2`; a `v1` profile is migrated. A profile link (`/profile#<field>`) opens the right step with the field focused.

### 4.3 Explore: `/results`

- **Filters:** search, destination, funding options (scholarship available, potential full coverage), status, and "Fully checked only". Active filters show as removable chips.
- **Sort:** Relevant fit (default: confirmed failures last, then field match, financial result, evidence completeness, research recency), University name, Lowest cost, Recently researched.
- **Card:** university, title and tags; status tag and trust badge; academic fit, annual cost before aid (total, or "Partial · tuition only", or unavailable), financial assistance, next verified deadline in the institution's time zone, and a "Next step" action for results that are not PASS.
- **Profile drawer:** edit budget, funding and scores in place; results re-rank live.

Status labels: PASS "Published minimums met", UNKNOWN "Needs verification", FAIL "Requirements not met". Trust badges (`lib/trust.ts`): "Human-reviewed" (ADMIN_VERIFIED), "Auto-verified from official source" (SOURCE_BACKED), "Needs verification".

### 4.4 Programme detail: `/universities/[id]?program=<id>`

- Programme chips, a summary (status, cost, funding, next deadline, last researched) and the official programme link.
- **Tabs:** Requirements (each rule, documents and evidence quotations), Deadlines, Funding, Costs. Each fact has an expandable evidence block with its quotation, retrieval date and source link.
- **Your financial scenarios:** without a scholarship, then one per scholarship, never stacked. Each scenario shows the arithmetic line by line: parts, conversion with the FX source and date, lower bound or ceiling, and the remaining cost.
- **Why this result?:** every academic and application check with its reason and next step.
- **What would change this?:** single hypothetical changes from `lib/whatif.ts`, shown only when the result would improve.

### 4.5 Shortlist, compare and deadlines

- **`/shortlist`:** an ordered list kept in local storage. Rows can be reordered or removed. Shows tests and documents per programme, documents to prepare across the list, a shareable link (`Shared shortlist` view, which can be saved), and Print.
- **`/compare`:** two or three programmes side by side.
- **`/deadlines`:** verified upcoming deadlines grouped by month.
- **`/priorities`:** permanently redirects to `/shortlist`.

### 4.6 Account: `/account` (not in public mode)

Optional email and password accounts (minimum 10 characters) that save the profile, document statuses and priorities on the server. Account deletion needs the password. No email is sent, so there is no verification or password reset. In public mode the page and its APIs answer 404.

## 5. Administrator workspace: `/admin` (not in public mode)

- One administrator from `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (`npm run admin:password`). Sessions use an HttpOnly, SameSite=Strict cookie and expire after 8 hours. Writes are origin-checked, and Redis limits login attempts.
- **Tabs:**
  - Overview: OpenAI status, counters and token budget.
  - Universities: approved institutions and sources, and add or update a university.
  - Research: launch a job, approve a source, and view the job log.
  - Review: candidates with the retrieved source and editable JSON. Approve or reject; a completeness checkbox sets `requirementsComplete`.

## 6. API routes

| Route                                                         | Purpose                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /api/health`                                             | Catalog source, programme and institution counts, last verification, commit |
| `/api/auth/[action]`                                          | Student sign-up, login, logout and `me`. Redis limits attempts.             |
| `/api/account/{profile,documents,priorities,me}`              | Saved profile, document statuses, priorities, account deletion              |
| `/api/admin/login`, `/api/admin/logout`                       | Administrator session                                                       |
| `/api/admin/{dashboard,universities,sources,research,review}` | Admin data and actions                                                      |
| `POST /api/admin/explain`                                     | Admin-only, metered OpenAI explanation of a deterministic result            |

In public mode, `proxy.ts` answers 404 for `/admin`, `/account`, `/api/admin`, `/api/account` and `/api/auth`.

## 7. Matching engine

File: `lib/matching.ts`, function `matchProgram`. All logic is deterministic and runs offline.

### 7.1 Combining states

Any `FAIL` makes the result `FAIL`. Otherwise any `UNKNOWN`, or no checks at all, gives `UNKNOWN`. Otherwise the result is `PASS`. The overall status combines the academic, application and financial results. Evidence is trusted only when it is `ADMIN_VERIFIED` or `SOURCE_BACKED`.

### 7.2 Academic checks

- **Degree level:** PASS on a match, otherwise FAIL.
- **Field of study:** word match with stemming and aliases (AI, CS, IT, ML, econ, BBA). No match gives UNKNOWN; a combined programme is a related field.
- **English proof:** IELTS, TOEFL, Duolingo, PTE and "English proof (any one accepted test)" rules form one any-of group. One passing test gives PASS; FAIL needs a result below the minimum on every accepted test.
- **Numeric scores** (SAT, ACT, GRE, GMAT, GRADE): compared with the published minimum. GRADE also needs an identical grading scale.
- **Qualification and bachelor's field:** exact match against accepted values. An unlisted qualification gives UNKNOWN, never FAIL.
- **Applicability and year:**
  - Rules scoped to nationalities or qualifications apply only where they match.
  - Evidence for another academic year gives UNKNOWN.
  - OTHER rules are always UNKNOWN.
  - Requirements are UNKNOWN unless `requirementsComplete` is set.

### 7.3 Application checks

Nationality and education-country rules, then the intake for the student's year and term. Autumn and Sept/September count as Fall. Routes are alternatives. A route needs trusted status, a deadline and a time zone. A passed deadline gives FAIL, and one open route gives PASS.

### 7.4 Financial checks

- **Annual cost:**
  - `annualCost` combines trusted `ANNUAL` rows for the intake year by part (tuition, living, other) in one currency.
  - Two different figures for one part are a conflict.
  - Per-semester rows never enter the annual total.
- **Currency:**
  - Converted at National Bank of Ukraine rates dated **2026-11-11** (`lib/fx-rates.json`; `npm run fx:update`): UAH, USD, EUR, HKD, HUF, SGD, GBP, INR and KRW.
  - A converted result within **5%** of the budget stays UNKNOWN.
- **Lower bound:** with an incomplete total, the result never passes. It fails when tuition alone already exceeds the budget (plus the 5% margin when converted).
- **Scenarios:**
  - "Without scholarship", then one per scholarship. Remaining = total − tuition × coverage − stipend.
  - A scenario is **GUARANTEED** only with category GUARANTEED, status ADMIN_VERIFIED and passing eligibility; otherwise it is **COMPETITIVE** ("Eligibility to apply is not an award.").
  - Eligibility needs passing mandatory rules, trusted status and a future deadline.
  - When the stipend amount is not stored, a **ceiling** (total minus covered tuition) can show affordability.
  - `ON_ADMISSION` rules (awards to every admitted student) evaluate PASS.
- **Funding preference:** FULL_RIDE counts only full-ride scenarios; TUITION counts only full-tuition awards; PARTIAL and NONE count all.
- **Financial PASS** needs an affordable, eligible scenario that is not competitive.

### 7.5 Explanations

- `lib/arithmetic.ts`: the cost lines behind a financial result.
- `lib/actions.ts`: the next step for each non-PASS check.
- `lib/whatif.ts`: "What would change this?".
- `lib/readiness.ts`: tests, documents and the next deadline.

### 7.6 Sample students (`lib/personas.ts`)

| Persona                    | Profile                                                     | Story the catalog must support                                                                                        |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| IB student, strong English | India · IB Diploma 38 · IELTS 7.5 · US$30,000 · partial     | Hong Kong flagship programmes pass the academic check on a verified IB route.                                         |
| A-level, tight budget      | Vietnam · GCE A-Level · TOEFL 95 · US$12,000 · partial      | Hong Kong tuition alone exceeds the budget, so the financial check fails; in Korea a guaranteed scholarship can pass. |
| Needs a full ride          | Nigeria · IB Diploma · IELTS 7 · US$5,000 · full ride       | Scholarships appear as competitive unless the university guarantees them.                                             |
| Missing scores             | Ukraine · local qualification · no English test · US$15,000 | Results stay UNKNOWN with reasons, and each one says what to add or check.                                            |

`tests/integration/personas.spec.ts` and `npm run smoke` fail if a story stops holding.

## 8. Research and curation (administrator only)

**Model pipeline** (`lib/research/`, `lib/ai/openai.ts`, `worker/`):

- Approved sources are crawled into immutable page versions.
- Registry universities get one model call per programme (prompt `program-v20`).
- Deterministic pruning removes claims the quotation cannot support.
- Candidates wait for review.
- Budgets: 6 calls per job, 1 concurrent call, 4,000 output tokens per call, and a daily token cap.

**Reviewer curation** (`scripts/`): most of the published catalog came from quotation-based scripts, with no model calls.

- **Fetching:** pages come through the guarded crawler; facts are quoted verbatim from the stored page.
- **Writing:** `SOURCE_BACKED` rows plus review records. Scripts are dry runs by default and write only with `APPLY=1`, after a database backup.
- **Browser copies:** UIC, GIST and SKKU pages were opened once in a browser at the owner's request, because robots.txt closes them to crawlers. They are never re-fetched automatically.
- **Checks:**
  - `scripts/evidence-report.ts`: every published quotation is verbatim.
  - `scripts/recheck-sources.ts`: re-fetches cited pages.
  - `scripts/red-team.ts`: live spot check.

**Crawler safeguards:**

- Approved hosts only; every resolved IP must be public, with the socket pinned to it.
- robots.txt is checked first, with at least 2 s between requests to one host and a 2 MB download cap.
- No proxies, evasion, logins or CAPTCHA solving.

**Freshness at read time:** deadlines expire after 7 days (30 on the demo deployment), scholarships and admissions facts after 30, metadata after 90. `npm run schedule` queues re-research of stale sources.

**Verification statuses:**

| Status                    | Meaning                                            |
| ------------------------- | -------------------------------------------------- |
| `ADMIN_VERIFIED`          | The owner approved it. Trusted.                    |
| `SOURCE_BACKED`           | Verbatim quotation passed machine checks. Trusted. |
| `CONFLICTING`             | Official sources disagree. Not trusted.            |
| `OUTDATED`                | Past its freshness window. Not trusted.            |
| `NEEDS_REVIEW`, `UNKNOWN` | Not reviewed, or no usable evidence. Not trusted.  |

## 9. Data model

`prisma/schema.prisma`, 5 migrations (`202610270001_initial` to `202610300002_priority_program_id`).

| Group    | Models                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog  | `University`, `ApprovedSource`, `DegreeProgram`, `ApplicationIntake`, `AdmissionRequirement`, `Scholarship`, `ScholarshipEligibility`, `CostEstimate`, `RequiredDocument` |
| Evidence | `SourceDocument` (page versions), `SourceEvidence` (quotation, URL, academic year, status)                                                                                |
| Research | `ResearchJob`, `ResearchLog`, `ExtractionCandidate`, `ReviewRecord`, `ModelUsage`                                                                                         |
| Students | `User`, `UserSession`, `UserDocument`, `Priority`                                                                                                                         |
| Admin    | `AdminSession`                                                                                                                                                            |

## 10. Current catalog (2026-11-11)

286 published first-year bachelor's programmes at 12 institutions. 119 have `requirementsComplete`, 79 have a complete trusted annual cost for 2027, and 73 are fully checked.

| University       | Published | requirementsComplete | Complete 2027 cost | Notes                                                                                                   |
| ---------------- | --------- | -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| CUHK             | 75        | 73                   | 73                 | IB and A-level routes encoded.                                                                          |
| HKU              | 61        | 0                    | 0                  | IB and A-level standards from the admissions selector. 59 intakes are "final" rounds, not Fall.         |
| PolyU            | 47        | 2                    | 0                  | Living costs CONFLICTING (stated total HK$290,272 vs items HK$330,272).                                 |
| HKUST            | 44        | 44                   | 0                  | Tuition and personal expenses stored; no accommodation figure (owner-confirmed deletion of a misparse). |
| HKBU             | 23        | 0                    | 0                  | 2027 early, main and extended rounds.                                                                   |
| KAIST            | 6         | 0                    | 6                  | Owner-confirmed KAIST Scholarship (full tuition).                                                       |
| POSTECH          | 6         | 0                    | 0                  | Tuition CONFLICTING (KRW 2,790,000 vs 2,924,000 for semester 1); living allowance owner-confirmed.      |
| UNIST            | 6         | 0                    | 0                  | No tuition with a stated period.                                                                        |
| GIST             | 6         | 0                    | 0                  | Tuition per semester; owner-confirmed tuition waiver.                                                   |
| Yonsei UIC       | 6         | 0                    | 0                  | Tuition per semester (2026).                                                                            |
| SKKU             | 5         | 0                    | 0                  | Tuition table names no period.                                                                          |
| Korea University | 1         | 0                    | 0                  | International Studies (English Track); Spring 2027 round closed.                                        |

- No Korean institution publishes an accepted-qualification list or a 2027 English minimum, so Korean programmes have no `requirementsComplete`.
- Not in the catalog: Hanyang (bot check), DGIST (timeouts) and SNU (no English-taught route page).
- **Red-team check, 2026-11-11** (`docs/VERIFICATION_LOG.md`): 15 sampled programmes and 141 facts, with 0 wrong values.

## 11. Owner decisions

Recorded in `docs/OWNER_CONFIRM.md` and `docs/HACKATHON_LOG.md`:

- Live crawling is authorised. The model budget is up to 1M tokens, and it is unused.
- Browser copies are allowed for UIC, GIST and SKKU only.
- Guaranteed awards confirmed: KAIST Scholarship, POSTECH Living Allowance and the GIST tuition waiver. The POSTECH Tuition Scholarship is not confirmed, because semester 2 depends on GPA.
- The 42 misparsed HKUST accommodation rows are deleted.
- Hong Kong deadlines use `Asia/Hong_Kong`. Partial totals are shown as partial. Currencies are converted at dated reference rates.

## 12. Commands

Development, test and configuration commands are in `README.md`. Catalog and review commands:

| Command                                              | Purpose                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `npm run catalog:export`                             | Write `data/catalog-snapshot.json`                         |
| `npm run smoke -- <url>`                             | Public pages and persona stories against a running build   |
| `npm run screens -- <url>`                           | `docs/screens/` at 390 and 1440 px                         |
| `npm run coverage`                                   | Coverage report per university and intake                  |
| `npm run review:auto`                                | Auto-review of `requirementsComplete` (dry run; `APPLY=1`) |
| `npx tsx --env-file=.env scripts/evidence-report.ts` | Verbatim check of every published quotation                |
| `npx tsx --env-file=.env scripts/red-team.ts`        | Read-only red-team spot check (`SEED=<n>`)                 |
| `npm run fx:update`                                  | Refresh exchange rates from the NBU                        |

## 13. Tests (2026-11-11)

- `npm test`: 213/213.
- `npm run test:integration`: 9/9 (pipeline, browser rendering, snapshot parity, personas).
- `npm run test:e2e`: 14/14 (11 public, 3 private).
- The snapshot build passes; `npm run smoke` passes for all 4 personas.

## 14. Known issues and gaps

- Korean `requirementsComplete` is 0, and UNIST and SKKU have no annual cost.
- PolyU living costs and POSTECH tuition are CONFLICTING.
- 45 PolyU and 23 HKBU programmes are not `requirementsComplete`.
- HKU:
  - 59 "final" intakes are not Fall.
  - Requirement quotations refreshed on 2026-11-11 age out after 30 days unless `scripts/curate-hku-hkbu.ts` is rerun.
- The HKBU intake quotation does not state the entry year; Fall 2027 is inferred from the round dates.
- Labels:
  - Some HKU rule labels are truncated at 300 characters, or omit an option, while the quotation is complete.
  - HKU programmes carry overlapping TOEFL rules.
- PTE and IELTS sub-score minimums exist only in labels.
- Word-based field matching is broad.
- Not included: OCR for scanned PDFs, admission probability and automated qualification recognition.
- Not deployed yet.

## 15. Next actions

1. Deploy on a host the owner provides, with `PUBLIC_MODE=true`, `CATALOG_SOURCE=snapshot` and `FRESHNESS_DEADLINE_DAYS=30`. Run `npm run smoke -- <live url>`.
2. Freeze: re-export the snapshot, commit it, and tag `demo-freeze`.
3. Write `docs/DEMO_SCRIPT.md` from the frozen snapshot, and record the demo video.
4. Rerun `scripts/curate-hku-hkbu.ts` before about 2026-12-10.
