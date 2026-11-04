# Part 4: Product features and visual polish

Plan sections: 7.1–7.10 and 8. Days D4–D5. No new features after D5.

Everything runs on the client from published data. The profile never leaves the browser. The only things that go in a URL are programme IDs.

## 1. 7.1 Sample students (P0)

- `lib/personas.ts` holds four complete `Profile` objects. They are typical cases, not real people.

| Persona                        | Nationality | Qualification                      | English   | Budget    | Funding   | Demo purpose                                                                               |
| ------------------------------ | ----------- | ---------------------------------- | --------- | --------- | --------- | ------------------------------------------------------------------------------------------ |
| A "IB student, strong English" | India       | IB Diploma (grade on the IB scale) | IELTS 7.5 | US$30,000 | Partial   | Hong Kong flagship PASS paths                                                              |
| B "A-level, tight budget"      | Vietnam     | GCE A-Level                        | TOEFL 95  | US$12,000 | Partial   | Hong Kong financial FAIL from the lower bound; Korea PASS through a guaranteed scholarship |
| C "Needs a full ride"          | Nigeria     | IB Diploma                         | IELTS 7   | US$5,000  | Full ride | Scholarship shown as COMPETITIVE, not guaranteed                                           |
| D "Missing scores"             | Ukraine     | local qualification                | none      | US$15,000 | Partial   | UNKNOWN reasons and action prompts                                                         |

- A row of persona buttons on the home page and on the wizard. One click saves the profile locally and opens `/results`.
- `tests/personas.test.ts` runs `matchProgram` over the catalog source (the snapshot in Part 5; until then the database export or fixtures) and asserts the demo story for each persona. If the data does not support a story, change the persona (budget or scores), never the data.

## 2. 7.2 Live results drawer (P0)

- A side drawer on `/results` (a bottom sheet at 390 px) with fields: English scores, SAT/ACT, grade, budget, currency, funding preference, intake.
- Edits update the in-memory profile, save it to storage after a 250 ms debounce, and re-run `matchProgram` and the sort through `useMemo`.
- Measure the time to re-rank over the full catalog with `performance.now()` in development, and log it. Target: under 50 ms for 300 programmes.

## 3. 7.3 What would change this? (P0)

`lib/whatif.ts` exports `suggestions(program, profile): Suggestion[]`. For each non-PASS check, it tries one minimal change and re-runs `matchProgram`:

- English score raised to the minimum of the test the student has, or of each accepted test when they have none.
- SAT, ACT or grade raised to the published minimum.
- Budget raised to the smallest amount that makes a scenario PASS.
- Funding preference relaxed one step.
- Intake switched to another listed intake.

Rules:

- A suggestion is returned only if the re-run's state for that dimension improves (FAIL to UNKNOWN or PASS, or UNKNOWN to PASS).
- Text is hypothetical: "If your IELTS were 7.0 (now 6.5), the English check would pass." It is not advice.
- When the input is missing, return an action instead: "Add your IELTS score", linking to `/profile#ielts` or the drawer field.
- Tests cover each kind of change, and confirm that nothing is suggested without an improvement.

## 4. 7.4 Visible arithmetic (P0)

- A finance panel on the detail page (and a short version in compare and shortlist) builds its lines from `Scenario` fields:
  - tuition, living and other, each with its source link and retrieval date
  - total
  - coverage and stipend lines
  - remaining, converted at the rate from `lib/fx-rates.json`
  - budget, with its band (budget × 0.95 to × 1.05)
- Lower-bound FAIL line: `Tuition HK$X ÷ rate = US$Y > US$Z → FAIL before any aid`.
- The rate shown is derived from `fx-rates.json`: `rates[from] / rates[to]`. The FX source and date are shown.
- Add `lib/arithmetic.ts`, a pure function that returns the lines, with tests.

## 5. 7.5 UNKNOWN becomes an action (P0)

`Check` gets an optional `action: { label, href, external }`:

| Reason                               | Action                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| Missing score                        | "Add your {test} score", to the profile field                                  |
| Unverified requirement or OTHER rule | "Check the official page", to the evidence URL or `officialUrl`                |
| Other-year evidence                  | Part 2's reason text plus the official link                                    |
| Deadline not published               | the official link only, plus a "typical month" note only when the page says it |

Show the actions in "Why this result?", on the cards (first action only) and on the shortlist.

## 6. 7.6 Trust badges (P0)

- A badge component using `lib/trust.ts` tiers, with an icon, text and "Verified on {retrieval date}", on every card and evidence block.
- Filter "Fully checked only": `requirementsComplete` and a complete trusted annual cost.
- The home page shows "N programmes fully checked", computed from the catalog with the same predicate.

## 7. 7.7 Compare (P1)

- `/compare?ids=a,b,c` (2–3 IDs). Selection from the cards and the shortlist ("Compare", up to 3).
- Columns: overall and three-part status, cost arithmetic summary, scholarships, next deadline, requirements per qualification.
- The URL carries only IDs.

## 8. 7.8 Deadline timeline (P1)

- `/deadlines`: verified open deadlines for the student's intake (or all, without a profile), grouped by month in the intake time zone.
- Toggle "Show passed deadlines", off by default.

## 9. 7.9 Printable shortlist (P1)

- `@media print` CSS on `/shortlist`. It hides the nav and buttons, prints status, cost, deadlines, documents, verified-on dates and the disclaimer.
- "Copy link" copies `/shortlist?ids=...`. Opening it shows those programmes and offers "Save to my shortlist".

## 10. 7.10 Home page with live numbers (P1)

- The server component computes the programme count, institution count, fully-checked count and the latest retrieval date from the catalog.
- Keep the three-questions explanation and the line "Meeting the published minimums is a starting point, not a prediction of admission."

## 11. Section 8: Visual polish (P0 for the live demo)

Use the `frontend-design` skill for this pass.

- **Status colours:** one set of colour tokens for PASS, UNKNOWN and FAIL, used everywhere. Each state always shows an icon and text as well.
- **Loading:** skeleton cards on `/results` and the detail page (`loading.tsx` per route), with space reserved to avoid layout shift.
- **Consistency:** one type scale and spacing scale. Real empty and error states with actions.
- **390 px:** no horizontal scroll on any public page. Check the filters, cards, drawer, arithmetic tables and compare (which scrolls horizontally inside its own container only).
- **Accessibility:** visible focus, contrast AA, `alt` text, `lang="en"`.
- **First screen after the wizard:** within each relevance tier, complete-data programmes come first. Weak results are not hidden.
- **Cleanup:** no dead links or placeholders.

**Accept:**

- screenshots at 390 px and 1440 px in `docs/screens/`
- no horizontal scroll at 390 px (Playwright check)
- Lighthouse accessibility of at least 90 on `/results`, if measurable locally
