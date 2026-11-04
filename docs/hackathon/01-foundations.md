# Part 1: Foundations and public shell

Plan sections: W0, W1, W3 and section 4 (configuration). Days D1–D2. Priority P0.

Goal: a green baseline, then a public build that shows only bachelor's programmes in Hong Kong and South Korea. In this build the student's data stays in the browser, and the app runs with no Redis and no admin or account routes.

## 1. W0: Baseline

### 1.1 Checks at `b03cd0e`

Run before any change, so later failures can be told apart from existing ones:

1. `docker compose up -d` (PostgreSQL on 5434, Redis on 6381).
2. `npm run build`
3. `npm run test:integration` (needs migrations, the seed and Chromium)
4. `npm run test:e2e` (starts its own server on port 3001 with `DEMO_MODE=DEMO_FIXTURES`)

Record the exact pass or fail counts in `docs/HACKATHON_LOG.md`. Fix any failure that is in the code. Log any failure caused by the environment, with its cause.

### 1.2 Push

`main` is 2 commits ahead of `origin`. Pushing is outward-facing, so ask the owner before pushing.

### 1.3 Coverage report: `scripts/coverage-report.ts`

- Read-only Prisma query over published programmes.
- Output: a Markdown table per university and per intake (academic year and term). Columns:
  - `programmes`
  - `verified deadline`: trusted status, deadline and time zone present
  - `trusted evidence year`: the requirement evidence year equals the intake year
  - `requirementsComplete`
  - `complete cost`: one trusted annual row with tuition, living and other all set
- A second table counts programmes that are UNKNOWN **only** because of the evidence year, for the default intake. "Only" means matching would turn PASS if the year check were ignored. This answers W2b.
- npm script: `coverage`. Output saved to `docs/coverage-baseline.md`.

**Accept:**

- build, integration and E2E pass, or each failure is logged with its fix
- the coverage report is committed

## 2. Section 4: New configuration

All three variables go in `lib/config.ts`, with names added to `.env.example`. No values are secret.

| Variable            | Parsing                  | Default                                 |
| ------------------- | ------------------------ | --------------------------------------- |
| `ENABLED_COUNTRIES` | comma-separated, trimmed | `Hong Kong,South Korea`                 |
| `PUBLIC_MODE`       | `"true"` turns it on     | off, so local admin keeps working       |
| `CATALOG_SOURCE`    | `snapshot` or `db`       | `db` (snapshot mode is built in Part 5) |

Also in `.env.example`:

- `DAILY_AI_TOKEN_LIMIT=500000`
- A comment that `FRESHNESS_DEADLINE_DAYS=30` is the value for the demo deployment

## 3. W1: Scope cut

### 3.1 Destinations

- `lib/domain.ts`: `countries` becomes `["Hong Kong", "South Korea"]`. The old list is kept as `legacyCountries` for the seed and tests that still reference it.
- `profileSchema.preferredCountries` becomes optional, and defaults to every enabled country. The wizard no longer shows the destination picker. The step 1 error no longer mentions destinations.
- Storage key `unimatch-profile-v2`:
  - On first load, a valid v1 profile is migrated. Its countries are mapped to the new set; if none remain, it gets both.
  - Unparseable v1 data is ignored.
  - The v1 key is removed after migration.
  - All storage access is wrapped in try/catch.

### 3.2 Bachelor's only

- The wizard hides "Intended degree" and always saves `BACHELOR`.
- The results filter "Degree level" is hidden.
- `degreeLevel` stays in the schema and in the engine, together with the master's code paths.

### 3.3 Catalog filter

`lib/catalog.ts` `getPrograms()` filters by `enabledCountries()` for both the database and the demo fixtures. Filter on `university.country` in the Prisma `where` clause, so other countries are never loaded.

### 3.4 Results filters

- "Destination" becomes a **Hong Kong / South Korea** toggle. Default: both.
- Its options come from `countries`. Profile `preferredCountries` no longer narrows results.

### 3.5 Copy

Remove every mention of the United States, Hungary, Germany and Singapore from:

- the home hero and its destination pills (now Hong Kong and South Korea)
- the feature text, footer and metadata (`app/layout.tsx`)

New positioning line: "Find out where you can really get in and afford to study in Asia, with every answer traced to an official source."

### 3.6 Demo mode

