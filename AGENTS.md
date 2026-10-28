<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# UniMatch project instructions

## Architecture

University research and matching MVP for international bachelor's and master's applicants. Node.js 22.13+ and npm; Next.js 16.4.3 App Router, React 19, TypeScript, Tailwind 4, Prisma 7/PostgreSQL, Redis/BullMQ.

- `app/`, `components/`: student/admin interfaces and protected admin APIs.
- `lib/domain.ts`, `lib/matching.ts`: contracts and deterministic PASS/FAIL/UNKNOWN matching; `lib/catalog.ts` reads published data.
- `lib/research/`: guarded retrieval, extraction, evidence validation and review; `lib/ai/openai.ts` is the server-only model provider.
- `prisma/`: schema, migrations and seed; `worker/`: queued research processing.
- `tests/`: unit, integration and browser coverage. Consult `docs/ARCHITECTURE.md` for relevant details and `docs/VERIFICATION.md` for dated verification evidence.

## Development commands

Commands below come from `package.json`; listing them does not imply they have passed in the current session.

- Install/generate: `npm ci`, `npm run db:generate`.
- Develop: `npm run dev`; web plus worker: `npm run dev:all`.
- Offline checks: `npm test`, `npm run typecheck`, `npm run lint`.
- Build: `npm run build`; production server: `npm start`.
- Service-backed checks: `npm run test:integration`, `npm run test:e2e`. Follow README prerequisites for PostgreSQL, Redis, migrations, seed and Chromium; E2E uses port 3001.
- Database setup: `docker compose up -d`, `npm run db:migrate`, `npm run db:seed`. Check the target environment before database operations.

Use README for environment setup. Preserve an existing `.env`; never copy credentials into documentation. Live crawl/model smoke checks are opt-in: obtain authorization before external crawling or paid model calls.

## Working conventions

Use narrow searches and relevant reads; reuse existing dependencies and patterns. Keep changes small and responses concise without omitting meaningful errors, warnings or test results. Run relevant checks and report failures or checks not run. Never sacrifice correctness to save tokens. Preserve unrelated work; obtain approval for destructive or external actions not already authorized.

Keep student matching deterministic, unknown evidence UNKNOWN, and fictional demo data separate from real records. Extraction produces candidates; publication requires explicit administrator review. Preserve crawler safeguards, authentication and model budget controls. Public browsing must not start crawls or model requests.

## Project context

Read `docs/AI_HANDOFF.md` once at fresh-session start when relevant and present; check it against current Git/source state. Keep stable instructions here and changing implementation state in the handoff. Do not reload instructions already in context, scan the whole repository, or reconstruct old chats without need.

Use the globally installed skills explicitly: Claude `/save-context` and `/resume-project`; Codex `$save-context` and `$resume-project`. Suggest saving after major milestones; do not automatically rewrite the handoff. If context becomes unwieldy, suggest a fresh session with resume-project rather than forcing a reset. `docs/AI_HANDOFF.template.md` is a format reference, not current project state.
