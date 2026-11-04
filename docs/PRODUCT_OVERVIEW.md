# UniMatch: Product Overview

Snapshot: 2026-11-04, commit `b03cd0e` on `main`. Source code describes pages, features and rules. Catalog figures come from the reviewed database as recorded on 2026-11-01. The local database was not running when this file was written, so those figures were not rechecked.

## 1. What UniMatch is

UniMatch is an evidence-led university research and matching tool for international bachelor's and master's applicants.

It answers three questions for each programme, separately:

1. **Academic fit**: does the student meet the published academic and English requirements?
2. **Application eligibility**: is there a verified, still-open intake and application route? Do nationality or education-country rules apply?
3. **Financial feasibility**: can the student afford the verified annual cost, with or without a specific scholarship?

Core principles:

- **Deterministic matching.** The student's browser computes every result from published facts. There is no admission probability and no opaque match score.
- **Three-valued logic.** Every check is `PASS`, `FAIL` or `UNKNOWN`. Missing, unverified, stale or conflicting evidence gives `UNKNOWN`, never a silent `PASS`.
- **Evidence first.** Every published fact links to an exact quotation from an official page and its URL and retrieval date.
- **Human publication.** AI extraction only creates review candidates. An administrator approves or rejects each one before it reaches students.
- **Public browsing is passive.** Students never trigger crawls or model calls.
- **Privacy.** No document uploads. The profile works without an account and stays in the browser unless the student signs in.

## 2. Technology

| Area             | Technology                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Runtime          | Node.js 22.13+ (tested on 24), npm                                                                                |
| Web              | Next.js 16.4.3 App Router, React 19, TypeScript 5.9                                                               |
| Styling          | Tailwind 4, custom CSS in `app/globals.css`, Radix Slot button (`components/ui/button.tsx`), `lucide-react` icons |
| Data             | PostgreSQL 17 through Prisma 7.10 (`@prisma/adapter-pg`)                                                          |
| Queue and limits | Redis 7, BullMQ 5, ioredis                                                                                        |
| Crawling         | Crawlee 3, Cheerio, Playwright Chromium fallback, `pdf-parse`, `robots-parser`, `ipaddr.js`                       |
| AI               | OpenAI Chat Completions, default `gpt-5.4-mini`, strict JSON Schema, Zod validation                               |
| Auth             | bcryptjs, database-backed sessions, Redis attempt limits                                                          |
| Tests            | Vitest (unit and integration), Playwright (E2E)                                                                   |

Local services from `docker compose up -d`: PostgreSQL on loopback port **5434** (user and database `unimatch`), Redis on **6381**.

## 3. Operating modes

| Mode                                                           | When                                 | What students see                                                                              |
| -------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Offline demo (`DEMO_MODE=DEMO_FIXTURES`, or no `DATABASE_URL`) | Default after `cp .env.example .env` | 10 fictional programmes from `lib/demo.ts`. A banner on every page says all data is fictional. |
| Real catalog (`DEMO_MODE=false`)                               | PostgreSQL configured                | Only published, reviewed programmes from the database.                                         |

The fictional catalog never enters the database. It has 5 fictional institutions, one per destination, each with a BSc and an MSc in Computer Science:

- Northstar University (United States, Lakewood)
- Harbour Institute (Hong Kong, Harbour City)
- Danube Technical University (Hungary, Riverbend)
- Linden Institute of Technology (Germany, Lindenstadt)
- Meridian University (Singapore, Meridian)

The fixtures exercise missing scores, missing deadlines, nationality restrictions, conflicting requirements, tuition-only funding, competitive full coverage, guaranteed terms and master's prerequisites.

## 4. Student pages

All student pages share `components/shell.tsx`:

- **Header**: UniMatch logo and name. Links: Explore (`/results`), My profile (`/profile`), Priorities (`/priorities`), Account (`/account`). Button: "Find my match".
- **Mobile tab bar** (`TabBar`): Home, Explore, Priorities, Account.
- **Footer**: logo, the line "A clearer path to your next chapter." and a link to "Research administration" (`/admin`).
- **Demo banner**: shown in demo mode only.
- **Loading state** (`app/loading.tsx`): spinner with "Loading your next possibilities…".
- **Error page** (`app/error.tsx`): "We couldn't load this page." It suggests checking PostgreSQL and has a "Try again" button.

