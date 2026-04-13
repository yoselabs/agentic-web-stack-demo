# Retro Board R5 Design Spec

Round 5 of the agentic-web-stack stress test. Same feature as R1-R4, built fresh on the updated template to measure impact of new patterns: services layer, `make routes`, hook extraction.

## Experiment Variable

**2 mega-task execution** — most aggressive batching yet. Backend (schema + services + routers) in one subagent, frontend (hooks + routes + BDD) in another. Tests whether improved CLAUDE.md guidance enables larger scopes.

## Data Model

File: `packages/db/prisma/schema/board.prisma`

```prisma
enum BoardStatus {
  OPEN
  CLOSED
}

enum CardCategory {
  WENT_WELL
  TO_IMPROVE
  ACTION_ITEM
}

model Board {
  id        String      @id @default(cuid())
  title     String
  status    BoardStatus @default(OPEN)
  userId    String
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  user  User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  cards Card[]
}

model Card {
  id        String       @id @default(cuid())
  text      String
  category  CardCategory
  boardId   String
  userId    String
  createdAt DateTime     @default(now())

  board Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  user  User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  votes Vote[]
}

model Vote {
  id        String   @id @default(cuid())
  cardId    String
  userId    String
  createdAt DateTime @default(now())

  card Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([cardId, userId])
}
```

Reverse relations added to User in `auth.prisma`: `boards Board[]`, `cards Card[]`, `votes Vote[]`.

## Services Layer

### `packages/api/src/services/board.ts`

```typescript
type DbClient = PrismaClient | Prisma.TransactionClient;

listBoards(db: DbClient, userId: string)
  // findMany where userId, orderBy createdAt desc, include _count.cards

createBoard(db: DbClient, userId: string, title: string)
  // create with status OPEN

getBoard(db: DbClient, userId: string, boardId: string)
  // findFirst where id + userId, include cards with votes
  // Transform: add voteCount + hasVoted(userId) per card
  // Return shape: { ...board, cards: Array<Card & { voteCount: number, hasVoted: boolean }> }
  // Throw TRPCError NOT_FOUND if missing

closeBoard(db: DbClient, userId: string, boardId: string)
  // findFirst where id + userId, throw NOT_FOUND if missing
  // update status to CLOSED
```

### `packages/api/src/services/card.ts`

```typescript
createCard(db: DbClient, userId: string, boardId: string, text: string, category: CardCategory)
  // Verify board exists, owned by user, OPEN — else NOT_FOUND
  // create card

deleteCard(db: DbClient, userId: string, cardId: string)
  // Find card with board, verify card ownership + board OPEN — else NOT_FOUND
  // delete card

toggleVote(db: DbClient, userId: string, cardId: string)
  // Find card with board, verify board belongs to user (boards are single-user, so owner = only accessor) + OPEN — else NOT_FOUND
  // Check existing vote: delete if exists, create if not
  // Return { voted: boolean }
```

All authorization failures: `throw new TRPCError({ code: "NOT_FOUND" })`.

## tRPC Routers

### `packages/api/src/routers/board.ts`

```
board.list    — query   → listBoards(ctx.db, userId)
board.create  — mutation, input { title: string min 1 max 200 } → $transaction → createBoard
board.get     — query, input { id: string } → getBoard(ctx.db, userId, id)
board.close   — mutation, input { id: string } → $transaction → closeBoard
```

### `packages/api/src/routers/card.ts`

```
card.create   — mutation, input { boardId, text: min 1 max 500, category: enum } → $transaction → createCard
card.delete   — mutation, input { id: string } → $transaction → deleteCard
vote.toggle   — mutation, input { cardId: string } → $transaction → toggleVote
```

Both routers merged into `appRouter` in `packages/api/src/router.ts`. `vote.toggle` lives in the card router (single procedure, tightly coupled to cards).

## Frontend Hooks

### `apps/web/src/features/board/use-board-detail.ts`

