# Verification log: red-team spot check

Plan 3.3, `docs/hackathon/05-deploy-freeze-demo.md` §5.

## 2026-11-11: red-team run 1 (seed 20261111)

**Result: 0 wrong values among 141 facts in 15 programmes.** The threshold is at most 2 programmes with a wrong value, so the check passes. No programme loses `requirementsComplete`, and no row is moved to `NEEDS_REVIEW`.

### Method

- **Script:** `SEED=20261111 npx tsx --env-file=.env scripts/red-team.ts`. It is read-only: nothing is written to the database. It runs on the database catalog with `DEMO_MODE=false` and `FRESHNESS_DEADLINE_DAYS=30`, after the HKUST accommodation deletion.
- **Sample:** a seeded RNG (mulberry32) shuffles the Hong Kong and Korean programmes separately.
  - Hong Kong: the first 3 programmes that meet all three conditions below, then the next 5.
    - They have `requirementsComplete`.
    - They have a `claude-code-auto` review record.
    - They show PASS for some persona.
  - Korea: the first 7.
  - **About "show PASS":** no demo persona gets an overall PASS, because the stories rely on UNKNOWN and FAIL. "Show PASS" therefore means the academic or financial check passes for some persona. 13 programmes qualify.
- **Facts checked:** every trusted (`SOURCE_BACKED` or `ADMIN_VERIFIED`) rule, deadline and cost part. POSTECH tuition is `CONFLICTING`, so it is excluded.
- **Live pages:** every cited page was fetched again on 2026-11-11.
  - Approved hosts: through the guarded crawler (robots.txt, delay, SSRF checks).
  - Owner-requested browser copies (UIC, GIST, SKKU): opened in plain headless Chromium, 2 s apart, with no bot-check handling.
  - All 28 cited URLs were returned.
- **Automatic checks:**
  - The quotation is still verbatim on the live page: 133 of 141.
  - The stored number or date appears in the quotation: 61 of 141.
- **Manual review:** I read the other 80 facts against their quotations. They are every OTHER or QUALIFICATION rule without a numeric minimum, plus 3 values the automatic check did not find.

### Results

| Programme                                                    | Facts (rules / deadlines / costs) | Quote live | Value matches | Action |
| ------------------------------------------------------------ | --------------------------------- | ---------- | ------------- | ------ |
| HKUST · BBA in Marketing (auto-approved, PASS)               | 6 / 2 / 2                         | 10/10      | yes           | none   |
| HKUST · BBA in Information Systems (auto-approved, PASS)     | 6 / 2 / 2                         | 10/10      | yes           | none   |
| HKUST · BBA in Professional Accounting (auto-approved, PASS) | 6 / 2 / 2                         | 10/10      | yes           | none   |
| HKUST · BSc in Physics                                       | 8 / 2 / 2                         | 12/12      | yes           | none   |
| HKU · Bachelor of Chinese Medicine                           | 18 / 1 / 1                        | 16/20 (a)  | yes           | none   |
| PolyU · Surveying - BSc (Hons)                               | 9 / 1 / 1                         | 11/11      | yes           | none   |
| CUHK · Translation                                           | 8 / 2 / 4                         | 14/14      | yes (b)       | none   |
| HKU · BSc in Innovation and Technology                       | 18 / 1 / 2                        | 17/21 (a)  | yes           | none   |
| POSTECH · BS in Mechanical Engineering                       | 2 / 1 / 2                         | 5/5        | yes (c)       | none   |
| GIST · BS in Artificial Intelligence                         | 3 / 1 / 1                         | 5/5        | yes           | none   |
| GIST · BS in Materials Science and Engineering               | 3 / 1 / 1                         | 5/5        | yes           | none   |
| UNIST · BS in Computer Science and Engineering               | 3 / 1 / 0                         | 4/4        | yes           | none   |
| SKKU · Biomedical Engineering (English Track)                | 3 / 2 / 0                         | 5/5        | yes           | none   |
| Yonsei UIC · International Studies (IS)                      | 2 / 1 / 2                         | 5/5        | yes           | none   |
| UNIST · BS in Industrial Engineering                         | 3 / 1 / 0                         | 4/4        | yes           | none   |

**(a) HKU quotations missing from the HTML.** The 8 missing quotations are the IB and A-level standards. `curate-hku-hkbu.ts` adds them to the stored page from HKU's selector API, so the plain HTML never contains them. They were checked against the live API (`/api/international_qualification/admission_standard/Ukraine`; robots.txt allows it) and all 8 match:

- Chinese Medicine: IB 36; Grade 6 in Biology, Chemistry or Physics; A-level 2A*1A; Grade A in Biology, Chemistry or Physics.
- Innovation and Technology: IB 34 with its subject rule; A-level 1A*2A with its subject rule.

**(b) CUHK living cost.** Living HKD 62,000 is the sum of the quoted "On-Campus Accommodation: about HK$17,000" and "Living Expenses: about HK$45,000".

**(c) POSTECH costs.**

- Living KRW 7,235,000 is the quoted housing 1,400,000, phone 360,000 and food 5,475,000.
- NHI 951,840 appears in the quotation. The automatic check missed it because the three amounts in that table row run together.

### Observations (not wrong values)

1. **HKUST allow-list evidence:** the QUALIFICATION allow-list (IB Diploma, GCE A-Level, International A-Level) quotes only the IB line. The A-level entries are supported by the A-level route rule, which quotes the same page.
2. **HKU GCE English label:** the label omits option (c), "Grade C or above in English Language or English Literature at GCE AS Level". It is an OTHER rule (UNKNOWN in matching), so it cannot cause a wrong PASS.
3. **HKU truncated label:** the IB subject-requirement label for Innovation and Technology is cut at 300 characters. The quotation holds the full text.
4. **HKU duplicate TOEFL rules:** HKU programmes carry 3 overlapping TOEFL OTHER rules. This is cosmetic.