Layouts are checked at 390 px width.

### 4.1 Home: `/`

File: `app/page.tsx`.

- Hero: "Your next chapter. _Within reach._" with the buttons "Find my universities" (to `/profile`) and "Explore programs" (to `/results`).
- Privacy note: "No account needed. Your profile stays on your device."
- Panel "Three questions, answered separately.": Academic requirements (evidence-led), Application eligibility (deadline-aware), Financial feasibility (tuition + living).
- Destination pills: United States, Hong Kong, Hungary, Germany, Singapore. Each links to `/results`.
- Three feature cards: "Start with your story", "Find a meaningful fit", "Check the evidence".
- Closing band: "Meeting the published minimums is a starting point, not a prediction of admission." The page states that UniMatch never estimates admission chances.

### 4.2 Profile wizard: `/profile`

File: `components/profile-wizard.tsx`. The wizard has three steps with Back and Continue buttons. The last step's button is "Show my matches".

**Step 1: "Where do you want to go?" (Your direction)**

- Nationality or citizenship (required)
- Country of education (required)
- Intended degree: Bachelor's or Master's
- Field of study (required; default "Computer Science")
- Desired intake: years 2027 to 2029, each with Fall, Spring, Winter, Summer and Autumn (default `2027-Fall`)
- Preferred destinations: checkboxes for the five countries (all selected by default)

**Step 2: "What are you bringing with you?" (Your qualifications)**

All fields are optional. Missing values stay unknown. Grades are compared only when the grading scale matches.

- Current qualification. The field suggests exact qualification names, for example IB Diploma and A-level.
- Grading scale and academic grade average
- IELTS overall (max 9), TOEFL iBT (max 120), Duolingo English Test (max 160), PTE Academic (max 90)
- SAT (max 1600), ACT (max 36)
- Master's only: previous bachelor's field, bachelor's GPA, GRE (max 340), GMAT (max 805)
- Other credentials or language scores (free text)

**Step 3: "Make it financially possible." (Your budget)**

- Available annual budget (default 15,000)
- Budget currency: USD, EUR, HKD, HUF, SGD, GBP, UAH, INR
- Funding preference:
  - Full ride required (tuition and living costs)
  - Tuition scholarship required
  - Partial funding acceptable (default)
  - No scholarship required
- Notice: the profile is saved only in this browser; no passports, bank records or uploads are requested.

**Storage**

- Anonymous students: browser `localStorage` key `unimatch-profile-v1`.
- Signed-in students: also saved to `User.profile` and loaded from the account.
- "Delete my saved profile" clears local storage and the account copy.
- The profile is validated by `profileSchema` in `lib/domain.ts`.

### 4.3 Explore and results: `/results`

Files: `app/results/page.tsx`, `components/results.tsx`. The page renders on every request (`force-dynamic`). Matching runs in the browser.

**Profile bar**

- With a profile: a summary such as "Bachelor's · Business · 2027-Fall · US$15,000 budget", plus "Edit my profile".
- Without a profile: an invitation to create one. Cards then show "Profile needed".

**Filters** (side panel; collapsible on mobile, with an active-filter count)

