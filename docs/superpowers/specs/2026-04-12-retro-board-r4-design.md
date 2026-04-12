# Retro Board R4 Design Spec

Round 4 of the agentic-web-stack template stress test. Same retro board feature as R1-R3, built from scratch on the same template (no new template commits since R3). Focus: 3-dispatch hybrid strategy — fewer impl dispatches than R3's 4, with battle-tested BDD locator patterns to eliminate the debugging loop.

## Data Model

Three new Prisma models in `packages/db/prisma/schema/board.prisma`.

### Enums

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
```

### Board

```prisma
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
```

### Card

```prisma
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
```

### Vote

```prisma
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

### User relations (added to auth.prisma)

```prisma
boards Board[]
cards  Card[]
votes  Vote[]
```

## tRPC Routers

Three files in `packages/api/src/routers/`, all using `protectedProcedure`. Mounted in `router.ts` as `board`, `card`, `vote`.

### board.ts

| Procedure | Type | Input | Behavior |
|-----------|------|-------|----------|
| `list` | query | none | User's boards ordered by `createdAt` desc, with `_count: { cards: true }` |
| `create` | mutation | `{ title: z.string().min(1).max(200) }` | Creates board with status OPEN |
| `get` | query | `{ id: z.string() }` | Board + cards with vote counts + `myVote` flag per card. `NOT_FOUND` if missing or not owned. Query: `findUnique` board where id + userId, include cards with `_count: { votes: true }` and `votes: { where: { userId } }` (to derive `myVote: votes.length > 0`). Map cards to `CardWithVotes` shape. |
| `close` | mutation | `{ id: z.string() }` | Sets status CLOSED. `NOT_FOUND` if not owner |

### card.ts

| Procedure | Type | Input | Behavior |
|-----------|------|-------|----------|
| `create` | mutation | `{ boardId, text: z.string().min(1).max(500), category: z.nativeEnum(CardCategory) }` | Validates board is OPEN and owned by user. `NOT_FOUND` otherwise |
| `delete` | mutation | `{ id: z.string() }` | Validates card's board is owned by user and OPEN. `NOT_FOUND` otherwise |

### vote.ts

| Procedure | Type | Input | Behavior |
|-----------|------|-------|----------|
| `toggle` | mutation | `{ cardId: z.string() }` | Validates card's board is owned by user. Deletes vote if exists, creates if not. Returns `{ voted: boolean }` |

### board.get return shape

The `board.get` procedure returns a nested structure that TypeScript cannot infer through the tRPC -> React Query chain. The UI component must define an explicit `BoardData` type for `setQueryData` callbacks:

```typescript
type CardWithVotes = {
  id: string;
  text: string;
  category: CardCategory;
  boardId: string;
  userId: string;
  createdAt: Date;
  voteCount: number;
  myVote: boolean;
};

type BoardData = {
  id: string;
  title: string;
  status: BoardStatus;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  cards: CardWithVotes[];
};
```

### Error handling

All authorization failures return `TRPCError({ code: "NOT_FOUND" })` to avoid leaking existence of other users' resources.

## UI Routes

Three pages under `apps/web/src/routes/_authenticated/boards/`.

### Prerequisites (orchestrator, before UI dispatch)

Install Badge component: `pnpm dlx shadcn@latest add badge` in `packages/ui`. Not included in template.

### /boards — Board List (index.tsx)

- Query `board.list`
- Each board rendered as a Card with: title, Badge (Open green / Closed gray), card count, created date
- "New Board" button linking to `/boards/new`
- Empty state: "No boards yet — create your first one!"
- Route: `createFileRoute("/_authenticated/boards/")`

### /boards/new — Create Board (new.tsx)

- Form with title input (placeholder "Board title") + submit button "Create Board"
- On success: invalidate `board.list`, navigate to `/boards/$boardId`, toast success
- On error: toast error
- Route: `createFileRoute("/_authenticated/boards/new")`

### /boards/$boardId — Board Detail ($boardId.tsx)

- Query `board.get` with `Route.useParams().boardId`
- Three-column responsive grid (stack on mobile): Went Well / To Improve / Action Items
- Each column: h2 heading, card list, add-card form (textarea + "Add Card" button) if board OPEN
- Each card has `data-testid="card"` for BDD selectors
- Card contents: text, vote button (heart/thumbs-up icon + count), delete button (X icon) if board OPEN
- Optimistic updates on:
  - **Card create**: append to column optimistically, rollback on error
  - **Card delete**: remove from list optimistically, rollback on error
  - **Vote toggle**: flip `myVote` + increment/decrement `voteCount` optimistically, rollback on error
