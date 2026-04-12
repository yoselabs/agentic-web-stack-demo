# TODO

Decisions and tasks deferred during initial build (Phases 1-6).
These are the things a real product will need — add them when your project requires them.

## Auth

- [ ] Google OAuth provider — add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` to env schema and Better-Auth config
- [ ] GitHub OAuth provider — same pattern, requires `user:email` scope
- [ ] Email verification flow — Better-Auth supports `requireEmailVerification: true` + `sendVerificationEmail`
- [ ] Password reset flow — Better-Auth supports `sendResetPassword`
- [ ] 2FA / TOTP — Better-Auth has built-in `twoFactor()` plugin
- [ ] Passkeys / WebAuthn — Better-Auth has built-in support
- [ ] Multi-tenancy — Better-Auth `organization()` plugin for row-level org isolation

## Payments

- [ ] Stripe integration — `stripe` npm package, webhook handler on Hono
- [ ] Subscription model — link Stripe customer to Better-Auth user, sync via webhooks
- [ ] Billing portal — Stripe Customer Portal for self-service plan management
- [ ] Usage metering — track usage per org/user for metered billing

## Email

- [ ] Transactional email — Resend, SendGrid, or AWS SES for verification/reset/notifications
- [ ] Email templates — React Email or MJML for type-safe templates

## File Storage

- [ ] File uploads — S3-compatible (AWS S3, Cloudflare R2, MinIO)
- [ ] Upload endpoint on Hono — multipart/form-data with `bodyLimit` middleware
- [ ] Image processing — Sharp for thumbnails/resizing

## Real-time

- [ ] WebSocket support — Hono's `upgradeWebSocket()` + `@hono/node-ws` for Node.js
- [ ] tRPC subscriptions — SSE via `httpSubscriptionLink` (preferred over WebSocket)
- [ ] Live updates — invalidate React Query cache on server events

## Background Jobs

- [ ] Job queue — BullMQ + Redis, or Trigger.dev
- [ ] Scheduled tasks — cron-style recurring jobs
- [ ] Email queue — async email sending via job queue

## Monitoring

- [ ] Error tracking — Sentry (has Hono SDK)
- [ ] Analytics — PostHog or Plausible
- [ ] OpenTelemetry — distributed tracing across Hono + tRPC
- [ ] Health check endpoint — `/health` returning DB connectivity status

## Infrastructure

- [ ] CI pipeline (GitHub Actions) — run `make check` + `make test` on PRs
- [ ] Docker app containers — Dockerfiles for apps/web and apps/server
- [ ] Production docker-compose — full stack with app containers + Postgres + Traefik
- [ ] CDN — static asset caching for production

## Security

- [ ] Run `agent-harness security-audit-history` — deep scan git history for leaked secrets
- [ ] Rate limiting — Hono built-in rate limiter on auth + API endpoints
- [ ] CSRF protection — Better-Auth handles this for auth routes, add for custom forms
- [ ] Content Security Policy — helmet-style headers via Hono middleware
- [ ] Input sanitization — beyond Zod validation, sanitize HTML in user content

## Quality

- [ ] Add `packageManager` field to root package.json for strict pnpm version
- [ ] Consider adding `typescript` as devDependency in leaf packages
- [ ] Integration tests — Vitest + vitest-environment-prisma-postgres for tRPC route testing

## UI / UX

- [ ] `packages/ui/` — add shadcn/ui components (Button, Input, Card, Dialog, etc.)
- [ ] Error pages — 404, 500 with TanStack Router `notFoundComponent` / `errorComponent`
- [ ] Loading states — `pendingComponent` on routes with data loading
- [ ] Toast notifications — for success/error feedback on mutations
- [ ] Dark mode — Tailwind dark mode with theme toggle
- [ ] Responsive layout — mobile-first nav bar and pages

## AI Features

- [ ] `@tanstack/ai` — provider-agnostic AI SDK with streaming, tool calling, agent loops
- [ ] AI chat component — streaming responses with tool use approval
- [ ] Server functions for AI — `createServerFn` for secure API key usage

## Developer Experience

- [ ] Route tree generation in `make setup` — current start/kill vite approach is hacky
- [ ] `@tanstack/intent` — deeper investigation of their AI skills system
- [ ] Storybook — component development in isolation for packages/ui
- [ ] API documentation — auto-generated from tRPC router types
