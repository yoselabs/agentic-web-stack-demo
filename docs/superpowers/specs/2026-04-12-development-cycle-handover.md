# Development Cycle & Architecture Patterns

## Status: Spec (approved design)

## Problem

The demo project (Retro Board) used horizontal slicing — all backend, then all UI, then all BDD at the end. This delays feedback, violates BDD-first, and means BDD catches issues only after everything is built. The template needs a prescribed process that enforces vertical feature slices with incremental quality checkpoints, plus architectural patterns that scale beyond simple CRUD.

## Architecture Patterns

### Backend Layers

```
packages/api/src/
  routers/todo.ts              ← Thin: Zod validation + protectedProcedure + tx → service
  services/todo.ts             ← Business logic: accepts db|tx, owns domain rules
  services/__tests__/todo.test.ts  ← Service unit tests (direct function calls)
  __tests__/todo.test.ts       ← Router integration tests (createCaller, auth guards)
```

**Routers** (controller layer):
- Input validation with Zod schemas
- Auth enforcement via `protectedProcedure`
- Transaction boundary: `db.$transaction(async (tx) => service.doThing(tx, ...))`
- No business logic — just wiring

**Services** (domain logic layer):
- Pure functions that accept `PrismaClient | Prisma.TransactionClient` as first argument
- Never receive tRPC context (`ctx`) — routers extract needed fields (e.g., `ctx.session.user.id`) and pass them as plain arguments
- Never start transactions — the caller owns the boundary
- Handle domain rules, data transformations, complex queries

**Transaction rules:**
- All mutations: router wraps in `db.$transaction((tx) => ...)` — even single-write ops, so you never forget when the service grows
- All reads: router calls service with `db` directly (no transaction)
- Cross-service operations: router wraps multiple service calls in one `$transaction`
- Services accept either `db` or `tx` — same interface, they don't care which

**Race condition pattern — `SELECT FOR UPDATE`:**
Any service function that does read-then-write on the same rows must lock them first:
```typescript
export async function createTodo(
  db: PrismaClient | Prisma.TransactionClient,
  userId: string,
  title: string,
) {
  await db.$queryRaw`
    SELECT id FROM "Todo"
    WHERE "userId" = ${userId} AND "completed" = false
    FOR UPDATE
  `;
  await shiftActivePositions(db, userId);
  return db.todo.create({ data: { title, userId, position: 0 } });
}
```
The `FOR UPDATE` acquires row-level locks inside the transaction the router already started. Other transactions targeting the same rows wait until this one commits.

**N+1 prevention:**
- Reads: always use `include`/`select` for related data, never loop queries
- Bulk writes: use VALUES + UPDATE join pattern instead of N individual updates:
```typescript
export async function reorderTodos(
  db: PrismaClient | Prisma.TransactionClient,
  userId: string,
  ids: string[],
) {
  const pairs = ids.map((id, i) => Prisma.sql`(${id}::text, ${i}::integer)`);
  await db.$executeRaw`
    UPDATE "Todo" AS t
    SET "position" = d.new_position
    FROM (VALUES ${Prisma.join(pairs, ",")}) AS d(id, new_position)
    WHERE t.id = d.id AND t."userId" = ${userId}
  `;
}
```

**Testing strategy (two layers):**

| Test type | What it verifies | Where |
|---|---|---|
| Service unit tests | Business logic, transactions, data correctness | `services/__tests__/` |
| Router integration tests | Input validation (Zod), auth guards, error codes | `__tests__/` via `createCaller` |

Both are needed. Service tests catch logic bugs fast. Router tests catch "forgot `protectedProcedure`" — security bugs invisible to service tests.

### Frontend Layers

```
apps/web/src/
  routes/_authenticated/todos.tsx     ← Thin shell: Route.useRouteContext() → hook → JSX
  features/todo/
    use-todos.ts                      ← Orchestration: queries, mutations, optimistic updates
    sortable-todo-item.tsx            ← Presentation (stateless, callback-driven)
    completed-todo-item.tsx
    types.ts
```

**Routes** (application service / composition root):
- Call `Route.useRouteContext()` to get `trpc` and `queryClient`
- Pass them to the orchestration hook
- Render JSX using hook return values
- Thin shells — minimal logic