- All optimistic updates use explicit `BoardData` type for `setQueryData` callbacks
- Loading: spinner/skeleton
- Not found / unauthorized: "Board not found" message
- Closed board: hide add-card forms, disable vote buttons, show "Closed" Badge
- Close Board button (only when OPEN): confirms via click, calls `board.close`, invalidates cache
- Route: `createFileRoute("/_authenticated/boards/$boardId")`

### Navbar update (navbar.tsx)

Add to `navLinks`: `{ to: "/boards" as const, label: "Boards" }`. The `as const` assertion is temporary — cleaned up after route tree regeneration.

## BDD Tests

### Feature file: e2e/features/boards.feature

8 scenarios, each with unique email:

1. **Create a board** — navigate to /boards, click "New Board", fill title, submit, verify on board detail page with title visible
2. **Add cards to a board** — create board, add one card per category, verify all three visible in correct columns
3. **Vote on a card** — add card, vote, verify count=1, vote again to toggle off, verify count=0
4. **Cannot interact with closed board** — create board, add card, close, verify add-card forms hidden and vote buttons disabled
5. **Delete a card** — add card, delete it, verify detached from DOM
6. **Close a board** — create board, close it, verify "Closed" badge visible
7. **User isolation** — create board as user A, sign in as user B, navigate to /boards, verify empty state
8. **Direct URL access denied** — create board as user A, save URL, sign in as user B, navigate to saved URL, see "Board not found"

### Step definitions: e2e/steps/boards.ts

New steps (boards-specific):

| Step | Pattern | Locator strategy |
|------|---------|-----------------|
| Create a board titled {string} | Fill "Board title" placeholder, click submit | `page.getByPlaceholder("Board title")`, `page.locator('button[type="submit"]')` |
| I add a card {string} in the {string} column | Find column by heading, fill textarea, click "Add Card" | `page.getByRole("heading", { name: column })` then scope to parent container |
| I should see card {string} in the {string} column | Find column by heading, check for card text within | Column-scoped `data-testid="card"` with `hasText` |
| I vote on card {string} | Find card by `data-testid="card"` + hasText, click vote button | `page.locator('[data-testid="card"]', { hasText })` |
| I should see vote count {string} on card {string} | Verify vote count text on specific card | Same card scoping |
| I delete card {string} | Find card, click delete button within | Scoped delete button inside card container |
| I close the board | Click "Close Board" button | `page.getByRole("button", { name: "Close Board" })` |
| The board should be closed | Verify "Closed" badge visible, add-card forms hidden | `page.getByText("Closed")`, form not visible |
| I should see {string} in the URL | Check current URL contains string | `expect(page).toHaveURL()` |
| I save the current URL | Store in variable for later navigation | `page.url()` |

Reused steps from auth.ts: `I am signed in as`, `I navigate to`, `I should see`, `I should not see`, `I click`, `I fill in...with...`.

### BDD locator principles (R3 lessons)

- Anchor columns by heading text, scope cards within the heading's parent section
- Use `data-testid="card"` on card components — not CSS classes (fragile) or `data-slot` (missing from template's Card)
- Scope delete/vote buttons within the card's `data-testid` container
- Use `page.locator('button[type="submit"]')` for form submission (avoids matching other buttons)
- Use `page.goto(savedUrl)` for direct URL test, not Link navigation
- Unique email per scenario: `boards-create@example.com`, `boards-cards@example.com`, etc.

## Execution Strategy

### 3 implementation dispatches

| # | Scope | Model |
|---|-------|-------|
| 1 | Prisma schema (`board.prisma`) + all 3 tRPC routers + mount in `router.ts` | sonnet |
| 2 | All 3 UI route files + navbar update | sonnet |
| 3 | BDD feature file + step definitions | sonnet |

### Review dispatches (haiku for all)

After each implementation dispatch: spec compliance review + code quality review (haiku).

### Orchestrator work between dispatches

1. **Before dispatch 2**: Install Badge component (`pnpm dlx shadcn@latest add badge` in packages/ui)
2. **After dispatch 1**: `make db-push`, `make check`
3. **After dispatch 2**: Start `make dev` ~5s for route tree regen, kill, clean up `as string` casts, `make check`
4. **After dispatch 3**: `pnpm exec bddgen` in e2e/, kill dev servers (`lsof -ti :3000,:3001,:3100,:3101 | xargs kill -9`), `make test`, `make check`

### Target metrics

- 3 impl dispatches (R3: 4)
- ~6 review dispatches (all haiku — R3 mixed sonnet/haiku)
- 0 BDD fix iterations (R3: 3)
- Estimated cost: ~$10-15 (R3: ~$14-21)

## Success Criteria

- `make check` passes (13/13 quality gates + typecheck)
- `make test` passes (all BDD scenarios green, desktop + mobile)
- Feature exercises: Prisma relations, tRPC nested routers, optimistic mutations, parameterized SSR routes, auth guards, playwright-bdd
- Zero template gaps (or gaps documented)
