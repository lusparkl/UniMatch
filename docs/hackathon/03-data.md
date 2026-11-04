# Part 3: Data: Hong Kong completion, South Korea, hygiene

Plan sections: W4, W5, W6. Days D3–D5. Priority P0, except W6, which is P1.

This part spends real model tokens and crawls official websites. Before the first job, confirm with the owner that:

- `OPENAI_API_KEY` is set locally
- `DAILY_AI_TOKEN_LIMIT=500000` is accepted for this run

Never write the key into any file. Keep crawler safeguards unchanged: approved hosts, robots.txt, 2 s delay, SSRF checks, no logins, no CAPTCHA solving.

## 1. Token budget (measure first)

1. Query `ModelUsage` for the Hong Kong programme-mode jobs:
   - `avg_tokens_per_programme_call = sum(tokens) ÷ number of programme calls`
2. `programme_calls_per_day = 500,000 ÷ avg`.
3. Budget institution-level pages (fees, scholarships, admissions) separately: one read per institution.
4. Log the measured numbers. If the quota is short, reduce programmes per institution before reducing institutions. Never skip a scholarship page.
5. Set `MAX_AI_CALLS_PER_JOB` to the per-institution programme count plus retries, capped by the daily budget.

## 2. W4: Hong Kong data completion (P0)

### 2.1 Tuition: `scripts/add-tuition-hk.ts` (dry run by default, `APPLY=1` writes)

- For each of CUHK, HKUST, PolyU, HKU and HKBU, fetch the stored non-local tuition page through the guarded crawler (already approved registry pages).
- The earlier flat figures are hypotheses to confirm against those pages:
  - CUHK HK$230,000
  - HKUST HK$260,000
  - PolyU HK$240,000
  - HKU HK$280,000 STEM / HK$250,000 non-STEM
- Each figure needs a verbatim quotation containing the amount, on an HTTPS page from an approved host. The evidence is stored as `SourceEvidence` linked to that `SourceDocument`.
- Apply a figure to a programme only where the page says it applies (all programmes, a faculty, or STEM). HKU's STEM list must come from the page. A programme whose category is unclear gets no tuition.
- `SOURCE_BACKED` only. Never overwrite a row that is already `ADMIN_VERIFIED`.

### 2.2 Living costs

- Per university, from the official halls-of-residence or stated estimate page.
- The quotation must contain the amount. Label it as an estimate in the label and the review notes.
- "Other mandatory costs" are set only where the page lists them (caution fee, student union fee). Otherwise null, which keeps the total partial.

### 2.3 CUHK IB PDF

- Approve the official CUHK IB guide PDF as a source. Fetch it through the guarded transport; `pdf-parse` is local.
- Encode the IB Chinese grade 4 condition. A condition that cannot be represented becomes an OTHER rule, so UNKNOWN.
- Set `requirementsComplete` for CUHK flagships only when the 3.2 checklist holds.

### 2.4 HKU and HKBU

- Re-read with browser fallback enabled on those sources.
- Data behind a JavaScript selector that renders nothing, or deadlines shown only in an image, stays UNKNOWN. Log what was tried.

### 2.5 Review

Run `scripts/auto-review.ts` (Part 2) on every Hong Kong candidate: dry run first, then `APPLY=1`.

**Accept:** at least 20 Hong Kong programmes with a complete annual cost, and at least 10 `requirementsComplete`. Log the real numbers, even if short.

### 2.6 W2f decision: PolyU cost

Re-read the PolyU fee and other-fees pages.

- If the itemised HK$330,272 and the stated HK$290,272 both stand, mark both rows `CONFLICTING`.
- If one figure was misread, fix it with a quotation.

### 2.7 W2d data: A-level route

For each `requirementsComplete` programme, encode the A-level route from the official quotation. Use `appliesToQualifications` with `GCE A-Level` and `International A-Level`.

## 3. W5: South Korea research (P0)

### 3.1 Institutions

Candidates: KAIST, POSTECH, UNIST, GIST, DGIST, SNU, Yonsei (UIC), Korea University, Sungkyunkwan, Hanyang.

Selection rule: an English-taught bachelor's route exists for international applicants, and the official pages are crawlable (robots.txt allows, HTML not empty). Pick 6–8. Log each one skipped, with the reason.

### 3.2 Programmes

- 30–50 English-taught bachelor's programmes in total, 4–6 per institution.
- Priority subjects: computer science, electrical or general engineering, business.

### 3.3 Sources and registry

- Approve official sources with a script in the style of `prisma/seed.ts` sources, `purpose = registry` or `registry:<title>`.
- Add Korea entries to `prisma/registry.ts` and a JSON file (`prisma/registry-programs-kr.json` or the shared file). Institution pages (international admission, tuition, scholarships) are read once per institution.
- Seed the universities with `country: "South Korea"` and the correct city.

### 3.4 Intakes

- Typically March (Spring) and September (Fall). Encode only what the page states.
- Time zone `Asia/Seoul`. Extend `lib/research/timezone.ts` so date-only deadlines are pinned to 23:59:59 +09:00.
- Spring intakes give students a `2027-Spring` intake option. That already exists in the wizard.

### 3.5 Currency

- Add `KRW` through `npm run fx:update`. Check whether the NBU table includes KRW (it lists many currencies).
- If it does not, use another official dated reference source. Record it in `lib/fx-rates.json` and the UI footnote, and log it.

### 3.6 Scholarships

- From official pages: coverage %, stipend, renewal condition, eligibility (nationality, GPA, deadline).
- `fundingCategory: "GUARANTEED"` only when the page says every eligible applicant receives it. Everything selective is `COMPETITIVE`. GKS is expected to be `COMPETITIVE`.

### 3.7 Guaranteed scholarships need the owner

- The engine requires `ADMIN_VERIFIED` for a GUARANTEED scenario. Claude Code never sets it.
- List each candidate in `docs/OWNER_CONFIRM.md`: quotation, URL, a one-line question.
- Add `scripts/owner-confirm.ts`:
  - It promotes only the listed scholarship IDs to `ADMIN_VERIFIED`.
  - It records a `ReviewRecord` naming the owner.
  - It runs only when the owner passes `OWNER_CONFIRMED=1` explicitly.
- Schedule for D4. If it is not done, they stay COMPETITIVE. Log that the demo moment is lost.

### 3.8 Review

Run `scripts/auto-review.ts` on Korea candidates.

**Accept:**

- at least 6 Korean institutions and at least 25 programmes published
- at least 15 `requirementsComplete`
- at least 1 Korean programme with a complete cost
- at least 1 GUARANTEED scholarship (if official pages support one) and at least 1 COMPETITIVE scholarship
- If no guaranteed scholarship exists on official pages, log it and tell the owner at once.

## 4. W6: Hygiene (P1)

- Reject candidates that are not bachelor's, not first-year, not English-taught or not open to international applicants.
- Remove junk rows. Re-run the pruning checks (`dropUnquoted`, `pruneClaims`) across the Hong Kong and Korea published facts with a read-only report first, then `APPLY=1`.
- Run `npm run coverage` and save to `docs/coverage-after.md`.

## 5. Database safety

- Before each `APPLY=1` script, back up the database with `pg_dump -Fc` into the session scratchpad and log the path. The database holds reviewed data that git does not.
- Every write script is a dry run by default and idempotent.
