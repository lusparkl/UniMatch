# Owner confirmation: guaranteed scholarships

Plan section 3.7. Matching uses a GUARANTEED scholarship scenario only when the scholarship is `ADMIN_VERIFIED`, and Claude Code never sets that status. The scholarships below are stored as `SOURCE_BACKED` with `fundingCategory: GUARANTEED`, because their official pages say every admitted international student receives them. Until you confirm them, they count as unverified, so they never produce a PASS.

Listed 2026-11-10. The quotations are copied verbatim from the pages, as fetched through the guarded crawler that day.

## 1. KAIST Scholarship (international undergraduate admission)

- Source: https://admission.kaist.ac.kr/intl-undergraduate/support/scholarships/kaist
- Stored as: full tuition (coverage 1.0); renewal "Students must maintain GPA over 2.7 out of 4.3 at KAIST after their freshman year"; no annual stipend stored, because the page states only KRW 350,000 per month.
- Quote: "Eligibility Applicants of International Student Admission Subsidies Full tuition fee: tuition exemption for 8 semesters Living expenses: 350,000 KRW per month Medical Health insurance Requirement We offer KAIST Scholarships to admitted students … Upon being selected for admission, you will automatically be entitled to the KAIST Scholarship."
- Question: Does every applicant admitted through KAIST international admission receive full tuition for the first year, so the scholarship can count as guaranteed?
- Copies: 6 (one per registered KAIST programme).

## 2. POSTECH Tuition Scholarship (tuition waiver)

- Source: https://adm-iu.postech.ac.kr/user/comm/menu/e2afb97fa1b8f43c574be0dabef78f87/content/index.do
- Stored as: full tuition (coverage 1.0); renewal from the second semester requires GPA 3.0 out of 4.3.
- Quote: "Tuition Scholarship (All Tracks) Tuition Waiver (up to 8 semesters) All admitted Korean and international undergraduate students receive a full tuition waiver for the first semester upon enrollment. Continued tuition waiver support for up to eight regular semesters from the second semester onward is subject to meeting POSTECH's eligibility criteria, including a minimum GPA of 3.0 out of 4.3 in the previous semester."
- Question: Only the first semester is unconditional, and the second semester of year one depends on GPA. Should this count as a guaranteed full-tuition scholarship for the first year? If not, leave it unconfirmed.
- Copies: 6.

## 3. POSTECH Living Allowance (International Admissions)

- Source: same page as item 2.
- Stored as: no stipend amount, because the page states KRW 500,000 per month and gives no annual figure. Confirming it marks the award as verified but adds no money to the matching arithmetic.
- Quote: "Living Allowance (International Admissions) KRW 500,000 per month (including vacation periods) All international undergraduate students (no GPA requirements)"
- Question: Confirm that every international undergraduate receives this allowance.
- Copies: 6.

## 4. GIST tuition waiver (international students)

- Source: https://www.gist.ac.kr/iuadm/img/sub02/2027_Fall_Undergraduate_Admission_Guideline_Final.pdf (2027 Fall guideline). The copy was opened in a browser at your request, because GIST's robots.txt disallows automated crawlers.
- Stored as: full tuition (coverage 1.0), supported for 8 semesters. The stored cost row gives tuition as ₩4,050,000 per semester.
- Quote: "Tuition fee Fully waived (₩4,050,000/semester) • Granted to all international students without any conditions"
- Question: Confirm that every admitted international student receives the full tuition waiver.
- Copies: 6.

## Not listed (competitive)

- UNIST tuition scholarship: the Fall 2027 guideline also admits students "through the non-scholarship track", so the scholarship is not guaranteed.
- Korea University Anam Global Scholarship: every freshman is considered automatically, but awards depend on the admission evaluation.
- UIC Admissions Scholarship: recipients are "selected from admitted applicants according to their academic credentials".

## How to confirm

Back up the database first. Then run the following, with your name, after answering the questions above:

```
OWNER_CONFIRMED=1 OWNER_NAME="<your name>" npx tsx --env-file=.env scripts/owner-confirm.ts
```

To confirm only some items, add `ONLY="<exact name>|<exact name>"`. Without `OWNER_CONFIRMED=1`, the script only lists the rows.

Status: **answered 2026-11-11 by lusparkl**, applied with `ONLY=` for the confirmed items (database backed up first).

- Item 1, KAIST Scholarship: confirmed. 6 rows are `ADMIN_VERIFIED`.
- Item 2, POSTECH Tuition Scholarship: not confirmed, because the second semester of year one depends on GPA. 6 rows stay `SOURCE_BACKED`.
- Item 3, POSTECH Living Allowance: confirmed. 6 rows are `ADMIN_VERIFIED`; no amount enters the matching arithmetic.
- Item 4, GIST tuition waiver: confirmed. 6 rows are `ADMIN_VERIFIED`.

Each promotion has an `OWNER_CONFIRMED_GUARANTEED` review record naming lusparkl.

## 5. HKUST accommodation cost correction

Listed 2026-11-11. No database change has been made.

- Source: https://join.hkust.edu.hk/fees-and-scholarships
- Current state: 42 published programmes each have an `ADMIN_VERIFIED` accommodation-only cost with `livingCostAmount: 21000`, `period: SEMESTER`, and currency `HKD`.
- Quote: "Accommodation Fee (Non-local Students)^ ** University-provided Accommodation (excl. meals, air-conditioning and laundry charges) ~HKD 21,000 – HKD 51,000 (~USD 2,700 – USD 6,500) per residential year"
- Problem: the stored value selects the lower endpoint of a range and changes `per residential year` to `SEMESTER`. The source supports neither transformation.
- Proposed correction: delete only those 42 exact accommodation-only rows. Do not replace the range with its lower endpoint, upper endpoint, or midpoint because the current cost schema cannot store a range.
- Preserve: every HKUST tuition row and every `HKD 65,000` annual personal-expenses row, including the two combined `ADMIN_VERIFIED` annual cost rows.
- Question: Do you confirm deletion of those 42 incorrect accommodation rows while preserving all other HKUST costs?

Status: **pending owner confirmation**.