- Search across programme title, university and field
- Destination (default: the student's preferred destinations)
- Degree level (preset from the profile)
- Funding options: "Scholarship available" or "Potential full coverage"
- Eligibility: "Published minimums met", "Needs verification" or "Requirements not met" (needs a profile)
- Active filters show as removable chips. "Reset filters" clears them.

**Sort**

- **Relevant fit** (default): confirmed failures last, then field match, then financial result (PASS, UNKNOWN, FAIL), then evidence completeness, then research recency.
- **University name**
- **Lowest cost**: annual cost before aid in the budget currency; unknown costs last.
- **Recently researched**

**Programme card**

- University, city and country; overall status tag
- Programme title; tags for degree level, teaching language and duration ("not verified" when missing); a "Fictional demo" tag in demo mode
- Metrics:
  - Academic fit
  - Annual cost before aid. This shows the full total when verified, for example "HK$290,272 (≈ US$36,996)". Otherwise it shows "Partial · tuition X only; total not verified", or "Information unavailable".
  - Financial assistance: count of funding options, "conditions apply"
  - Application deadline: next verified deadline for the student's intake, in the institution's time zone. Marked "(passed)" or "time zone not stated" when relevant.
- Footer: research date, "Add to priorities" (signed-in students) and "View details"

Empty state: "No programs found yet." with a "Clear filters" button.

**Status labels**

| State   | Label                  |
| ------- | ---------------------- |
| PASS    | Published minimums met |
| UNKNOWN | Needs verification     |
| FAIL    | Requirements not met   |

### 4.4 University and programme detail: `/universities/[id]?program=<id>`

Files: `app/universities/[id]/page.tsx`, `components/university-detail.tsx`.

- "Back to your shortlist" link, country and city, university name, and a line with programme, teaching language, duration and degree.
- **Programme chips**: switch between the university's published programmes.
- **Summary**: overall status, "Add to priorities", "Official program page" link. Metrics: annual cost before aid, funding option count, next deadline, last researched.
- **Section tabs**:
  - **Requirements**: each rule with its minimum and scale, or the accepted values, or "Manual verification needed". Each shows a verification tag and an expandable **Evidence** block: quotation, retrieval date and "Official source ↗". Required and conditional documents follow. Then "Retrieved research sources", marked as not reviewed claims.
  - **Deadlines**: each intake (year, term, route) with its deadline in the intake's time zone, or "Deadline not verified", plus evidence.
  - **Funding**: each scholarship with tuition coverage %, annual stipend, renewal conditions and eligibility rules. Tagged "Guaranteed" or "Competitive · not awarded".
  - **Costs**: tuition, living expenses, other mandatory costs and total per year. A missing part shows "Information unavailable" and the total stays blank.
- **Side panels**:
  - **Your financial scenarios**: one scenario without aid, then one per scholarship. Each shows the remaining annual cost, its converted value, an affordability tag, the award type and the reason. Scholarships are never stacked. A note gives the FX source and date.
  - **Why this result?**: every academic and application check with its state and reason. Ends with "Meeting minimum requirements does not predict admission."
  - **What you need to apply** (`components/readiness-panel.tsx`): next verified deadline. Tests tagged "Met", "Below minimum" or "Add a result". A document checklist; signed-in students set each document to "I have it", "In progress" or "Not yet".

### 4.5 Priorities: `/priorities`

Files: `app/priorities/page.tsx`, `components/priorities-list.tsx`. Requires sign-in; otherwise redirects to `/account?next=/priorities`.

- An ordered list of saved programmes, ranked 1 to n.
- Each row has buttons to move up, move down and remove.
- **Documents to prepare across your priorities**: required documents still missing or in progress, with how many priority programmes ask for each.
- Per programme: country, university, title, next verified deadline, test checks, document checklist and "Open program".
- Without a profile: a prompt to complete it. Empty state: "No priorities yet."

### 4.6 Account: `/account`

Files: `app/account/page.tsx`, `components/auth-form.tsx`, `components/account-panel.tsx`.

- **Signed out**: sign-up ("Create your account") or sign-in ("Welcome back") form. Email and password, minimum 10 characters. Supports a `next` redirect.
- **Signed in**:
  - Buttons: "Edit profile and test results", "My priorities", "Sign out"
  - **Documents**: status for 11 document kinds (Not yet, In progress, I have it). English and SAT/ACT results count automatically from the profile.
  - **Delete account**: needs the password. It permanently removes the account, profile, documents and priorities.
- There is no email sending, so there is no email verification or password reset.

**Document kinds** (`lib/documents.ts`): passport or national ID; academic transcripts; school-leaving or degree certificate; English test result; SAT, ACT or AP score report; recommendation letters; motivation or personal statement; CV or résumé; portfolio or work samples; proof of funds; passport-size photo; certified translations or apostille; application fee payment.

A programme's free-text document names map to these kinds by pattern. A programme with no verified list shows four typical documents marked unverified: passport, transcripts, diploma and English test.

## 5. Administrator workspace: `/admin`

File: `components/admin.tsx`.

**Access**

- One administrator, configured by `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (bcrypt, base64-wrapped).
- Generate the hash with `npm run admin:password`.
- Session: a random 256-bit token in an HttpOnly, SameSite=Strict cookie. The database stores its SHA-256. Sessions expire after 8 hours.
- Origin checks on writes. Redis limits login attempts.

Heading: "Good decisions start with good data." There are four tabs.

### 5.1 Overview

- OpenAI status. When the key is set: "OpenAI research is configured…". When it is missing: "Offline AI mode", with research disabled.
- A demo-mode warning when students currently see fixtures.
- Counters: approved universities, candidates awaiting review, source versions.
- Reported tokens today against tokens consumed or reserved.
- "Needs attention": review queue size, with a link to Review.

### 5.2 Universities

- **Approved institutions**: each university with its count of approved sources and a source list.
- **University management**: add or update a university (name, country, city, official website).

### 5.3 Research

- **Launch controlled research**: choose an approved university, enter a research target (for example "Computer Science BSc admission requirements and tuition"), then "Research / refresh".
- **Approve an official research source**: URL, source purpose, options "Approve official subdomains" and "Allow browser fallback for sparse HTML". Only publicly accessible official sources whose terms permit research may be approved.
- **Research activity**: each job with its stage, pages processed, model attempts, tokens, and an expandable progress log with errors. The page refreshes every 4 seconds.

### 5.4 Review

- **Evidence awaiting review**: each candidate with its source title, the retrieved source text ("Read retrieved source") and the extracted facts as editable JSON.
- Checkbox: "I verified the complete set of mandatory program requirements and all conditional pathways." This sets `requirementsComplete`.
- **Approve** publishes in a serializable transaction and writes a `ReviewRecord`. **Reject candidate** discards it.

## 6. API routes

| Route                                   | Methods                                                | Purpose                                                                                  |
| --------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `/api/auth/[action]`                    | POST `signup`, `login`, `logout`; GET `me`             | Student accounts. Redis limits: 10 attempts per email per 15 min, 300 per hour globally. |
| `/api/account/profile`                  | GET, PUT, DELETE                                       | Saved profile                                                                            |
| `/api/account/documents[/kind]`         | GET, PUT (`HAVE`, `IN_PROGRESS`, `NONE`)               | Document tracking                                                                        |
| `/api/account/priorities[/programId]`   | GET, POST (add, or `{ move: "up" \| "down" }`), DELETE | Priority list                                                                            |
| `/api/account/me`                       | DELETE (password required)                             | Delete account                                                                           |
| `/api/admin/login`, `/api/admin/logout` | POST                                                   | Administrator session                                                                    |
| `/api/admin/dashboard`                  | GET                                                    | Admin data                                                                               |
| `/api/admin/universities`               | POST                                                   | Add or update a university                                                               |
| `/api/admin/sources`                    | POST                                                   | Approve a source                                                                         |
| `/api/admin/research`                   | POST                                                   | Queue a research job                                                                     |
| `/api/admin/review`                     | POST                                                   | Approve or reject a candidate                                                            |
| `/api/admin/explain`                    | POST `{ programId, profile }`                          | Admin-only, metered OpenAI explanation of a deterministic result                         |

## 7. Matching engine

File: `lib/matching.ts`, function `matchProgram`. All logic is deterministic and runs offline.

### 7.1 Combining states

- Any `FAIL` makes the result `FAIL`.
- Otherwise, any `UNKNOWN` (or no checks at all) makes it `UNKNOWN`.
- Otherwise the result is `PASS`.

The overall status combines the academic, application and financial results.

Evidence counts as trusted only when its status is `ADMIN_VERIFIED` or `SOURCE_BACKED`. Other statuses (`NEEDS_REVIEW`, `CONFLICTING`, `OUTDATED`, `UNKNOWN`) make a check `UNKNOWN`.

### 7.2 Academic checks

- **Degree level**: PASS when it matches, otherwise FAIL.
- **Field of study**: matched by words. Stemming covers pairs such as computer/computing. Aliases: AI, CS, IT, ML, econ, BBA. Noise words such as "bachelor" and "programme" are ignored. Every meaningful word the student entered must appear in the programme's field or title. No match gives UNKNOWN, not FAIL.
- **English proof**: IELTS, TOEFL, Duolingo and PTE rules, and OTHER rules labelled "English proof (any one accepted test)", form one any-of group:
  - One passing test gives PASS.
  - FAIL needs a result below the minimum on every accepted test.
  - Otherwise the result is UNKNOWN, with a list of tests that could qualify.
- **Numeric scores** (SAT, ACT, GRE, GMAT, GRADE): value against the published minimum. A missing score or threshold gives UNKNOWN. GRADE also needs an identical grading scale; no GPA conversion is done.
- **Qualification and bachelor's field**: exact match against the published accepted values. An unlisted qualification gives UNKNOWN ("equivalency not verified"), never FAIL.
- **Applicability**: a rule limited to certain nationalities or qualifications is skipped when it does not apply. When the qualification is unknown, it gives UNKNOWN.
- **Evidence year**: evidence for a different academic year than the intake gives UNKNOWN.
- **OTHER rules**: always UNKNOWN, because they need human review.
- **Requirements completeness**: UNKNOWN unless an administrator confirmed the full mandatory set.
- **Master's prerequisite**: UNKNOWN when no qualification or bachelor's field rule is published.

### 7.3 Application checks

- Nationality and education-country rules.
- **Intake and application route**: intakes for the student's year and term. Autumn counts as Fall. Multiple routes are alternatives:
  - A route needs trusted status, a deadline and a time zone; otherwise it is UNKNOWN.
  - A passed deadline gives FAIL. An application window not yet open gives UNKNOWN. Otherwise the route is PASS.
  - One PASS route gives PASS. FAIL needs every route to fail.

### 7.4 Financial checks

- **Cost**: exactly one trusted annual cost row for the intake year. Several differing estimates give UNKNOWN; the cheapest is never picked.
- **Total**: tuition, living and other mandatory costs, all three required. A missing part gives UNKNOWN.
- **Currency conversion**: `lib/fx.ts` and `lib/fx-rates.json`. Rates are National Bank of Ukraine reference rates dated **2026-11-02** for UAH, USD, EUR, HKD, HUF, SGD, GBP and INR. A converted amount within **5 %** of the budget gives UNKNOWN. A currency with no rate gives UNKNOWN. Matching never fetches rates; update them with `npm run fx:update`.
- **Scenarios**:
  - "Without scholarship"
  - One scenario per scholarship. Remaining cost = total − tuition × coverage − stipend. A stipend in another currency is converted.
  - Eligibility needs mandatory rules that pass, a trusted status and a future deadline.
  - A scenario counts as **GUARANTEED** only with category GUARANTEED, status ADMIN_VERIFIED and eligibility PASS. Otherwise it is **COMPETITIVE**: "Eligibility to apply is not an award."
  - A full ride means the remaining cost is 0.
- **Funding preference**:
  - FULL_RIDE: only full-ride scenarios count.
  - TUITION: only full-tuition (or unknown-coverage) scholarships count.
  - PARTIAL and NONE: all scenarios count.
- **Financial PASS** needs an affordable, eligible scenario that is not competitive.

### 7.5 Readiness

File: `lib/readiness.ts`. It combines the match, the test checks, the document checklist and the earliest verified, still-open deadline for the student's intake. It also counts tests and documents still to complete.

## 8. Research pipeline (administrator only)

Files: `lib/research/`, `lib/ai/openai.ts`, `worker/`.

### 8.1 Flow

1. The administrator queues a job. It goes to the BullMQ queue `unimatch-research` with global concurrency 1. A database index prevents two active jobs for one institution.
2. The worker (`npm run worker`) crawls approved sources and stores immutable `SourceDocument` versions.
3. Unchanged source versions that were already extracted skip the model.
4. Universities with **registry** sources use per-programme extraction:
   - Institution pages (international admissions, fees, scholarships) are read once.
   - Each registered programme gets one model call over up to 7 ranked pages.
   - Universities without a registry use per-page extraction behind a fact gate.
5. Model output is strict JSON. Zod, quotation checks and domain checks validate it.
6. Deterministic pruning removes unsupported claims, each recorded as a `Pruned:` issue:
   - Quotations not verbatim on the cited page
   - Amounts missing from their quotation
   - Unlabelled or mixed costs
   - "Up to" figures
   - Local JUPAS-only rules
   - Transfer or postgraduate pages
   - Impossible intake dates
7. Near-miss quotations are repaired by `snapExcerpt` and `salvageExcerpt`. A cut is refused when the dropped words held a hedge or negation.
8. Claims from the programme's candidates of the last 14 days are merged in, if they are still quoted on the current pages.
9. The result is an `ExtractionCandidate` for review. Nothing publishes without approval.

### 8.2 Crawler safeguards

- Only approved hostnames, HTTP(S), ordinary ports and no credentials in URLs.
- Every resolved IP must be globally routable. The socket connects to the validated IP, with the original Host header and TLS SNI. This blocks SSRF to private or metadata addresses.
- `robots.txt` is checked first and failures are treated conservatively. Requests to the same host wait at least 2 s. Download cap is 2 MB per resource.
- Optional Chromium fallback for sparse HTML. Every browser request goes through the same guarded transport. Service workers and WebSockets are disabled.
- No proxies, evasion, logins or CAPTCHA solving.
- `lib/research/intermediate-ca.ts` adds public intermediate certificates for servers with incomplete TLS chains. Certificate verification stays on.

### 8.3 Model provider

- OpenAI Chat Completions with `gpt-5.4-mini` (override with `OPENAI_MODEL`), `reasoning_effort: low` and `store: false`. There is no fallback to a larger model.
- Prompt version: `program-v20`.
- Budgets:
  - 6 calls per job by default
  - 1 concurrent call
  - 4,000 output tokens per call
  - 100,000 tokens per UTC day
  - Request timeout, retries with backoff, and a rate-limit cooldown
- Usage is recorded in `ModelUsage` before response validation. Failed requests keep their token reservations.

### 8.4 Freshness

- Evidence expires when the catalog is read:
  - Deadlines: 7 days
  - Scholarships and admissions: 30 days
  - Metadata: 90 days
- `npm run schedule` queues re-research of stale sources and marks old facts outdated.

### 8.5 Verification statuses

| Status           | Meaning                                              |
| ---------------- | ---------------------------------------------------- |
| `SOURCE_BACKED`  | Citation passed machine checks. Trusted by matching. |
| `ADMIN_VERIFIED` | A human explicitly approved it. Trusted by matching. |
| `NEEDS_REVIEW`   | Not yet reviewed.                                    |
| `CONFLICTING`    | Sources disagree.                                    |
| `OUTDATED`       | Past its freshness window.                           |
| `UNKNOWN`        | No usable evidence.                                  |

## 9. Data model

File: `prisma/schema.prisma`. There are 5 migrations, from `202610270001_initial` to `202610300002_priority_program_id`.

| Group    | Models                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog  | `University`, `ApprovedSource`, `DegreeProgram`, `ApplicationIntake`, `AdmissionRequirement`, `Scholarship`, `ScholarshipEligibility`, `CostEstimate`, `RequiredDocument` |
| Evidence | `SourceDocument` (immutable versions), `SourceEvidence` (quotation, URL, academic year, status)                                                                           |
| Research | `ResearchJob`, `ResearchLog`, `ExtractionCandidate`, `ReviewRecord`, `ModelUsage`                                                                                         |
| Students | `User`, `UserSession`, `UserDocument` (`HAVE` or `IN_PROGRESS`), `Priority` (rank; no foreign key, so demo programmes work)                                               |
| Admin    | `AdminSession`                                                                                                                                                            |

Enums: `VerificationStatus`, `DegreeLevel` (BACHELOR, MASTER), `DocumentStatus`.

## 10. Current catalog

Recorded 2026-11-01. Not rechecked in this snapshot.

### 10.1 Seeded institutions

`prisma/seed.ts` creates 10 real institutions, two per destination. The seed never overwrites reviewed facts.

| Destination   | Institutions                                             |
| ------------- | -------------------------------------------------------- |
| United States | MIT, Stanford                                            |
| Hong Kong     | HKU, HKUST (plus CUHK, PolyU, HKBU through the registry) |
| Hungary       | ELTE, University of Debrecen                             |
| Germany       | TUM, Saarland University                                 |
| Singapore     | NUS, NTU                                                 |

### 10.2 Published programmes: 250 Hong Kong, plus Debrecen

| University             | Published                                                |
| ---------------------- | -------------------------------------------------------- |
| CUHK                   | 75                                                       |
| HKU                    | 61                                                       |
| PolyU                  | 47                                                       |
| HKUST                  | 44                                                       |
| HKBU                   | 23                                                       |
| University of Debrecen | Computer Science (dated excerpt snapshot, SOURCE_BACKED) |

- The registry (`prisma/registry.ts`, `prisma/registry-programs.json`) lists **248** Hong Kong first-year bachelor's programmes.
- Cleanup: 6 junk programmes deleted; 38 stale candidates rejected; 11 CUHK senior-year-only programmes unpublished.
- Other seeded institutions have approved sources but few or no published programmes. The catalog is deliberately sparse until research is reviewed.

### 10.3 Flagship programmes (browser-reviewed 2026-11-01)

`scripts/curate-flagship.ts` (writes only with `APPLY=1`).

- `requirementsComplete` set:
  - PolyU Business Administration
  - PolyU Computing and AI
  - HKUST BEng/BSc Computer Science
  - HKUST Economics and Finance
- Their encoded route is IB. Other qualifications give "equivalency not verified".
- Tuition added for those programmes and for HKU BEng CS, HKU BBA, CUHK CSE and CUHK IBBA.
- 11 Hong Kong programmes approved by the project owner on 2026-10-31 are ADMIN_VERIFIED. Bulk-reviewed rows (`scripts/review-hk.ts`) are SOURCE_BACKED.

### 10.4 Dates and time zones

- Hong Kong deadlines use `Asia/Hong_Kong`. Approval pins a date-only deadline to 23:59:59 +08:00.
- 452 stored intakes were migrated. 59 HKU deadlines were 8 hours late before the fix.
- The UI shows dates in the intake's own time zone.

### 10.5 Verified student flow

Profile: IB, IELTS 7, field "Business". Result for PolyU Business Administration:

- Academic: PASS
- Application: PASS
- Financial: UNKNOWN, because other fees have no amount

## 11. Owner decisions

Dated 2026-11-01:

- Hong Kong deadlines use `Asia/Hong_Kong`.
- Incomplete total costs are acceptable to show as partial ("tuition only").
- Subject requirements stay UNKNOWN.
- Currencies may be converted at dated reference rates.

## 12. Scripts and commands

| Command                                               | Purpose                                           |
| ----------------------------------------------------- | ------------------------------------------------- |
| `npm run dev` / `npm run dev:all`                     | Web only, or web plus worker                      |
| `npm run worker`                                      | BullMQ research worker                            |
| `npm run build` / `npm start`                         | Production build and server                       |
| `npm run db:generate` / `db:migrate` / `db:seed`      | Prisma client, migrations, idempotent seed        |
| `npm run schedule`                                    | Queue stale-source refresh (needs the OpenAI key) |
| `npm run admin:password`                              | Generate the admin password hash                  |
| `npm run fx:update`                                   | Refresh `lib/fx-rates.json` from the NBU (manual) |
| `npm test`                                            | Offline unit and transport tests                  |
| `npm run typecheck`, `npm run lint`, `npm run format` | Static checks                                     |
| `npm run test:integration`                            | PostgreSQL, Redis, fixtures, Chromium             |
| `npm run test:e2e`                                    | Playwright on port 3001                           |
| `LIVE_CRAWL_TEST=1 npm run test:crawl`                | Live official-page crawl, no model calls          |
| `LIVE_OPENAI_TEST=1 npm run test:live` / `test:model` | Paid live extraction checks                       |
| `npm run test:cost`                                   | Cost benchmark (paid)                             |

Reviewer scripts:

- `scripts/review-hk.ts`: bulk review with `APPLY`, `OWNER_APPROVED` and `REPLACE` flags
- `scripts/curate-flagship.ts`: flagship rewrite
- `scripts/capture-curated-snapshot.ts`: capture the curated evidence snapshot

## 13. Tests

- Unit tests (`tests/*.test.ts`): matching, readiness, relevance and pruning, curation, research, OpenAI provider, transport, freshness. Result on 2026-11-01: **135/135 passed**; typecheck and lint clean.
- Integration tests (`tests/integration/`): pipeline, programme pipeline, browser rendering.
- E2E tests (`tests/e2e/`): `app.spec.ts` (student and admin flows), `account.spec.ts`.
- **Not run at `b03cd0e`**: `npm run test:integration`, `npm run test:e2e`, `npm run build`.

## 14. Configuration

Variable names are in `.env.example`. Never copy values into docs.

| Variable                                                                              | Default and purpose               |
| ------------------------------------------------------------------------------------- | --------------------------------- |
| `DATABASE_URL`, `REDIS_URL`                                                           | Services                          |
| `DEMO_MODE`                                                                           | `DEMO_FIXTURES` or `false`        |
| `NEXT_PUBLIC_APP_URL`                                                                 | Expected origin for origin checks |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`                                                  | Administrator                     |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`                                   | Model provider                    |
| `MAX_CRAWL_PAGES` / `MAX_CRAWL_DEPTH`                                                 | 12 / 3                            |
| `MAX_CONCURRENT_CRAWLS` / `CRAWL_DELAY_MS`                                            | 2 / 2000 (minimum)                |
| `MAX_CONTENT_BYTES`                                                                   | 2,000,000                         |
| `MAX_AI_CALLS_PER_JOB`, `MAX_AI_CONCURRENCY`, `MAX_AI_OUTPUT_TOKENS`, `AI_TIMEOUT_MS` | 6, 1, 4000, timeout               |
| `DAILY_AI_TOKEN_LIMIT`                                                                | 100,000                           |
| `FRESHNESS_DEADLINE_DAYS` / `_SCHOLARSHIP_DAYS` / `_METADATA_DAYS`                    | 7 / 30 / 90                       |

## 15. Known issues and gaps

- HKU per-qualification requirements sit behind a JavaScript selector that rendered nothing, so HKU requirements are unverified.
- The CUHK IB route needs IB Chinese grade 4. This is stated only in a PDF that is not stored.
- HKBU requirements (in accordions) and deadlines (in an image) are unverified.
- CUHK, HKUST and PolyU tuition is missing outside the flagship set.
- Required documents are copied from extraction without scoping. For example, HKUST asks everyone for "Standard X results".
- PolyU cost items add up to HK$330,272, but its stated total is HK$290,272.
- PTE and IELTS sub-score minimums exist only in labels. The profile stores overall scores only.
- Word-based field matching is broad: "Business" matches "Biotechnology and Business".
- Anonymous visitors get 401 console errors from `/api/account/*`.
- README still says "No exchange rates are assumed". That is outdated since the dated FX table was added.
- No OCR for scanned PDFs, no admission probability, no automated qualification recognition, and no public deployment or security audit.

## 16. Next actions

1. Run `npm run test:integration`, `npm run test:e2e` and `npm run build`. Fix failures. Then push `main` (2 commits ahead of origin).
2. Add non-local tuition to all programmes with a reviewer script:
   - CUHK: HK$230,000
   - HKUST: HK$260,000
   - PolyU: HK$240,000
   - HKU: HK$280,000 for STEM, HK$250,000 for non-STEM
3. Scope required documents by qualification. Drop unscoped country-specific documents.
4. Store the CUHK IB guide PDF as an approved source. Then mark the CUHK flagships complete.
5. Encode the A-level route for the four complete programmes.
