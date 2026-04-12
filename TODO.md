# TODO

Decisions and tasks deferred during initial build (Phases 1-6).

## Auth

- [ ] Google OAuth provider — add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` to env schema and Better-Auth config
- [ ] Email verification flow — Better-Auth supports `requireEmailVerification: true` + `sendVerificationEmail`, not yet wired
- [ ] Password reset flow — Better-Auth supports `sendResetPassword`, not yet wired

## Infrastructure

- [ ] CI pipeline (GitHub Actions) — run `make check` + `make test` on PRs
- [ ] Docker app containers — Dockerfiles for apps/web and apps/server for production deployment
- [ ] Production docker-compose — full stack with app containers + Postgres + Traefik

## Security

- [ ] Run `agent-harness security-audit-history` — deep scan full git history for leaked secrets (slow, run once)
- [ ] Add rate limiting to auth endpoints — Hono has built-in rate limiter middleware

## Quality

- [ ] Add TypeScript `engines` enforcement via `packageManager` field in root package.json
- [ ] Consider adding `typescript` as devDependency in leaf packages (currently relies on workspace hoisting)

## Features (template enhancements)

- [ ] `packages/ui/` — add shadcn/ui components (Button, Input, Card, etc.)
- [ ] Add `@tanstack/ai` as optional add-on for AI-powered features
- [ ] Error pages — 404, 500 with proper TanStack Router `notFoundComponent` / `errorComponent`
- [ ] Loading states — `pendingComponent` on routes with data loading

## Developer Experience

- [ ] `make setup` route tree generation — current approach (start/kill vite) is hacky, watch for a proper CLI from TanStack
- [ ] Investigate `@tanstack/intent` deeper — their AI skills system could inform CLAUDE.md structure
