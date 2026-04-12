# TODO

Decisions and tasks deferred during initial build (Phases 1-6).

Items marked **[template]** should be added to the template itself.
Items marked **[recipe]** should be documented as patterns — added per-project when needed.

## Architecture — Scaling to Medium Projects

- [ ] **[template]** Feature-Sliced Design (FSD) — organize frontend by `features/`, `entities/`, `shared/` layers instead of flat route files. Critical for 10+ page apps.
- [ ] **[recipe]** API versioning — namespace tRPC routers by version when breaking changes needed
- [ ] **[recipe]** Module boundaries — enforce import rules between packages (no circular deps)
- [ ] **[template]** Database seeding — `prisma/seed.ts` for dev/demo data, `make db-seed` command

## Auth

- [ ] **[recipe]** Google OAuth provider — add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` to env schema and Better-Auth config
- [ ] **[recipe]** GitHub OAuth provider — same pattern, requires `user:email` scope
- [ ] **[template]** Email verification flow — Better-Auth `requireEmailVerification: true` + `sendVerificationEmail`
- [ ] **[template]** Password reset flow — Better-Auth `sendResetPassword`
- [ ] **[recipe]** 2FA / TOTP — Better-Auth `twoFactor()` plugin
- [ ] **[recipe]** Passkeys / WebAuthn — Better-Auth built-in support
- [ ] **[recipe]** Multi-tenancy — Better-Auth `organization()` plugin for row-level org isolation
- [ ] **[recipe]** RBAC — Better-Auth `createAccessControl()` + `newRole()` for custom roles

## Payments

- [ ] **[recipe]** Stripe integration — `stripe` npm package, webhook handler on Hono
- [ ] **[recipe]** Subscription model — link Stripe customer to Better-Auth user, sync via webhooks
- [ ] **[recipe]** Billing portal — Stripe Customer Portal for self-service plan management
- [ ] **[recipe]** Usage metering — track usage per org/user for metered billing

## Email

- [ ] **[recipe]** Transactional email — Resend (recommended), SendGrid, or AWS SES
- [ ] **[recipe]** Email templates — React Email for type-safe templates
- [ ] **[recipe]** Email preview — dev mode preview route for email templates

## File Storage

- [ ] **[template]** File upload endpoint — Hono multipart/form-data with `bodyLimit` middleware
- [ ] **[template]** S3-compatible storage — `@aws-sdk/client-s3` with presigned URLs
- [ ] **[recipe]** Image processing — Sharp for thumbnails/resizing on upload
- [ ] **[recipe]** Local dev storage — MinIO in docker-compose for S3-compatible local dev

## Real-time

- [ ] **[recipe]** tRPC subscriptions — SSE via `httpSubscriptionLink` (preferred over WebSocket)
- [ ] **[recipe]** WebSocket support — Hono `upgradeWebSocket()` + `@hono/node-ws`
- [ ] **[recipe]** Live cache invalidation — server events → React Query invalidation

## Background Jobs

- [ ] **[recipe]** Job queue — BullMQ + Redis, or Trigger.dev
- [ ] **[recipe]** Scheduled tasks — cron-style recurring jobs
- [ ] **[recipe]** Email queue — async email sending via job queue

## Monitoring & Observability

- [ ] **[template]** Structured logging — `pino` for JSON logs in production, pretty in dev
- [ ] **[template]** Health check endpoint — `/health` returning DB connectivity + uptime
- [ ] **[recipe]** Error tracking — Sentry (has Hono SDK)
- [ ] **[recipe]** Analytics — PostHog or Plausible
- [ ] **[recipe]** OpenTelemetry — distributed tracing across Hono + tRPC
- [ ] **[recipe]** Audit logging — who changed what, stored in DB

## Infrastructure

- [ ] **[template]** CI pipeline (GitHub Actions) — `make check` + `make test` on PRs
- [ ] **[recipe]** Docker app containers — Dockerfiles for apps/web and apps/server
- [ ] **[recipe]** Production docker-compose — full stack with app containers + Postgres + Traefik
- [ ] **[recipe]** Multi-environment config — dev/staging/prod env var management
- [ ] **[recipe]** CDN — static asset caching with cache-busting

## Security

- [x] ~~Security audit history~~ — `agent-harness security-audit-history` clean, no leaked secrets
- [ ] **[template]** Rate limiting — Hono built-in rate limiter on auth + API endpoints
- [ ] **[template]** Security headers — CSP, X-Frame-Options, HSTS via Hono middleware
- [ ] **[recipe]** CSRF protection — for custom forms beyond Better-Auth
- [ ] **[recipe]** Input sanitization — sanitize HTML in user-generated content (DOMPurify)
- [ ] **[recipe]** Row-level security — Prisma middleware to enforce user/org data isolation

## Quality & Testing

- [ ] **[template]** Integration tests — Vitest + vitest-environment-prisma-postgres for tRPC route testing
- [ ] **[template]** Add `packageManager` field for strict pnpm version
- [ ] **[recipe]** Visual regression testing — Playwright screenshot comparison
- [ ] **[recipe]** Load testing — k6 or Artillery for API performance baseline
- [ ] **[recipe]** Contract testing — ensure tRPC client/server stay in sync across deploys

## UI / UX

- [ ] **[template]** shadcn/ui base components — Button, Input, Card, Label, Dialog, Select, Dropdown
- [ ] **[template]** Error pages — 404, 500 with TanStack Router `notFoundComponent` / `errorComponent`
- [ ] **[template]** Loading states — `pendingComponent` on routes with data loading
- [ ] **[template]** Toast notifications — Sonner for success/error feedback on mutations
- [ ] **[template]** Responsive nav — mobile hamburger menu for _authenticated layout
- [ ] **[recipe]** Dark mode — Tailwind dark mode with theme toggle + localStorage persistence
- [ ] **[recipe]** Form library — TanStack Form or react-hook-form for complex forms with validation

## AI Features

- [ ] **[recipe]** `@tanstack/ai` — provider-agnostic AI SDK with streaming, tool calling, agent loops
- [ ] **[recipe]** AI chat component — streaming responses with tool use approval
- [ ] **[recipe]** Server functions for AI — `createServerFn` for secure API key usage

## Internationalization

- [ ] **[recipe]** i18n — `next-intl` or `react-i18next` for multi-language support
- [ ] **[recipe]** RTL support — Tailwind RTL plugin for right-to-left languages
- [ ] **[recipe]** Date/number formatting — `Intl` API with locale-aware formatting

## Search

- [ ] **[recipe]** Full-text search — PostgreSQL `tsvector` + `tsquery` via Prisma raw queries
- [ ] **[recipe]** Search UI — debounced input with React Query + search params
- [ ] **[recipe]** External search — Meilisearch or Typesense for advanced search needs

## Developer Experience

- [ ] **[template]** Storybook — component development in isolation for packages/ui
- [ ] **[template]** Route tree generation fix — replace start/kill vite hack in `make setup`
- [ ] **[recipe]** API documentation — auto-generated from tRPC router types (trpc-openapi)
- [ ] **[recipe]** `@tanstack/intent` — deeper investigation of AI skills system
- [ ] **[recipe]** Database GUI — Prisma Studio alternative: Drizzle Studio, pgAdmin in docker-compose
- [ ] **[recipe]** Git hooks — commitlint for conventional commits
