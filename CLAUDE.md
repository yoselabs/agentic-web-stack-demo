# Agentic Web Stack

Monorepo: TanStack Start (frontend) + Hono (API server) + tRPC + Prisma + PostgreSQL.

## Structure

- `apps/web/` — TanStack Start (Vite SSR) on port 3000
- `apps/server/` — Hono API server on port 3001
- `packages/api/` — tRPC router + context (shared types)
- `packages/auth/` — Better-Auth config (Phase 2)
- `packages/db/` — Prisma schema + client
- `packages/env/` — @t3-oss/env-core validated env vars
- `packages/ui/` — shadcn/ui components (Phase 2+)

## Commands

- `pnpm dev` — start both web and server
- `pnpm typecheck` — `tsc -b` across all packages
- `pnpm lint` — Biome check
- `pnpm db:generate` — regenerate Prisma client
- `pnpm db:push` — push schema to database

## Critical Rules

- **Never use `verbatimModuleSyntax` in apps/web** — causes server bundle leaks in TanStack Start
- **Always use `import type` for AppRouter** — value imports bundle the server into the client
- **One `initTRPC.create()` call** — in `packages/api/src/trpc.ts` only, never create multiple instances
- **QueryClient must be per-request on server** — see `getQueryClient()` in `apps/web/src/router.tsx`
- **TanStack Start is NOT Next.js** — no `getServerSideProps`, no `"use server"` directives, use `createServerFn`

## Package Naming

All workspace packages use `@aws/*` prefix (e.g., `@aws/api`, `@aws/db`).

## Library Skills (@tanstack/intent)

Libraries in this project ship AI agent skills — SKILL.md files with setup guides,
code patterns, and **common mistakes** that prevent AI-generated bugs.

**Before modifying any library integration**, discover and read the relevant skill:

```
npx @tanstack/intent list
```

Find the skill matching your task, then **read its SKILL.md** — especially the
"Common Mistakes" section. Do this after adding new dependencies too.

<!-- intent-skills:start -->
<!-- Dynamic discovery via `npx @tanstack/intent list` — no static mappings needed -->
<!-- intent-skills:end -->
