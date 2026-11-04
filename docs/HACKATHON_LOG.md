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
