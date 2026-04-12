# Retro Board R3 Design Spec

## Context

Round 3 of the agentic-web-stack template stress test. Same feature (team retrospective board), same requirements, same template version as R2. The variable is execution strategy: maximum efficiency through aggressive subagent batching.

## Goal

Build a retro board feature exercising all stack layers (Prisma relations, tRPC nested routers, optimistic mutations, parameterized SSR routes, auth guards, BDD testing) in the fewest subagent dispatches possible.

## Requirements

Identical to REQUIREMENTS.md. Summary:

### Data Model

| Model | Fields | Constraints |
|-------|--------|-------------|
| Board | id, title, status (OPEN/CLOSED), userId, timestamps | Cascade delete cards |
| Card | id, text, category (WENT_WELL/TO_IMPROVE/ACTION_ITEM), boardId, userId, createdAt | Cascade delete votes |
| Vote | id, cardId, userId, createdAt | @@unique(cardId, userId), cascade delete |

### tRPC Procedures (7)

| Procedure | Type | Auth | Notes |
|-----------|------|------|-------|
| board.list | query | protected | User's boards, descending by date, with card counts |
| board.create | mutation | protected | Title min 1, max 200 |
| board.get | query | protected | Board + cards + vote counts + hasVoted flag |
| board.close | mutation | protected | Owner only, NOT_FOUND for others |
| card.create | mutation | protected | Open boards only, text min 1 max 500 |
| card.delete | mutation | protected | Card owner only, open boards only |
| vote.toggle | mutation | protected | One per user per card, toggle on/off |

All authorization failures: `TRPCError({ code: "NOT_FOUND" })`.

### Routes (3, all auth-gated)

| Path | Description |
|------|-------------|
| /boards | List user's boards with status badges and card counts |
| /boards/new | Create board form |
| /boards/$boardId | 3-column detail with cards, voting, close |

### UI Behavior

- Optimistic updates: card delete, vote toggle (with rollback)
- Closed boards: inputs hidden, votes disabled, "Closed" badge
- Loading/not-found states: spinner, "Board not found" for missing/unauthorized

### BDD Scenarios (8)

1. Create a board
2. Add cards (all 3 categories)
3. Vote on a card (toggle on/off)
4. Cannot interact with closed board
5. Delete a card
6. Close a board
7. User isolation (boards are private)
8. Cannot access another user's board by URL

## Execution Strategy

**Target: 5 subagent dispatches** (down from R2's 8)

| Dispatch | Content | Model |
|----------|---------|-------|
| 1 | Prisma schema (board.prisma + auth.prisma relations) | sonnet |
| 2 | All 3 tRPC routers + router.ts mount | sonnet |
| 3 | All 3 UI pages + navbar update | sonnet |
| 4 | BDD feature file + step definitions | sonnet |
| 5 | (If needed) BDD locator fixes | sonnet |

Orchestrator (opus) handles:
- `make db-push` after dispatch 1
- Route tree regeneration + `as string` cleanup between dispatches 2 and 3
- `make check` after each dispatch
- `make test` after dispatch 4
- Final quality gate

### Key Optimization: Complete Code in Plan

Every dispatch includes full file contents in the plan. Subagents paste and adjust rather than designing from scratch. This reduces exploration tokens and prevents wrong-direction implementations.

## Files

**Create:**
- `packages/db/prisma/schema/board.prisma`
- `packages/api/src/routers/board.ts`
- `packages/api/src/routers/card.ts`
- `packages/api/src/routers/vote.ts`
- `apps/web/src/routes/_authenticated/boards/index.tsx`
- `apps/web/src/routes/_authenticated/boards/new.tsx`
- `apps/web/src/routes/_authenticated/boards/$boardId.tsx`
- `e2e/features/boards.feature`
- `e2e/steps/boards.ts`

**Modify:**
- `packages/db/prisma/schema/auth.prisma` — User relations
- `packages/api/src/router.ts` — Mount new routers
- `apps/web/src/widgets/navbar.tsx` — Add Boards link

## Success Criteria

- `make check` passes (13/13 lint + typecheck)
- `make test` passes (all BDD scenarios green, desktop + mobile)
- 5 subagent dispatches (stretch goal)
- Estimated cost < R2's $11-17
