# Retro Board R3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a team retrospective board feature (boards, cards, votes) to stress-test the agentic-web-stack template — Round 3, targeting maximum efficiency with <= 5 subagent dispatches.

**Architecture:** Prisma models (Board, Card, Vote) with tRPC routers, 3 authenticated routes under `/boards`, optimistic mutations (card create, card delete, vote toggle), and 8 BDD scenarios. Follows existing template patterns: FSD layers, `routers/` convention, multi-file Prisma schema.

**Tech Stack:** TanStack Start, Hono, tRPC, Prisma, PostgreSQL, Better-Auth, shadcn/ui, playwright-bdd

**Design Spec:** `docs/superpowers/specs/2026-04-12-retro-board-r3-design.md`

---

## File Structure

**Create:**
| File | Responsibility |
|------|---------------|
| `packages/db/prisma/schema/board.prisma` | Board, Card, Vote models + BoardStatus, CardCategory enums |
| `packages/api/src/routers/board.ts` | board.list, board.create, board.get, board.close procedures |
| `packages/api/src/routers/card.ts` | card.create, card.delete procedures |
| `packages/api/src/routers/vote.ts` | vote.toggle procedure |
| `apps/web/src/routes/_authenticated/boards/index.tsx` | Board list page |
| `apps/web/src/routes/_authenticated/boards/new.tsx` | Create board page |
| `apps/web/src/routes/_authenticated/boards/$boardId.tsx` | Board detail — 3-column layout, cards, voting, close |
| `e2e/features/boards.feature` | 8 Gherkin scenarios |
| `e2e/steps/boards.ts` | Step definitions for board scenarios |

**Modify:**
| File | Change |
|------|--------|
| `packages/db/prisma/schema/auth.prisma` | Add Board[], Card[], Vote[] relations to User model |
| `packages/api/src/router.ts` | Import and mount boardRouter, cardRouter, voteRouter |
| `apps/web/src/widgets/navbar.tsx` | Add "Boards" to navLinks array |

---

### Task 1: Prisma Schema

**Files:**
- Create: `packages/db/prisma/schema/board.prisma`
- Modify: `packages/db/prisma/schema/auth.prisma`

**Reference docs:** Read `packages/db/CLAUDE.md` before starting. Follow the pattern in `packages/db/prisma/schema/todo.prisma`.

- [ ] **Step 1: Create board.prisma with Board, Card, Vote models**

Create `packages/db/prisma/schema/board.prisma`:

```prisma
// Application owned — full control.

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

- [ ] **Step 2: Add reverse relations to User in auth.prisma**

In `packages/db/prisma/schema/auth.prisma`, add these lines inside the `User` model block, after the existing `todos Todo[]` relation:

```prisma
  boards Board[]
  cards  Card[]
  votes  Vote[]
```

- [ ] **Step 3: Push schema and verify**

```bash
make db-push
make check
```

Expected: Both pass. `make db-push` creates the 3 new tables + 2 enums. `make check` confirms types propagate.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema/board.prisma packages/db/prisma/schema/auth.prisma
git commit -m "feat: add Board, Card, Vote prisma models with enums and relations"
```

---

### Task 2: tRPC Routers (board, card, vote)

**Files:**
- Create: `packages/api/src/routers/board.ts`
- Create: `packages/api/src/routers/card.ts`
- Create: `packages/api/src/routers/vote.ts`
- Modify: `packages/api/src/router.ts`

**Reference docs:** Read `packages/api/CLAUDE.md` before starting. Follow the pattern in `packages/api/src/routers/todo.ts`. All procedures use `protectedProcedure` from `../trpc.js`. Authorization failures return `TRPCError({ code: "NOT_FOUND" })` — never `FORBIDDEN` or `UNAUTHORIZED` (avoid leaking existence).

- [ ] **Step 1: Create board.ts**

Create `packages/api/src/routers/board.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const boardRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.board.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { cards: true } } },
    });
  }),

  create: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.board.create({
        data: { title: input.title, userId: ctx.session.user.id },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const board = await ctx.db.board.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        include: {
          cards: {
            orderBy: { createdAt: "asc" },
            include: {
              votes: { select: { userId: true } },
              _count: { select: { votes: true } },
            },
          },
        },
      });
      if (!board) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return {
        ...board,
        cards: board.cards.map((card) => ({
          ...card,
          voteCount: card._count.votes,
          hasVoted: card.votes.some((v) => v.userId === ctx.session.user.id),
          votes: undefined,
          _count: undefined,
        })),
      };
    }),

  close: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const board = await ctx.db.board.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });
      if (!board) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return ctx.db.board.update({
        where: { id: input.id },
        data: { status: "CLOSED" },
      });
    }),
});
```

