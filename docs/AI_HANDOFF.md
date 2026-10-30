# AI Handoff

Updated: 2026-10-28T17:39:43Z
Base commit: fb3769b5303bd1007311140a0869a961cdd43e02
Branch: main
Working tree: modified `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `components/results.tsx`, `components/shell.tsx`, `components/ui/button.tsx`; untracked `app/icon.svg`, `components/nav.tsx`, `public/`. Uncommitted content is a snapshot; the commit hash alone does not prove it is current.

## Purpose and architecture
UniMatch: evidence-led university research and matching MVP (Next.js 16 App Router, React 19, Tailwind 4, Prisma/PostgreSQL, Redis/BullMQ). Stable architecture lives in `AGENTS.md` and `docs/ARCHITECTURE.md`. UI: `app/`, `components/`. Styling is one global stylesheet, `app/globals.css`, with class-name based rules.

## Implemented state
Redesign from the Claude Design project `46f914be-8997-43ab-bc2f-1cfeb7f56ab3` ("UniMatch App.dc.html", UniMatch design system) is applied:
- `app/globals.css` rewritten: crimson/neutral tokens, DM Serif Display + DM Sans, design spacing and breakpoints (1024/860/700). Existing class names kept, so results, profile, detail and admin are restyled by CSS only.
- `app/page.tsx`: new home (hero card, destination pills, numbered features, crimson CTA band).
- `components/shell.tsx` + new `components/nav.tsx`: sticky header with active-link state, footer, bottom tab bar on phones, demo banner above the header.
- `components/ui/button.tsx`: variants default, outline, dark, light, ghost (link style). "View details" in `components/results.tsx` uses `dark`.
- `public/fonts/` (DMSans.woff2 variable, DMSerifDisplay.ttf), `public/assets/logo-mark.svg`, `app/icon.svg`.
Not built from the design: tabbed detail view, funding-scenario layout, mobile filter toggle on results. Admin page is CSS-restyled only.

## Decisions and environment
- Node 22.13+, npm. Commands: `npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`; e2e/integration need PostgreSQL, Redis, seed, Chromium (port 3001).
- Unlayered global element rules must not override Tailwind utilities: links use `a:where(:not(.btn))` and `button` has no background/border reset.
- Logo is a reconstruction. `DesignSync get_file` caps at 256 KiB, so `assets/logo-mark.png` and `assets/logo.png` arrived truncated (372/620 rows). The SVG redraw guesses the pillar bottoms and pin tip.
- Design files `_ds_bundle.js` and `support.js` were not reused (design-tool runtime).

## Validation
2026-10-28: `npm run typecheck` clean; `npm run lint` clean; `npm test` 72/72 pass; prettier check clean on `app` and `components`.
Visual check in a browser against the dev server (port 3111): home, results, profile, detail at 1280px; home at 390px. Not checked: admin page, results/profile/detail on phone, e2e/integration suites.

## Known issues and uncertainties
- Logo is a stand-in until the original file is provided.
- Dev server on port 3111 may still be running (stopping it was blocked); `pkill -f "next dev"`.
- Styles tuned after the last screenshots (button reset removal, `.rule-line`, `.notice` margin, wizard h2 spacing) were only seen on profile/detail at an earlier state; re-check visually.
- Assumption: e2e selectors in `tests/e2e/app.spec.ts` still match (copy and headings unchanged), unverified.

## Next actions
1. Add the real logo at `public/assets/logo-mark.png` and switch `components/shell.tsx` and the icon.
2. Visually check admin, and results/profile/detail at 390px; fix spacing in `app/globals.css`.
3. Run `npm run test:e2e` with services up (acceptance: all pass).
4. Optionally build the design's tabbed detail view and mobile filter toggle (`components/university-detail.tsx`, `components/results.tsx`).
5. Review and commit.