Receives `trpc: TRPCOptionsProxy<AppRouter>` and `queryClient: QueryClient`.

- **Query:** `board.get` with `boardId` parameter
- **Mutations with optimistic updates:**
  - `card.create` — append temp card to cache, rollback on error, invalidate on success
  - `card.delete` — remove card from cache, rollback on error
  - `vote.toggle` — flip `hasVoted`, adjust `voteCount` +/-1, rollback on error
- **Returns:** board data, card/vote handlers, loading states

Explicit types for `setQueryData` callbacks to avoid tRPC type inference issues.

### `apps/web/src/features/board/use-board-list.ts`

- **Query:** `board.list`
- **Mutation:** `board.create` — invalidate on success (no optimistic, redirects to new board)
- **Returns:** boards, createBoard handler

## Routes

All under `apps/web/src/routes/_authenticated/boards/`:

### `index.tsx` — `/boards`
List page. Shows user's boards with title, status badge (Open/Closed), card count. Link to each board. "New Board" button links to `/boards/new`. Empty state message when no boards.

### `new.tsx` — `/boards/new`
Form with title input + submit button. On success, navigates to `/boards/$boardId`. Disabled button while submitting.

### `$boardId.tsx` — `/boards/$boardId`
3-column layout: Went Well | To Improve | Action Items. Each column rendered as a `<section>` with an `<h2>` heading matching the category name. Each column shows its cards with vote button (count + voted state) and delete button (owner only). Card creation form per column (text input with placeholder "Add a card..." + add button). Close board button in header (owner only). Closed boards: forms hidden, vote buttons disabled, visual "Closed" Badge. Loading spinner while fetching. "Board not found" text for missing/unauthorized boards.

All routes are thin shells using hook extraction pattern.

**Navbar:** Add a "Boards" link to the existing navbar component so the feature is reachable from the UI.

**UI component prerequisites:** Install Badge component (`pnpm dlx shadcn@latest add badge`) for status badges before frontend work.

## BDD Scenarios

File: `e2e/features/boards.feature`

8 scenarios with unique emails per scenario:

1. **Create a board** — fill title, submit, see board in list
2. **Add cards** — create cards in all 3 categories, verify they appear in correct columns
3. **Vote on a card** — click vote, see count increment; click again, see decrement
4. **Cannot interact with closed board** — close board, verify forms hidden and votes disabled
5. **Delete a card** — create card, delete it, verify gone
6. **Close a board** — click close, verify status changes
7. **User isolation** — user A creates board, user B sees empty list
8. **Direct URL access** — user A creates board, user B navigates to URL, sees "not found"

Step definitions in `e2e/steps/boards.ts`, written after UI exists. Locators use:
- `getByRole`, `getByPlaceholder`, `getByText` for semantic selection
- Section-scoped locators via `page.locator("section", { has: heading })` for column targeting
- `signUpOrSignIn` helper for auth

## Execution Plan (2 Mega-Tasks)

### Task 1: Backend
Schema (board.prisma + User relations) → `make db-push` → Services (board.ts + card.ts) → Routers (board.ts + card.ts) → Register in `router.ts` → `make check`

Vitest tests are intentionally skipped — BDD scenarios are the primary validation for this stress test.

### Task 2: Frontend
Install Badge component → Hooks (use-board-detail.ts + use-board-list.ts) → Routes (index, new, $boardId) → Navbar link → `make routes` → BDD feature file + step definitions + `pnpm exec bddgen` → `make check` → `make test`

### Orchestrator (between tasks)
- `make routes` if route tree needs regeneration
- `as string` cast cleanup once all routes exist
- `make check` verification after each task
- Install Badge component if not done by frontend subagent

## Success Criteria

- `make check` passes (13/13 + typecheck)
- `make test` passes (all BDD scenarios green)
- 2 implementation subagent dispatches (strongest batching signal yet)
- Feature matches REQUIREMENTS.md exactly
