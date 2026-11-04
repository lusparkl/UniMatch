# Part 5: Deployment, data freeze and demo

Plan sections: 9, 10, 11, 12. Phase 5A runs on D2, right after Parts 1–2, so a skeleton is live early. Phase 5B runs on D6–D7.

Deploying, pushing and hosting accounts are outward-facing. Each deploy needs the owner's confirmation, and the owner sets the host's environment variables.

## Phase 5A: Snapshot catalog and first deployment (D2)

### 1. Catalog snapshot

- `scripts/catalog-export.ts` with npm script `catalog:export`:
  - It reads the published catalog through the same mapping as `getPrograms(true)`, but **before** read-time freshness is applied. It stores raw statuses and `lastCheckedAt`, so freshness can still expire at read time.
  - It writes `data/catalog-snapshot.json` with: `{ exportedAt, commit, programmes: [...] }`. Each programme has its evidence, intakes, costs, scholarships, documents and retrieval dates.
  - It sorts keys and IDs so diffs stay small.
- `lib/catalog.ts`:
  - When `CATALOG_SOURCE=snapshot`, it reads the JSON and applies `effectiveStatus` with the stored check dates.
  - It never imports or connects to Prisma in that mode. Use a dynamic `import()` of the database module only in database mode.
- `tests/snapshot-parity.test.ts`: for the four personas, database and snapshot modes return identical `matchProgram` results. Run it in integration (it needs the database). The unit suite checks snapshot loading and freshness.
- Size check: if the snapshot exceeds the host's limits (a few MB is fine), fall back to hosted PostgreSQL with the same export as a backup.

### 2. `/api/health`

Returns JSON: `{ catalogSource, programmes, institutions, lastVerified, commit }`. It needs no database in snapshot mode.

### 3. Smoke test: `npm run smoke -- <url>`

`scripts/smoke.ts` uses Playwright.

- Pages: `/`, `/results`, one detail page per persona's expected programme, `/shortlist` and `/compare`.
- It asserts:
  - HTTP 200
  - no console or page errors
  - each persona's result statuses match the expectations in `lib/personas.ts`
- It exits non-zero on any failure.

### 4. Deployment

- Host: Vercel or similar. The owner creates the account and sets:
  - `DEMO_MODE=false`
  - `PUBLIC_MODE=true`
  - `CATALOG_SOURCE=snapshot`
  - `ENABLED_COUNTRIES=Hong Kong,South Korea`
  - `FRESHNESS_DEADLINE_DAYS=30`
  - `NEXT_PUBLIC_APP_URL=<deployed URL>`
- No `DATABASE_URL`, `REDIS_URL` or `OPENAI_API_KEY` on the host.
- Deploy the skeleton on D2, redeploy at each milestone, and run the smoke test after each deploy.

## Phase 5B: Freeze and demo (D6–D7)

### 5. Red-team spot check (plan 3.3, mandatory)

1. Sample 15 programmes at random with a seeded RNG, and log the seed: 8 Hong Kong and 7 Korea. At least 3 must be auto-approved and show PASS for some persona.
2. For each, open the official page with Playwright and compare every approved rule, tuition figure and deadline.
3. Record in `docs/VERIFICATION_LOG.md`: programme, field, matches yes or no, action taken.
4. If more than 2 of the 15 have a wrong value:
   - stop
   - tighten the 3.1 and 3.2 rules in `lib/research/auto-review.ts`
   - re-run the reviewer
   - sample again
5. Any programme found wrong gets `requirementsComplete=false`, and its wrong rows go to `NEEDS_REVIEW`.

### 6. Data freeze (D6, 2026-11-09; the owner gives the final yes)

1. Refresh deadlines with targeted jobs (paid; confirm first).
2. `APPLY=1 scripts/auto-review.ts` once more.
3. Red-team check.
4. `npm run catalog:export`. Commit the snapshot and tag `demo-freeze`.
5. Deploy and run the smoke test against the live URL.
6. After the freeze, only fixes to proven errors are allowed, each logged.

### 7. Demo script: `docs/DEMO_SCRIPT.md` (D7)

Expected values are taken from the frozen snapshot, never guessed.

1. **Problem (30 s).**
2. **Persona B (90 s):** Hong Kong lower-bound FAIL with its arithmetic, then Korea PASS through a guaranteed scholarship, then the finance panel line by line.
3. **Persona D (45 s):** UNKNOWN reasons turning into actions.
4. **What would change this (45 s),** plus the drawer re-ranking.
5. **Evidence (45 s):** quotation, URL, retrieval date, badge.
6. **Compare, shortlist, print (30 s).**
7. **Technical story (60 s).**

Add prepared answers for:

- How is the data checked? Cite the `VERIFICATION_LOG.md` numbers.
- Why no match score?
- What happens when data goes stale?
- How would this scale to more countries?

### 8. Backups

- The local snapshot-mode build: `CATALOG_SOURCE=snapshot PUBLIC_MODE=true npm run build && npm start`.
- A recorded video of the flow (by the owner).
- Screenshots in `docs/screens/`.
- The deployed and local URLs, both written in the demo script.

### 9. Documentation

- Update `docs/PRODUCT_OVERVIEW.md`: catalog figures, decisions, known issues.
- Fix the README exchange-rate line.
- Update `docs/AI_HANDOFF.md` through `save-context`, only when the owner asks.

### 10. Definition of done (plan section 12)

- [ ] `typecheck`, `lint`, `test`, `test:integration`, `test:e2e` and `build` all pass.
- [ ] Public site: zero console errors, no Redis, no admin or account routes.
- [ ] Only Hong Kong and South Korea content in the public UI.
- [ ] Lower-bound rule implemented and tested.
- [ ] At least 20 Hong Kong programmes with a complete cost; at least 25 Korean programmes published.
- [ ] Persona stories enforced by tests.
- [ ] Badges, drawer, what-if, arithmetic, actions, compare, timeline and print all work at 390 px.
- [ ] Red-team log committed, with at most 2 wrong values in 15.
- [ ] Snapshot committed and deployed; smoke test green against the live URL.
- [ ] Demo script, backups and video ready.
- [ ] `PRODUCT_OVERVIEW.md` and README updated.
