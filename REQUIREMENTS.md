# Project Requirements

## Goal

Build a non-trivial demo feature on top of the **agentic-web-stack** template to stress-test all layers of the stack. The feature should exercise relational data, optimistic mutations, parameterized SSR routes, auth guards, and BDD testing — surfacing any gaps in the template.

## Template Stack

- **TanStack Start** (SSR) + **Hono** (API) + **tRPC** + **Prisma** + **PostgreSQL**
- **Better-Auth** (email/password authentication)
- **playwright-bdd** for BDD testing (Gherkin specs + step definitions)
- **agent-harness** quality gates (13 checks: lint, format, typecheck, etc.)
- Progressive CLAUDE.md files per directory for AI agent guidance

## Feature: Team Retrospective Board

Users create retro boards, post cards in three categories, and vote on cards to prioritize.

### Data Model

| Model | Fields | Relations |
|-------|--------|-----------|
| **Board** | id, title, status (open/closed), userId, timestamps | User (creator), Card[] |
| **Card** | id, text, category (went-well/to-improve/action-item), boardId, userId, createdAt | Board, User (author), Vote[] |
| **Vote** | id, cardId, userId, createdAt; @@unique(cardId, userId) | Card, User |

All cascade-delete from parent. User isolation enforced at query level.

### Routes (all auth-gated)

| Path | Description |
|------|-------------|
| `/boards` | List user's boards with status badges and card counts |
| `/boards/new` | Create a new board |
| `/boards/$boardId` | Board detail — 3-column layout with cards, voting |

### tRPC Procedures

| Procedure | Type | Description |
|-----------|------|-------------|
| `board.list` | query | User's boards, ordered by date, with card counts |
| `board.create` | mutation | Create board (title min 1, max 200) |
| `board.get` | query | Board with cards, vote counts, and "did I vote" flag |
| `board.close` | mutation | Close board (owner only) |
| `card.create` | mutation | Add card to open board (text min 1, max 500) |
| `card.delete` | mutation | Delete card from open board (owner only) |
| `vote.toggle` | mutation | Toggle vote on/off (one per user per card) |

### Error Handling

All authorization failures return `TRPCError({ code: "NOT_FOUND" })` — avoids leaking existence of other users' boards.

### UI Requirements

- **Board detail:** Three-column layout (Went Well / To Improve / Action Items)
- **Optimistic updates:** card create, card delete, vote toggle — instant UI with rollback on error
- **Closed board:** inputs hidden, votes disabled, visual indicator
- **Loading/not-found states:** spinner while loading, "Board not found" for missing/unauthorized

### BDD Test Scenarios

1. Create a board
2. Add cards to a board (all 3 categories)
3. Vote on a card (toggle on/off)
4. Cannot interact with a closed board
5. Delete a card
6. Close a board
7. User isolation — boards are private
8. Cannot access another user's board by direct URL

### Scope Exclusions

- No drag-and-drop or card reordering
- No editing card text after creation
- No sharing boards with other users (single-user boards)
- No real-time sync — optimistic updates only

## Success Criteria

- `make check` passes (13/13 quality gates + typecheck)
- `make test` passes (all BDD scenarios green)
- Feature exercises: Prisma relations, tRPC nested routers, optimistic mutations, parameterized SSR routes, auth guards, playwright-bdd
- Zero template gaps found (or gaps documented for upstream fix)

## Full Design Spec

See: `docs/superpowers/specs/2026-04-12-retro-board-design.md`

## Implementation Plan

See: `docs/superpowers/plans/2026-04-12-retro-board.md`

## Experiment Results

See: `EXPERIMENT.yaml`