**Hooks** (`features/*/use-*.ts`):
- Receive `trpc` and `queryClient` as parameters (can't call `Route.useRouteContext()` from outside route)
- Own all queries, mutations, optimistic updates, event handlers
- Extract when route has 2+ mutations or the hook return object would have 5+ properties
- Live in the feature folder per FSD rules

**Feature components:**
- Stateless, callback-driven (receive `onComplete`, `onDelete`, etc.)
- No tRPC calls — all data comes from props
- Live in `features/[domain]/`

**Shared layer** (`shared/`):
- Cross-cutting utilities, non-domain helpers, constants (e.g., `shared/lib/format-date.ts`)
- Does not exist yet in the template — create when needed

**FSD import rules:**
```
routes/   → features/, widgets/, @project/ui
widgets/  → features/, @project/ui
features/ → shared/, @project/ui
shared/   → @project/ui only
```

### Domain Group Mapping

A domain group is the unit of development. It maps 1:1 across all layers:

```
Domain Group = FSD feature folder = Prisma model cluster = tRPC router group
```

Examples:
- "Board" → `features/board/` → Board + Column + Card models → board/column/card routers + services
- "Settings" → `features/settings/` → Settings model → settings router + service
- "Billing" → `features/billing/` → Subscription + Invoice models → billing router + service (+ Stripe integration)

**Identifying domain groups** (plan writer responsibility):
- Features that share Prisma models belong to the same domain group
- Features with cross-UI dependencies (board page renders columns) belong to the same domain group
- Features with no shared models or UI dependencies are separate domain groups

## Development Cycle Process

### The Vertical Slice with Domain Batching

Each domain group follows this phase structure:

```
Phase 0: Gherkin Scenarios          ← Behavior contract, no code
Phase 1: Schema                     ← All models for the domain group
Phase 2: Backend (batched)          ← All services + routers + Vitest → API GREEN ✓
Phase 3: Frontend (vertical/feature) ← Each feature goes green independently → BDD GREEN ✓
```

### Phase 0: Gherkin Scenarios

Write `.feature` files for ALL features in the domain group before any code. The Gherkin spec is the source of truth for "what does done look like."

- Focus on behavior, not UI structure ("I fill in Email" not "I find input#email")
- One feature file per domain or per major capability
- No step definitions yet — just the scenarios

### Phase 1: Schema

All Prisma models for the domain group in one task.

- Create/modify `.prisma` files in `packages/db/prisma/schema/`
- Add relations (including reverse relations in existing schemas)
- Run `make db-push` (includes `prisma generate`)
- One subagent, one commit

### Phase 2: Backend (batched by domain)

All services, routers, and Vitest tests for the domain group in one task. This is where the 3x efficiency gain comes from — one subagent holds the full domain context.

- Write service unit tests first (TDD)
- Write router integration tests (auth guards, validation)
- Implement services (business logic, `SELECT FOR UPDATE`, `include`/VALUES patterns)
- Implement routers (thin: Zod + `protectedProcedure` + `$transaction` → service call)
- Mount routers in `packages/api/src/router.ts`
- Run `pnpm --filter @project/api test` → all pass
- Checkpoint: **API GREEN ✓**

### Phase 3: Frontend (strict vertical per feature)

One task per feature within the domain group. Each must go green before the next starts. Order by dependency — container features before children (e.g., board page before column components before card components).

Each task:
- Implement orchestration hook (`features/[domain]/use-[feature].ts`)
- Implement presentation components (stateless, callback-driven)
- Implement route (thin shell: context → hook → JSX)
- Write step definitions against real HTML (selectors are accurate, no guessing)
- Run `make test` → BDD green, no regressions on prior features
- Checkpoint: **BDD GREEN ✓**

### Feedback Loops

If a Phase 3 task reveals an API bug (wrong response shape, missing field, incorrect business logic), fix it in the same task: add a service/router test for the bug, fix the service, then continue with UI. Do not create a separate Phase 2 task retroactively. The Phase 3 subagent has full context of what's broken and is best positioned to fix it.

### Cross-domain Independence

When features DON'T share a domain (e.g., "Boards" and "User Settings"), run the full Phase 0–3 cycle for one domain group, then the other. No interleaving.

### Checkpoint Summary

| After | What passes | Confidence |
|---|---|---|
| Phase 2 | Service unit tests + router integration tests | API contract is correct |
| Each Phase 3 task | BDD scenarios for that feature + no regressions | Feature works end-to-end |
| Final | `make check` (typecheck + lint) | Code quality gate |

## Task Structure Template

### Phase 0 Task
```
Task: Write Gherkin scenarios for [domain group]
Files:
  - Create: e2e/features/[domain].feature
Steps:
  - Write scenarios covering all features in the domain
  - Focus on behavior, not UI structure
  - Write Given/When/Then steps using role-based and label-based language (these will map to getByRole, getByLabel at step definition time)
  - No step definitions yet
```

### Phase 1 Task
```
Task: [Domain] Prisma schema
Files:
  - Create/Modify: packages/db/prisma/schema/[domain].prisma
Steps:
  - Define all models for the domain group
  - Add relations (including reverse relations in existing schemas)
  - Run make db-push
  - Commit
```

### Phase 2 Task
```
Task: [Domain] services + routers + Vitest
Files:
  - Create: packages/api/src/services/[domain].ts
  - Create: packages/api/src/routers/[model].ts (one per model if needed)
  - Modify: packages/api/src/router.ts (mount new routers)
  - Create: packages/api/src/services/__tests__/[domain].test.ts
  - Create/Modify: packages/api/src/__tests__/[domain].test.ts
Steps:
  - Write service unit tests (TDD — tests first)
  - Write router integration tests (auth guards, input validation)
  - Implement services (business logic, SELECT FOR UPDATE, include/VALUES)
  - Implement routers (thin: Zod + protectedProcedure + $transaction → service)
  - Run pnpm --filter @project/api test → all pass
  - Run make check
  - Commit
```

### Phase 3 Task (one per feature)
```
Task: [Feature] UI + BDD
Files:
  - Create: apps/web/src/features/[domain]/use-[feature].ts
  - Create: apps/web/src/features/[domain]/[component].tsx
  - Create/Modify: apps/web/src/routes/_authenticated/[route].tsx
  - Create/Modify: e2e/steps/[domain].ts
Steps:
  - Implement orchestration hook (queries, mutations, optimistic updates)
  - Implement presentation components (stateless, callback-driven)
  - Implement route (thin shell: context → hook → JSX)
  - Write step definitions against real HTML
  - Run make test → BDD green, no regressions
  - Run make check
  - Commit
```

## Batching Rules

- Phase 2 batches ALL services/routers for a domain group into ONE task (shared context efficiency)
- Phase 3 splits into one task PER feature (container features before children)
- Never batch Phase 3 tasks across features — each must go green independently
- Independent domain groups get their own Phase 0–3 cycle
- Within Phase 2, related tRPC routers that share a Prisma model should be in the same subagent task

## Observations from Prior Rounds

- Batching related tRPC routers into one subagent was 3x more efficient (shared Prisma schema + router convention context)
- Spec reviewer found zero issues when plan specificity was high
- BDD tests passed on 2nd run (vs ~10 iterations in Round 1) once test ports were documented
- Step definitions written before UI existed had to be rewritten — confirming "steps after UI" is correct
- Mobile test suite validated responsive behavior automatically with no extra effort

## Anti-patterns

- Do not put business logic in routers — routers are wiring only
- Do not call `db.$transaction` inside a service — the router owns the boundary
- Do not pass tRPC `ctx` to services — extract fields and pass as plain arguments
- Do not import from `features/A/` inside `features/B/` — shared logic goes in `shared/`
- Do not write step definitions before the UI exists — they'll reference wrong selectors
- Do not batch Phase 3 tasks across features — each must go green independently
- Do not loop Prisma queries for related data — use `include`/`select`

## Implementation Status

All patterns described in this spec are implemented in the todo feature as a reference:

- `services/todo.ts` — service layer with SELECT FOR UPDATE and VALUES+UPDATE
- `routers/todo.ts` — thin router with $transaction boundaries
- `features/todo/use-todos.ts` — orchestration hook with optimistic DnD
- `features/todo/types.ts` — tRPC-inferred types (no manual drift)
- Two-layer tests: `services/__tests__/todo.test.ts` + `__tests__/todo.test.ts`
- All 4 CLAUDE.md files updated with new patterns

## Supersedes

This spec rewrites the previous brainstorming content that occupied this document. The open questions from that version (step definition timing, vertical vs horizontal) are now resolved.