- [ ] **Step 2: Create card.ts**

Create `packages/api/src/routers/card.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const cardRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        boardId: z.string(),
        text: z.string().min(1).max(500),
        category: z.enum(["WENT_WELL", "TO_IMPROVE", "ACTION_ITEM"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const board = await ctx.db.board.findFirst({
        where: {
          id: input.boardId,
          userId: ctx.session.user.id,
          status: "OPEN",
        },
      });
      if (!board) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return ctx.db.card.create({
        data: {
          text: input.text,
          category: input.category,
          boardId: input.boardId,
          userId: ctx.session.user.id,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const card = await ctx.db.card.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        include: { board: { select: { status: true } } },
      });
      if (!card || card.board.status !== "OPEN") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return ctx.db.card.delete({ where: { id: input.id } });
    }),
});
```

- [ ] **Step 3: Create vote.ts**

Create `packages/api/src/routers/vote.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const voteRouter = router({
  toggle: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const card = await ctx.db.card.findFirst({
        where: { id: input.cardId },
        include: {
          board: { select: { userId: true, status: true } },
        },
      });
      if (
        !card ||
        card.board.userId !== ctx.session.user.id ||
        card.board.status !== "OPEN"
      ) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const existing = await ctx.db.vote.findUnique({
        where: {
          cardId_userId: {
            cardId: input.cardId,
            userId: ctx.session.user.id,
          },
        },
      });
      if (existing) {
        await ctx.db.vote.delete({ where: { id: existing.id } });
        return { voted: false };
      }
      await ctx.db.vote.create({
        data: { cardId: input.cardId, userId: ctx.session.user.id },
      });
      return { voted: true };
    }),
});
```

- [ ] **Step 4: Mount all routers in router.ts**

Replace the entire contents of `packages/api/src/router.ts` with:

