# Part 2: Matching engine and autonomous review

Plan sections: W2a–W2f, section 3 (autonomous verification policy). Day D2. Priority P0, except W2c, W2e and W2f, which are P1.

Goal: the engine can say FAIL from a partial cost, and gives clearer UNKNOWN reasons. A deterministic reviewer script can publish `SOURCE_BACKED` facts within strict rules. The UI can label three trust tiers.

## 1. W2a: Lower-bound cost rule (P0)

`lib/matching.ts`:

- When the total is unknown but a trusted annual tuition exists for the intake year:
  - `lowerBound(no aid) = tuition`
  - `lowerBound(scholarship) = max(0, tuition × (1 − coverage) − stipend)`
  - The stipend is converted to the cost currency. When coverage is unknown, there is no lower bound for that scholarship scenario.
- Convert the lower bound to the budget currency with `convert()`. If `converted > budget × 1.05`, that scenario's `affordable` is `FAIL`, with reason "Even tuition alone exceeds your budget". In the same currency, use `> budget` exactly, because no FX uncertainty applies.
- If every scenario allowed by the funding preference is FAIL, financial is `FAIL`. Otherwise financial stays `UNKNOWN` while the total is partial.
- A partial total never produces PASS. Assert this in the tests.
- Add fields to `Scenario`:
  - `lowerBound: number | null`
  - `lowerBoundConverted: number | null`
  - `partial: boolean`
    Part 4's arithmetic panel shows the numbers from these fields.

**Tests:**

- tuition far above the budget gives FAIL
- tuition at budget × 1.04 after conversion gives UNKNOWN (inside the band)
- tuition at budget × 1.06 gives FAIL
- same currency, tuition = budget + 1 gives FAIL
- a 50 % scholarship below the cutoff gives UNKNOWN
- unknown coverage gives UNKNOWN
- a partial total never gives PASS
- the funding preference FULL_RIDE with only a no-aid scenario gives FAIL when that scenario fails

## 2. W2b: Evidence-year reason (P0)

- The rule is unchanged: other-year evidence gives UNKNOWN.
- New reason text: `Published for the {evidenceYear} cycle; {intakeYear} not yet published.` `Check` carries `url` (the evidence URL) so Part 4 can link it.
- Use the Part 1 coverage report:
  - If more than half the programmes are UNKNOWN **only** because of the year, do not relax the rule.
  - Instead, the wizard's default intake becomes the cycle with the most verified data, and the UI says so ("Most published data is for the {year} cycle").
  - Log it, and add an owner flag in `docs/HACKATHON_LOG.md`.

## 3. W2c: Field-match tiers (P1)

`fieldTier(program, query)` returns `1 | 2 | 3 | 0`:

1. The normalised field or title equals the query.
2. The title starts with the query words, or the head noun (the last meaningful word of the title's main phrase) is the query.
3. All query words appear somewhere (the current rule).
4. No match.

- Tiers 1 and 2 give a field check PASS. Tier 3 gives UNKNOWN with the label "Related field".
- `compareMatches` sorts tiers 1–2 before tier 3, keeping the existing order rules.
- Stemming and aliases stay.
- Tests: "Business" against "Business Administration" is tier 2, against "Biotechnology and Business" tier 3, against "Business" tier 1. "CS" against "Computer Science" is tier 1.

## 4. W2d: A-level route (P0, needs data from Part 3)

- The engine already handles `appliesToQualifications`. Add an A-level route as rules with `appliesToQualifications: ["GCE A-Level", "International A-Level"]`, mirroring the IB route.
- Encode it in the curation script, from the official page quotation, for every programme with `requirementsComplete=true`.
- No grade conversion is guessed. If the page gives only a points formula that cannot be represented, it becomes an OTHER rule, which gives UNKNOWN.
- The code change (A-level names in the wizard suggestions, a test that the A-level route PASSes and FAILs like IB) is done here. The data is done in Part 3.

## 5. W2e: Document scoping (P1)

- `RequiredDocument` has no scope columns, so there is no schema change. Scope is applied at read time:
  - A document name naming a qualification or exam ("Standard X", "HKDSE", "Gaokao", "IB", "A-level", "SAT") applies only when the profile's qualification matches.
  - Country-specific items with unknown applicability are labelled "unverified" and do not count as missing.
- Add `scopeDocuments(list, profile)` in `lib/documents.ts`, with tests.

## 6. W2f: PolyU cost mismatch (P1, needs a page re-read in Part 3)

- Engine support: when two trusted annual cost rows for the same programme and year disagree, the costs are `CONFLICTING`. This already gives UNKNOWN through "multiple estimates". Add an explicit reason, "Official figures disagree: X vs Y", and keep both rows visible on the Costs tab.
- The PolyU data decision is made in Part 3, after re-reading the page.

## 7. Section 3: Autonomous review

### 7.1 Trust tiers (3.5)

`lib/trust.ts`:

```ts
tier(status) → 1 | 2 | 3
tierLabel = { 1: "Human-reviewed", 2: "Auto-verified from official source", 3: "Needs verification" }
```

Part 4 uses it for badges. The footer and About text say: "Review for this hackathon build was automated by machine checks and sampled by hand for accuracy."

### 7.2 `scripts/auto-review.ts` (3.4)

Modelled on `scripts/review-hk.ts`.

- `APPLY=1` writes; anything else is a dry run.
- An `OWNER_APPROVED` value in the environment makes it exit with an error.
- Rules from 3.1 are re-checked for every claim, not trusted from earlier pruning:
  1. The excerpt is verbatim on the cited stored `SourceDocument` text. `snapExcerpt` is allowed only when it keeps hedges and negations.
  2. Every number and date in the claim appears in its excerpt.
  3. The URL is HTTPS and its host is an approved source host.
  4. The evidence year equals the intake year, or the mismatch is recorded in the review notes.
  5. No `Pruned:` issue names the claim.
  6. No contradiction with an approved row for the same programme and intake. A contradiction gives `CONFLICTING`, which is never published as trusted.
- `requirementsComplete` is set only when every item in the 3.2 checklist holds:
  - degree level known
  - an English rule with a minimum, or an explicit statement that English proof is not required
  - a qualification route with a minimum, or an explicit statement that there is none
  - the page was read in full (not truncated at the byte cap, not a JS shell, not an image or PDF)
  - no CONFLICTING or OUTDATED rows
- Status is always `SOURCE_BACKED`. Existing `ADMIN_VERIFIED` rows are never downgraded or overwritten.
- It is idempotent: a candidate already reviewed is skipped. It writes a `ReviewRecord` with reviewer `claude-code-auto`.
- The dry run prints: candidates, approved, rejected (by reason), `requirementsComplete` set, left UNKNOWN.
- The pure rule functions live in `lib/research/auto-review.ts`, so they can be unit tested. The script is a thin database wrapper.

**Tests (`tests/auto-review.test.ts`):** one passing and one failing case per 3.1 rule and per 3.2 checklist item. Also: `ADMIN_VERIFIED` is preserved, and `OWNER_APPROVED` is refused.

## 8. Accept

- All new tests pass.
- The Part 4 personas show no regression. Persona tests are written in Part 4. Until then, the existing matching tests and a smoke run on the three profiles from the 2026-11-01 handoff.
- The lower-bound rule is covered by FAIL, UNKNOWN and band-edge tests.
- The auto-review dry run on the current database prints counts without writing.
