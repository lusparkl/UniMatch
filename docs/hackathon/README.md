# Hackathon plan: five parts

The source plan is `HACKATHON_PLAN.md` (written 2026-11-04). The hackathon ends around 2026-11-11, and the demo runs live on a deployed site. These five documents split that plan into pieces that can be built and checked one at a time.

| Part | File                                                   | Plan sections                                                                           | Days                 | Priority |
| ---- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------- | -------- |
| 1    | [01-foundations.md](01-foundations.md)                 | W0 baseline, W1 scope cut, W3 local-first and public mode, section 4 config             | D1–D2                | P0       |
| 2    | [02-engine-and-review.md](02-engine-and-review.md)     | W2a–W2f engine, section 3 auto-review policy, script and trust tiers                    | D2                   | P0/P1    |
| 3    | [03-data.md](03-data.md)                               | W4 Hong Kong data, W5 South Korea research, W6 hygiene                                  | D3–D5                | P0/P1    |
| 4    | [04-features-and-polish.md](04-features-and-polish.md) | Section 7 features, section 8 visual polish                                             | D4–D5                | P0/P1    |
| 5    | [05-deploy-freeze-demo.md](05-deploy-freeze-demo.md)   | Section 9 deployment, section 10 freeze, section 11 demo, section 12 definition of done | D2 (skeleton), D6–D7 | P0       |

## Rules that apply to every part

- Run `npm run typecheck`, `npm run lint` and `npm test` after each part. Commit when all three pass. Never leave `main` red.
- Log each step in `docs/HACKATHON_LOG.md`: timestamp, what changed, what was measured, what was decided.
- Invariants from plan section 2 always hold:
  - No wrong PASS.
  - Three-valued logic.
  - No admission probability or match score.
  - Every fact has evidence.
  - The profile never leaves the browser.
  - No crawls or model calls from public pages.
  - Crawler safeguards stay on.
  - Claude Code sets `SOURCE_BACKED` only, never `ADMIN_VERIFIED`.
- Paid model calls and live crawls happen only in Part 3, and only after the owner confirms the key and budget for that run.
- Pushing to a remote and deploying are outward-facing actions. Each one needs the owner's confirmation at the time.
- Cutting order when time runs short: P2 first, then P1. P0 items always ship.