```typescript
import { boardRouter } from "./routers/board.js";
import { cardRouter } from "./routers/card.js";
import { todoRouter } from "./routers/todo.js";
import { voteRouter } from "./routers/vote.js";
import { protectedProcedure, publicProcedure, router } from "./trpc.js";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => "OK"),
  hello: publicProcedure.query(() => ({
    message: "Hello from tRPC!",
  })),
  me: protectedProcedure.query(({ ctx }) => ({
    user: ctx.session.user,
  })),
  todo: todoRouter,
  board: boardRouter,
  card: cardRouter,
  vote: voteRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 5: Verify and commit**

```bash
make check
```

Expected: Pass (types propagate, no lint issues).

```bash
git add packages/api/src/routers/board.ts packages/api/src/routers/card.ts packages/api/src/routers/vote.ts packages/api/src/router.ts
git commit -m "feat: add board, card, vote tRPC routers with auth guards"
```

---

### Task 3: All UI Pages + Navbar

**Files:**
- Create: `apps/web/src/routes/_authenticated/boards/index.tsx`
- Create: `apps/web/src/routes/_authenticated/boards/new.tsx`
- Create: `apps/web/src/routes/_authenticated/boards/$boardId.tsx`
- Modify: `apps/web/src/widgets/navbar.tsx`

**Reference docs:** Read `apps/web/CLAUDE.md` before starting. Follow the pattern in `apps/web/src/routes/_authenticated/todos.tsx` for tRPC + React Query usage. Use `Route.useRouteContext()` to get `trpc`. Use shadcn/ui components from `@project/ui/components/*`. Use `sonner` for toast notifications.

**IMPORTANT — Route type safety:** When you create route files, `Link to` props for the new routes will fail typecheck because `routeTree.gen.ts` hasn't been regenerated yet. Use `as string` cast on `to` props for any `/boards/*` paths: `to={"/boards" as string}`. The orchestrator will regenerate the route tree and clean up these casts after this task.

- [ ] **Step 1: Create boards/index.tsx (board list page)**

Create `apps/web/src/routes/_authenticated/boards/index.tsx`:

```tsx
import { Badge } from "@project/ui/components/badge";
import { Button } from "@project/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@project/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/boards/")({
  component: BoardsPage,
});

function BoardsPage() {
  const { trpc } = Route.useRouteContext();
  const boards = useQuery(trpc.board.list.queryOptions());

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Boards</h1>
        <Button asChild>
          <Link to={"/boards/new" as string}>New Board</Link>
        </Button>
      </div>

      {boards.isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : boards.data?.length === 0 ? (
        <p className="text-muted-foreground">
          No boards yet. Create your first retro board!
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {boards.data?.map((board) => (
            <Link key={board.id} to={`/boards/${board.id}` as string}>
              <Card className="hover:border-foreground/20 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">{board.title}</CardTitle>
                  <Badge
                    variant={
                      board.status === "OPEN" ? "default" : "secondary"
                    }
                  >
                    {board.status === "OPEN" ? "Open" : "Closed"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {board._count.cards}{" "}
                    {board._count.cards === 1 ? "card" : "cards"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Create boards/new.tsx (create board page)**

Create `apps/web/src/routes/_authenticated/boards/new.tsx`:

```tsx
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/boards/new")({
  component: NewBoardPage,
});

function NewBoardPage() {
  const { trpc } = Route.useRouteContext();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");

  const createBoard = useMutation(
    trpc.board.create.mutationOptions({
      onSuccess: (board) => {
        toast.success("Board created");
        navigate({ to: `/boards/${board.id}` as string });
      },
      onError: () => toast.error("Failed to create board"),
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createBoard.mutate({ title: title.trim() });
  };

  return (
    <main className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="text-3xl font-bold mb-6">New Board</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          placeholder="Board title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <Button
          type="submit"
          disabled={!title.trim() || createBoard.isPending}
        >
          Create Board
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Create boards/$boardId.tsx (board detail page)**

Create `apps/web/src/routes/_authenticated/boards/$boardId.tsx`:

```tsx
import { Badge } from "@project/ui/components/badge";
import { Button } from "@project/ui/components/button";
import { Card, CardContent } from "@project/ui/components/card";
import { Input } from "@project/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  component: BoardDetailPage,
});

type CardCategory = "WENT_WELL" | "TO_IMPROVE" | "ACTION_ITEM";

interface BoardCard {
  id: string;
  text: string;
  category: CardCategory;
  boardId: string;
  userId: string;
  createdAt: string;
  voteCount: number;
  hasVoted: boolean;
}

interface BoardData {
  id: string;
  title: string;
  status: "OPEN" | "CLOSED";
  userId: string;
  createdAt: string;
  updatedAt: string;
  cards: BoardCard[];
}

const COLUMNS: { category: CardCategory; title: string }[] = [
  { category: "WENT_WELL", title: "Went Well" },
  { category: "TO_IMPROVE", title: "To Improve" },
  { category: "ACTION_ITEM", title: "Action Items" },
];

function BoardDetailPage() {
  const { trpc } = Route.useRouteContext();
  const { boardId } = Route.useParams();
  const queryClient = useQueryClient();

  const board = useQuery(trpc.board.get.queryOptions({ id: boardId }));

  const queryKey = trpc.board.get.queryFilter({ id: boardId }).queryKey;

  const closeBoard = useMutation(
    trpc.board.close.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        toast.success("Board closed");
      },
      onError: () => toast.error("Failed to close board"),
    }),
  );

  const createCard = useMutation(
    trpc.card.create.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData(queryKey) as
          | BoardData
          | undefined;
        if (previous) {
          const optimisticCard: BoardCard = {
            id: `optimistic-${Date.now()}`,
            text: input.text,
            category: input.category as CardCategory,
            boardId: input.boardId,
            userId: "",
            createdAt: new Date().toISOString(),
            voteCount: 0,
            hasVoted: false,
          };
          queryClient.setQueryData(queryKey, {
            ...previous,
            cards: [...previous.cards, optimisticCard],
          });
        }
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(queryKey, context.previous);
        }
        toast.error("Failed to add card");
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey });
      },
    }),
  );

  const deleteCard = useMutation(
    trpc.card.delete.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData(queryKey) as
          | BoardData
          | undefined;
        if (previous) {
          queryClient.setQueryData(queryKey, {
            ...previous,
            cards: previous.cards.filter(
              (c: BoardCard) => c.id !== input.id,
            ),
          });
        }
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(queryKey, context.previous);
        }
        toast.error("Failed to delete card");
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey });
      },
    }),
  );

  const toggleVote = useMutation(
    trpc.vote.toggle.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData(queryKey) as
          | BoardData
          | undefined;
        if (previous) {
          queryClient.setQueryData(queryKey, {
            ...previous,
            cards: previous.cards.map((c: BoardCard) =>
              c.id === input.cardId
                ? {
                    ...c,
                    hasVoted: !c.hasVoted,
                    voteCount: c.hasVoted
                      ? c.voteCount - 1
                      : c.voteCount + 1,
                  }
                : c,
            ),
          });
        }
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData(queryKey, context.previous);
        }
        toast.error("Failed to toggle vote");
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey });
      },
    }),
  );

  if (board.isLoading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (!board.data) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold mb-4">Board not found</h1>
        <Button asChild variant="outline">
          <Link to={"/boards" as string}>Back to boards</Link>
        </Button>
      </main>
    );
  }

  const isOpen = board.data.status === "OPEN";

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{board.data.title}</h1>
          <Badge variant={isOpen ? "default" : "secondary"}>
            {isOpen ? "Open" : "Closed"}
          </Badge>
        </div>
        {isOpen && (
          <Button
            variant="outline"
            onClick={() => closeBoard.mutate({ id: boardId })}
            disabled={closeBoard.isPending}
          >
            Close Board
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {COLUMNS.map((column) => (
          <BoardColumn
            key={column.category}
            title={column.title}
            category={column.category}
            cards={board.data.cards.filter(
              (c) => c.category === column.category,
            )}
            isOpen={isOpen}
            boardId={boardId}
            onCreateCard={(text, category) =>
              createCard.mutate({ boardId, text, category })
            }
            onDeleteCard={(id) => deleteCard.mutate({ id })}
            onToggleVote={(cardId) => toggleVote.mutate({ cardId })}
          />
        ))}
      </div>
    </main>
  );
}

function BoardColumn({
  title,
  category,
  cards,
  isOpen,
  onCreateCard,
  onDeleteCard,
  onToggleVote,
}: {
  title: string;
  category: CardCategory;
  cards: BoardCard[];
  isOpen: boolean;
  boardId: string;
  onCreateCard: (text: string, category: CardCategory) => void;
  onDeleteCard: (id: string) => void;
  onToggleVote: (cardId: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onCreateCard(text.trim(), category);
    setText("");
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {isOpen && (
        <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
          <Input
            type="text"
            placeholder="Add a card..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      )}
      <div className="space-y-2">
        {cards.map((card) => (
          <Card key={card.id}>
            <CardContent className="p-3">
              <p className="text-sm mb-2">{card.text}</p>
              <div className="flex items-center justify-between">
                <Button
                  variant={card.hasVoted ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onToggleVote(card.id)}
                  disabled={!isOpen}
                  className="gap-1"
                >
                  <ThumbsUp className="h-3 w-3" />
                  {card.voteCount}
                </Button>
                {isOpen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteCard(card.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add Boards link to navbar**

In `apps/web/src/widgets/navbar.tsx`, change the `navLinks` array to:

```typescript
const navLinks = [
  { to: "/dashboard" as const, label: "Dashboard" },
  { to: "/todos" as const, label: "Todos" },
  { to: "/boards" as const, label: "Boards" },
];
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_authenticated/boards/index.tsx apps/web/src/routes/_authenticated/boards/new.tsx apps/web/src/routes/_authenticated/boards/\$boardId.tsx apps/web/src/widgets/navbar.tsx
git commit -m "feat: add board list, create board, and board detail pages with optimistic updates"
```

**Note to orchestrator:** After this task completes, regenerate the route tree and clean up `as string` casts. See "Orchestrator Responsibilities" section below.

---

### Task 4: BDD Feature File + Step Definitions

**Files:**
- Create: `e2e/features/boards.feature`
- Create: `e2e/steps/boards.ts`

**Reference docs:** Read `e2e/CLAUDE.md` before starting. Follow patterns in `e2e/features/todos.feature` and `e2e/steps/todos.ts`. Shared steps from `e2e/steps/auth.ts` are already available: `I am signed in as {string}`, `I navigate to {string}`, `I should see {string}`, `I fill in {string} with {string}`, `I click {string}`. Use unique emails per scenario. Use `createBdd()` pattern.

**IMPORTANT — Locator strategy:**
- Use `page.getByRole("heading", { name: title, level: 2 })` to find column headings
- Use `page.locator("div", { has: heading }).first()` to scope to a column — but be careful, this matches nested divs. Prefer `.first()` to get the outermost match.
- Use `page.locator('button[type="submit"]')` for form submit buttons (avoids matching other buttons)
- For card elements, use text content matching: `page.getByText(text).locator("..").locator("..")` or `page.locator('[class*="card"]', { hasText: text }).first()`

- [ ] **Step 1: Create boards.feature**

Create `e2e/features/boards.feature`:

```gherkin
Feature: Team Retrospective Boards

  Scenario: Create a board
    Given I am signed in as "create-board@example.com"
    And I navigate to "/boards"
    When I click "New Board"
    And I fill in "Board title..." with "Sprint 1 Retro"
    And I click "Create Board"
    Then I should see "Sprint 1 Retro"

  Scenario: Add cards to a board
    Given I am signed in as "add-cards@example.com"
    And I have a board "Cards Test Board"
    When I add a card "Great teamwork" in "Went Well"
    And I add a card "Slow deploys" in "To Improve"
    And I add a card "Fix CI pipeline" in "Action Items"
    Then I should see "Great teamwork"
    And I should see "Slow deploys"
    And I should see "Fix CI pipeline"

  Scenario: Vote on a card
    Given I am signed in as "vote-card@example.com"
    And I have a board "Vote Test Board"
    And I add a card "Nice work" in "Went Well"
    When I vote on the card "Nice work"
    Then the card "Nice work" should show 1 vote
    When I vote on the card "Nice work"
    Then the card "Nice work" should show 0 votes

  Scenario: Cannot interact with a closed board
    Given I am signed in as "closed-board@example.com"
    And I have a board "Close Test Board"
    And I add a card "Before close" in "Went Well"
    When I close the board
    Then I should see "Closed"
    And the add card forms should be hidden

  Scenario: Delete a card
    Given I am signed in as "delete-card@example.com"
    And I have a board "Delete Test Board"
    And I add a card "To be deleted" in "To Improve"
    When I delete the card "To be deleted"
    Then I should not see "To be deleted"

  Scenario: Close a board
    Given I am signed in as "close-board@example.com"
    And I have a board "Board To Close"
    When I close the board
    Then I should see "Closed"

  Scenario: User isolation - boards are private
    Given I am signed in as "private-board@example.com"
    And I navigate to "/boards"
    When I click "New Board"
    And I fill in "Board title..." with "My Private Board"
    And I click "Create Board"
    And I navigate to "/boards"
    Then I should see "My Private Board"
    When I sign out and sign in as "other-board-user@example.com"
    And I navigate to "/boards"
    Then I should not see "My Private Board"

  Scenario: Cannot access another user's board by direct URL
    Given I am signed in as "owner-board@example.com"
    And I have a board "Owner Only Board"
    When I sign out and sign in as "intruder-board@example.com"
    And I navigate to the last board URL
    Then I should see "Board not found"
```

- [ ] **Step 2: Create steps/boards.ts**

Create `e2e/steps/boards.ts`:

```typescript
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

// Track the last board URL for the "direct URL" scenario
let lastBoardUrl = "";

given("I have a board {string}", async ({ page }, title: string) => {
  await page.goto("/boards");
  await page.waitForLoadState("networkidle");

  // Click "New Board" — may be hidden on mobile behind hamburger
  const newBoardBtn = page.getByRole("button", { name: "New Board" });
  if (!(await newBoardBtn.isVisible())) {
    // On mobile, the button might be a link not a button — try navigating directly
    await page.goto("/boards/new");
  } else {
    await newBoardBtn.click();
  }
  await page.waitForLoadState("networkidle");

  await page.getByPlaceholder("Board title...").fill(title);
  await page.locator('button[type="submit"]').click();

  // Wait for navigation to the board detail page
  await expect(
    page.getByRole("heading", { name: title, level: 1 }),
  ).toBeVisible({ timeout: 10000 });
  lastBoardUrl = page.url();
});

when(
  "I add a card {string} in {string}",
  async ({ page }, text: string, columnTitle: string) => {
    // Find the column by its h2 heading, then scope to the parent div
    const columnHeading = page.getByRole("heading", {
      name: columnTitle,
      level: 2,
    });
    const column = page
      .locator("div", { has: columnHeading })
      .first();

    await column.getByPlaceholder("Add a card...").fill(text);
    await column.getByRole("button", { name: "Add" }).click();

    // Wait for the card text to appear
    await expect(page.getByText(text)).toBeVisible({ timeout: 5000 });
  },
);

when("I vote on the card {string}", async ({ page }, text: string) => {
  // Find the card containing the text, then click the vote button (has a number)
  const cardEl = page.locator("[class*='card']", { hasText: text }).first();
  const voteBtn = cardEl.locator("button").first();
  await voteBtn.click();
  await page.waitForLoadState("networkidle");
});

when("I close the board", async ({ page }) => {
  await page.getByRole("button", { name: "Close Board" }).click();
  await page.waitForLoadState("networkidle");
});

when("I delete the card {string}", async ({ page }, text: string) => {
  const cardEl = page.locator("[class*='card']", { hasText: text }).first();
  // Delete button is the last button in the card (Trash icon)
  const deleteBtn = cardEl.locator("button").last();
  await deleteBtn.click();
  // Wait for removal
  await expect(page.getByText(text)).not.toBeVisible({ timeout: 5000 });
});

when("I navigate to the last board URL", async ({ page }) => {
  if (!lastBoardUrl) throw new Error("No board URL stored");
  const boardPath = new URL(lastBoardUrl).pathname;
  await page.goto(boardPath);
  await page.waitForLoadState("networkidle");
});

then(
  "the card {string} should show {int} vote(s)",
  async ({ page }, text: string, count: number) => {
    const cardEl = page.locator("[class*='card']", { hasText: text }).first();
    await expect(
      cardEl.getByRole("button", { name: String(count) }),
    ).toBeVisible({ timeout: 5000 });
  },
);

then(
  "the card {string} should show {int} votes",
  async ({ page }, text: string, count: number) => {
    const cardEl = page.locator("[class*='card']", { hasText: text }).first();
    await expect(
      cardEl.getByRole("button", { name: String(count) }),
    ).toBeVisible({ timeout: 5000 });
  },
);

then("the add card forms should be hidden", async ({ page }) => {
  await expect(page.getByPlaceholder("Add a card...").first()).not.toBeVisible();
});
```

- [ ] **Step 3: Generate BDD tests and verify**

```bash
cd e2e && pnpm exec bddgen && cd ..
make check
```

Expected: `bddgen` creates files in `e2e/.features-gen/`. `make check` passes.

- [ ] **Step 4: Commit**

```bash
git add e2e/features/boards.feature e2e/steps/boards.ts e2e/.features-gen/
git commit -m "feat: add BDD scenarios and step definitions for retro boards"
```

---

## Orchestrator Responsibilities

These actions are performed by the orchestrator between or after tasks. They are NOT delegated to subagents.

### After Task 1: Verify db-push
If the subagent ran `make db-push` successfully, skip. Otherwise:
```bash
make db-push
```

### After Task 3: Route Tree Regeneration + Cast Cleanup

1. **Regenerate route tree:**
```bash
# Start dev server briefly to trigger route tree generation
cd apps/web && npx tsr generate 2>/dev/null || (cd ../.. && timeout 10 make dev &>/dev/null & sleep 5 && kill %1 2>/dev/null)
cd ../..
```

2. **Remove `as string` casts** from the 3 route files and navbar:
   - `apps/web/src/routes/_authenticated/boards/index.tsx` — remove `as string` from Link `to` props
   - `apps/web/src/routes/_authenticated/boards/new.tsx` — remove `as string` from navigate `to`
   - `apps/web/src/routes/_authenticated/boards/$boardId.tsx` — remove `as string` from Link `to` props

3. **Verify and commit:**
```bash
make check
git add apps/web/src/routeTree.gen.ts apps/web/src/routes/_authenticated/boards/
git commit -m "chore: regenerate route tree and remove temporary type casts"
```

### After Task 4: Run BDD Tests
```bash
make test
```

If tests fail, diagnose and fix locator issues inline or dispatch Task 5 (BDD fix pass). Common fixes:
- Column locator scoping (nested div matching)
- Vote button name matching (number vs text)
- Mobile hamburger menu interactions
- Timing issues (add explicit waits)

### Final Quality Gate
```bash
make check && make test
```

Both must pass before claiming done.