- With `DEMO_MODE=false`, the demo banner and fixtures never render (already true; add a test).
- `lib/demo.ts` fixtures move to Hong Kong and South Korea fictional institutions, because tests still use them.
- `demoMode()` stays as it is for local development. The deployment sets `DEMO_MODE=false`.

### 3.7 Currency and budget

- Add `KRW` to the budget currency list. Conversion returns `null` until Part 3 adds the KRW rate, so KRW budgets show UNKNOWN for converted costs. This is the honest result.
- The default budget becomes blank:
  - The wizard shows an empty field and requires a value on step 3.
  - `defaultProfile.budget` stays numeric for the schema, but the wizard checks for an empty input.

**Accept:**

- no US, Hungary, Germany or Singapore text in any public page
- a stored v1 profile does not crash the app and is migrated
- unit and E2E tests are updated

## 4. W3: Local-first student data and public mode

### 4.1 Local stores (`components/local-store.ts`)

| Key                     | Contents                                |
| ----------------------- | --------------------------------------- |
| `unimatch-profile-v2`   | profile                                 |
| `unimatch-shortlist-v1` | ordered array of programme IDs          |
| `unimatch-docs-v1`      | `Record<kind, "HAVE" \| "IN_PROGRESS">` |

- Every read and write is in try/catch. A failure returns an empty value and never throws.
- Hooks: `useShortlist()` (ids, toggle, move, remove) and `useTrackedDocuments()` (tracked, mark). They update state and storage together.
- Profile: `loadProfile()` and `saveProfile()` become local-only. There are no `/api/account/*` calls from public components.

### 4.2 `/shortlist` replaces `/priorities`

- New client page `app/shortlist/page.tsx`. It reads the shortlist and the profile from storage, loads the catalog through the server component, and computes readiness on the client.
- Same content as before: an ordered list with move up, move down and remove; tests; documents; documents to prepare across the shortlist; "Open program".
- `/priorities` redirects permanently to `/shortlist` (`next.config` `redirects`).
- The button reads "Add to shortlist" or "Remove from shortlist" and needs no sign-in.
- Documents in the readiness panel are always editable and stored locally.

### 4.3 Public mode

When `PUBLIC_MODE=true`:

- `/admin`, `/account`, `/api/admin/*`, `/api/account/*` and `/api/auth/*` return 404. Use one `notFound()` or 404 guard per route file, with `isPublicMode()` from `lib/config.ts`.
- The footer has no "Research administration" link. The nav and tab bar have no Account entry; Shortlist replaces Priorities.
- Public pages import nothing that loads Redis or BullMQ. Check with `grep` that no file in `app/` outside `api/admin`, `api/auth`, `api/account`, `admin` and `account` imports `lib/queue` or `lib/account`.

When `PUBLIC_MODE` is off, the account code and pages stay working for local use. The Priorities code is kept but no longer linked.

### 4.4 Console errors

A fresh browser on `/`, `/profile`, `/results`, a detail page and `/shortlist` logs zero console errors. Check this with a Playwright assertion that listens to `console` and `pageerror`.

**Accept:**

- zero console errors in a fresh browser
- `PUBLIC_MODE=true npm run build && npm start` serves every public page with Redis stopped

## 5. Tests

**Unit:**

- profile v1 to v2 migration
- `enabledCountries()` parsing
- catalog country filter (demo fixtures)
- local store resilience: a throwing `localStorage` returns empty values

**E2E (`tests/e2e/app.spec.ts`):**

- The wizard has no destination or degree inputs.
- Results show the Hong Kong / South Korea toggle.
- Shortlist add, reorder and remove work without an account.
- Zero console errors on public pages.
- Run with `PUBLIC_MODE=true`.

**Retire or isolate:**

- The admin and account E2E specs move to a project that runs with `PUBLIC_MODE` off, so both modes stay covered.
- `playwright.config.ts` gets two `webServer` entries (ports 3001 public, 3002 private) and two projects.

## 6. Order of work

1. W0 checks and log.
2. Config helpers.
3. Domain and catalog filter.
4. Local store and shortlist.
5. Wizard and results.
6. Copy.
7. Public mode guards.
8. Tests.
9. Coverage report (needs the database).
10. Typecheck, lint, test, E2E, build.
11. Commit.

## 7. Out of scope for Part 1

- Engine rules (Part 2)
- Korea data and the KRW rate (Part 3)
- Snapshot catalog and `/api/health` (Part 5)
- Personas, drawer and the other features (Part 4)
