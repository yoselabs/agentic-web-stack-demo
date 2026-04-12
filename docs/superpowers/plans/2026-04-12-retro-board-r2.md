# Retro Board Implementation Plan (Round 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a team retrospective board feature with 3 Prisma models, 7 tRPC procedures, 3 UI routes, optimistic updates, and 8 BDD scenarios.

**Architecture:** Backend-first — Prisma schema, then tRPC routers (board/card/vote), then frontend routes under `/_authenticated/boards/`. BDD tests written alongside or after frontend since they exercise the full stack. Auth-gated everything, NOT_FOUND for authorization errors.

**Tech Stack:** Prisma (PostgreSQL), tRPC + Zod, TanStack Router + React Query, shadcn/ui, playwright-bdd (Gherkin)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/db/prisma/schema/board.prisma` | Board, Card, Vote models |
| `packages/api/src/routers/board.ts` | board.list, board.create, board.get, board.close |
| `packages/api/src/routers/card.ts` | card.create, card.delete |
| `packages/api/src/routers/vote.ts` | vote.toggle |
| `apps/web/src/routes/_authenticated/boards/index.tsx` | Board list page |
| `apps/web/src/routes/_authenticated/boards/new.tsx` | Create board page |
| `apps/web/src/routes/_authenticated/boards/$boardId.tsx` | Board detail page (3-column layout, cards, votes) |
| `e2e/features/boards.feature` | 8 BDD scenarios |
| `e2e/steps/boards.ts` | Board-specific step definitions |

### Modified Files

| File | Change |
|------|--------|
| `packages/db/prisma/schema/auth.prisma` | Add `boards Board[]`, `cards Card[]`, `votes Vote[]` relations to User |
| `packages/api/src/router.ts` | Mount `board`, `card`, `vote` routers |
| `apps/web/src/widgets/navbar.tsx` | Add "Boards" link to navLinks |

---

### Task 1: Prisma Schema — Board, Card, Vote Models

**Files:**
- Create: `packages/db/prisma/schema/board.prisma`
- Modify: `packages/db/prisma/schema/auth.prisma`

- [ ] **Step 1: Create board.prisma with all three models**

```prisma
// Application owned — full control.

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

- [ ] **Step 2: Add reverse relations to User in auth.prisma**

Add these three lines after the existing `todos Todo[]` relation in the User model:

```prisma
  boards Board[]
  cards  Card[]
  votes  Vote[]
```

The full User model should look like:

```prisma
model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions Session[]
  accounts Account[]
  todos    Todo[]
  boards   Board[]
  cards    Card[]
  votes    Vote[]
}
```

- [ ] **Step 3: Push schema and regenerate client**

Run: `make db-push`
Expected: Schema pushed successfully, Prisma client regenerated.

- [ ] **Step 4: Verify types compile**

Run: `make check`
Expected: All 13 lint checks pass, typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema/board.prisma packages/db/prisma/schema/auth.prisma
git commit -m "feat: add Board, Card, Vote Prisma models with enums and relations"
```

---

### Task 2: Board tRPC Router — list, create, get, close

**Files:**
- Create: `packages/api/src/routers/board.ts`
- Modify: `packages/api/src/router.ts`

- [ ] **Step 1: Create board router with all 4 procedures**

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
      include: {
        _count: { select: { cards: true } },
      },
    });
  }),

  create: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.board.create({
        data: {
          title: input.title,
          userId: ctx.session.user.id,
        },
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
            },
          },
        },
      });

      if (!board) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const userId = ctx.session.user.id;
      const cards = board.cards.map((card) => ({
        id: card.id,
        text: card.text,
        category: card.category,
        boardId: card.boardId,
        userId: card.userId,
        createdAt: card.createdAt,
        voteCount: card.votes.length,
        votedByMe: card.votes.some((v) => v.userId === userId),
      }));

      return {
        id: board.id,
        title: board.title,
        status: board.status,
        userId: board.userId,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        cards,
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

- [ ] **Step 2: Mount board router in main router**

Edit `packages/api/src/router.ts` — add import and mount:

```typescript
import { boardRouter } from "./routers/board.js";
import { todoRouter } from "./routers/todo.js";
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
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: Verify types compile**

Run: `make check`
Expected: All 13 lint checks pass, typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/board.ts packages/api/src/router.ts
git commit -m "feat: add board tRPC router (list, create, get, close)"
```

---

### Task 3: Card tRPC Router — create, delete

**Files:**
- Create: `packages/api/src/routers/card.ts`
- Modify: `packages/api/src/router.ts`

- [ ] **Step 1: Create card router**

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
      // Verify board exists, belongs to user, and is open
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

      return ctx.db.card.delete({
        where: { id: input.id },
      });
    }),
});
```

- [ ] **Step 2: Mount card router in main router**

Add to `packages/api/src/router.ts`:

```typescript
import { cardRouter } from "./routers/card.js";
```

And in the `appRouter` object:

```typescript
  card: cardRouter,
```

- [ ] **Step 3: Verify types compile**

Run: `make check`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/card.ts packages/api/src/router.ts
git commit -m "feat: add card tRPC router (create, delete)"
```

---

### Task 4: Vote tRPC Router — toggle

**Files:**
- Create: `packages/api/src/routers/vote.ts`
- Modify: `packages/api/src/router.ts`

- [ ] **Step 1: Create vote router**

Create `packages/api/src/routers/vote.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const voteRouter = router({
  toggle: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify card exists on a board owned by user
      const card = await ctx.db.card.findFirst({
        where: {
          id: input.cardId,
          board: { userId: ctx.session.user.id },
        },
      });

      if (!card) {
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
        data: {
          cardId: input.cardId,
          userId: ctx.session.user.id,
        },
      });
      return { voted: true };
    }),
});
```

- [ ] **Step 2: Mount vote router in main router**

Add to `packages/api/src/router.ts`:

```typescript
import { voteRouter } from "./routers/vote.js";
```

And in the `appRouter` object:

```typescript
  vote: voteRouter,
```

The final `packages/api/src/router.ts` should be:

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

- [ ] **Step 3: Verify types compile**

Run: `make check`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/vote.ts packages/api/src/router.ts
git commit -m "feat: add vote tRPC router (toggle)"
```

---

### Task 5: Board List Page (`/boards`)

**Files:**
- Create: `apps/web/src/routes/_authenticated/boards/index.tsx`
- Modify: `apps/web/src/widgets/navbar.tsx`

**Important:** Before creating route files, run `make dev` in the background so the route tree auto-regenerates. If `make dev` is already running, that's fine. After creating each route file, the route tree regenerates automatically.

- [ ] **Step 1: Add Boards link to navbar**

Edit `apps/web/src/widgets/navbar.tsx` — update the `navLinks` array:

```typescript
const navLinks = [
  { to: "/dashboard" as const, label: "Dashboard" },
  { to: "/todos" as const, label: "Todos" },
  { to: "/boards" as const, label: "Boards" },
];
```

Note: Use `as const` on the `to` value. If the route doesn't exist yet in `routeTree.gen.ts`, you may need `as string` temporarily — but since we're creating the route file next, this should resolve after regeneration.

- [ ] **Step 2: Create the boards list page**

Create `apps/web/src/routes/_authenticated/boards/index.tsx`:

```tsx
import { Button } from "@project/ui/components/button";
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
        <h1 className="text-3xl font-bold">Retro Boards</h1>
        <Link to="/boards/new">
          <Button>New Board</Button>
        </Link>
      </div>

      {boards.isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : boards.data?.length === 0 ? (
        <p className="text-muted-foreground">
          No boards yet. Create your first retro board!
        </p>
      ) : (
        <div className="space-y-3">
          {boards.data?.map((board) => (
            <Link
              key={board.id}
              to="/boards/$boardId"
              params={{ boardId: board.id }}
              className="block border rounded-lg p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{board.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {board._count.cards} cards &middot;{" "}
                    {new Date(board.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    board.status === "OPEN"
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {board.status === "OPEN" ? "Open" : "Closed"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Ensure route tree regenerates**

If `make dev` is running, the route tree regenerates automatically when the file is saved. If not, run `make dev` briefly, wait for the route tree to regenerate, then stop it.

- [ ] **Step 4: Verify types compile**

Run: `make check`
Expected: Pass. If the `Link to="/boards"` in navbar fails typecheck because the route tree hasn't regenerated, cast to `as string` temporarily and remove once `make dev` regenerates.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_authenticated/boards/index.tsx apps/web/src/widgets/navbar.tsx
git commit -m "feat: add board list page with status badges and card counts"
```

---

### Task 6: Create Board Page (`/boards/new`)

**Files:**
- Create: `apps/web/src/routes/_authenticated/boards/new.tsx`

- [ ] **Step 1: Create the new board page**

Create `apps/web/src/routes/_authenticated/boards/new.tsx`:

```tsx
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { Label } from "@project/ui/components/label";
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
        navigate({ to: "/boards/$boardId", params: { boardId: board.id } });
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
      <h1 className="text-3xl font-bold mb-6">New Retro Board</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="title">Board Title</Label>
          <Input
            id="title"
            type="text"
            placeholder="Sprint 42 Retro"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </div>
        <Button type="submit" disabled={createBoard.isPending || !title.trim()}>
          {createBoard.isPending ? "Creating..." : "Create Board"}
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `make check`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/_authenticated/boards/new.tsx
git commit -m "feat: add create board page"
```

---

### Task 7: Board Detail Page (`/boards/$boardId`)

**Files:**
- Create: `apps/web/src/routes/_authenticated/boards/$boardId.tsx`

This is the largest UI task — 3-column layout with cards, voting, optimistic updates.

- [ ] **Step 1: Create the board detail page**

Create `apps/web/src/routes/_authenticated/boards/$boardId.tsx`:

```tsx
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  component: BoardDetailPage,
});

type CardCategory = "WENT_WELL" | "TO_IMPROVE" | "ACTION_ITEM";

const CATEGORIES: { key: CardCategory; label: string; color: string }[] = [
  {
    key: "WENT_WELL",
    label: "Went Well",
    color: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950",
  },
  {
    key: "TO_IMPROVE",
    label: "To Improve",
    color: "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950",
  },
  {
    key: "ACTION_ITEM",
    label: "Action Items",
    color: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950",
  },
];

function BoardDetailPage() {
  const { boardId } = Route.useParams();
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();

  const boardQueryOptions = trpc.board.get.queryOptions({ id: boardId });
  const board = useQuery(boardQueryOptions);

  const createCard = useMutation(
    trpc.card.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(boardQueryOptions);
      },
      onError: () => toast.error("Failed to add card"),
    }),
  );

  const deleteCard = useMutation(
    trpc.card.delete.mutationOptions({
      onMutate: async (variables) => {
        await queryClient.cancelQueries(boardQueryOptions);
        const previous = queryClient.getQueryData(boardQueryOptions.queryKey);
        queryClient.setQueryData(boardQueryOptions.queryKey, (old: typeof previous) => {
          if (!old) return old;
          return { ...old, cards: old.cards.filter((c) => c.id !== variables.id) };
        });
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(boardQueryOptions.queryKey, context.previous);
        }
        toast.error("Failed to delete card");
      },
      onSettled: () => {
        queryClient.invalidateQueries(boardQueryOptions);
      },
    }),
  );

  const toggleVote = useMutation(
    trpc.vote.toggle.mutationOptions({
      onMutate: async (variables) => {
        await queryClient.cancelQueries(boardQueryOptions);
        const previous = queryClient.getQueryData(boardQueryOptions.queryKey);
        queryClient.setQueryData(boardQueryOptions.queryKey, (old: typeof previous) => {
          if (!old) return old;
          return {
            ...old,
            cards: old.cards.map((c) =>
              c.id === variables.cardId
                ? {
                    ...c,
                    votedByMe: !c.votedByMe,
                    voteCount: c.votedByMe ? c.voteCount - 1 : c.voteCount + 1,
                  }
                : c,
            ),
          };
        });
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(boardQueryOptions.queryKey, context.previous);
        }
        toast.error("Failed to toggle vote");
      },
      onSettled: () => {
        queryClient.invalidateQueries(boardQueryOptions);
      },
    }),
  );

  const closeBoard = useMutation(
    trpc.board.close.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(boardQueryOptions);
        toast.success("Board closed");
      },
      onError: () => toast.error("Failed to close board"),
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
        <h1 className="text-2xl font-bold mb-4">Board not found</h1>
        <Link to="/boards" className="text-blue-600 hover:underline">
          Back to boards
        </Link>
      </main>
    );
  }

  const isOpen = board.data.status === "OPEN";

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{board.data.title}</h1>
          <span
            className={`text-xs font-medium px-2 py-1 rounded-full ${
              isOpen
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {isOpen ? "Open" : "Closed"}
          </span>
        </div>
        <div className="flex gap-2">
          <Link to="/boards">
            <Button variant="outline">Back</Button>
          </Link>
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CATEGORIES.map((cat) => (
          <CategoryColumn
            key={cat.key}
            category={cat}
            cards={board.data.cards.filter((c) => c.category === cat.key)}
            isOpen={isOpen}
            boardId={boardId}
            onCreateCard={(text) =>
              createCard.mutate({
                boardId,
                text,
                category: cat.key,
              })
            }
            onDeleteCard={(id) => deleteCard.mutate({ id })}
            onToggleVote={(cardId) => toggleVote.mutate({ cardId })}
          />
        ))}
      </div>
    </main>
  );
}

function CategoryColumn({
  category,
  cards,
  isOpen,
  boardId,
  onCreateCard,
  onDeleteCard,
  onToggleVote,
}: {
  category: (typeof CATEGORIES)[number];
  cards: Array<{
    id: string;
    text: string;
    category: string;
    userId: string;
    voteCount: number;
    votedByMe: boolean;
  }>;
  isOpen: boolean;
  boardId: string;
  onCreateCard: (text: string) => void;
  onDeleteCard: (id: string) => void;
  onToggleVote: (cardId: string) => void;
}) {
  const [newText, setNewText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    onCreateCard(newText.trim());
    setNewText("");
  };

  return (
    <div className={`border rounded-lg p-4 ${category.color}`}>
      <h2 className="text-lg font-semibold mb-3">{category.label}</h2>

      {isOpen && (
        <form onSubmit={handleSubmit} className="mb-3">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder={`Add ${category.label.toLowerCase()}...`}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              maxLength={500}
              className="flex-1 bg-white dark:bg-gray-900"
            />
            <Button type="submit" size="sm">
              Add
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {cards.map((card) => (
          <div
            key={card.id}
            className="bg-white dark:bg-gray-900 border rounded p-3 flex items-start justify-between gap-2"
          >
            <p className="text-sm flex-1">{card.text}</p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onToggleVote(card.id)}
                disabled={!isOpen}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                  card.votedByMe
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <ThumbsUp className="h-3 w-3" />
                {card.voteCount}
              </button>
              {isOpen && (
                <button
                  type="button"
                  onClick={() => onDeleteCard(card.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ensure route tree regenerates**

With `make dev` running, the route tree regenerates automatically. If not running, start it briefly.

- [ ] **Step 3: Verify types compile**

Run: `make check`
Expected: Pass. Pay attention to:
- `Link to="/boards/$boardId" params={{ boardId: ... }}` must match the route tree
- The `as string` cast may be needed temporarily for Link `to` props if the route tree hasn't regenerated yet

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_authenticated/boards/$boardId.tsx
git commit -m "feat: add board detail page with 3-column layout, voting, and optimistic updates"
```

---

### Task 8: BDD Feature File — 8 Gherkin Scenarios

**Files:**
- Create: `e2e/features/boards.feature`

- [ ] **Step 1: Write the Gherkin spec**

Create `e2e/features/boards.feature`:

```gherkin
Feature: Retro Board Management

  Scenario: Create a board
    Given I am signed in as "create-board@example.com"
    And I navigate to "/boards"
    When I click "New Board"
    And I fill in "Board Title" with "Sprint 42 Retro"
    And I click "Create Board"
    Then I should see "Sprint 42 Retro"

  Scenario: Add cards to a board
    Given I am signed in as "add-cards@example.com"
    And I have a board "Card Test Board"
    When I add a card "Great teamwork" in "Went Well"
    And I add a card "Slow deployments" in "To Improve"
    And I add a card "Fix CI pipeline" in "Action Items"
    Then I should see "Great teamwork"
    And I should see "Slow deployments"
    And I should see "Fix CI pipeline"

  Scenario: Vote on a card
    Given I am signed in as "vote-card@example.com"
    And I have a board "Vote Test Board"
    And I add a card "Good communication" in "Went Well"
    When I vote on card "Good communication"
    Then card "Good communication" should have 1 vote
    When I vote on card "Good communication"
    Then card "Good communication" should have 0 votes

  Scenario: Delete a card
    Given I am signed in as "delete-card@example.com"
    And I have a board "Delete Card Board"
    And I add a card "Remove me" in "To Improve"
    When I delete card "Remove me"
    Then I should not see "Remove me"

  Scenario: Close a board
    Given I am signed in as "close-board@example.com"
    And I have a board "Close Test Board"
    When I click "Close Board"
    Then I should see "Closed"

  Scenario: Cannot interact with a closed board
    Given I am signed in as "closed-interact@example.com"
    And I have a board "Closed Interact Board"
    When I click "Close Board"
    Then I should see "Closed"
    And the add card inputs should not be visible

  Scenario: User isolation — boards are private
    Given I am signed in as "private-boards@example.com"
    And I navigate to "/boards"
    When I click "New Board"
    And I fill in "Board Title" with "My Private Board"
    And I click "Create Board"
    And I navigate to "/boards"
    Then I should see "My Private Board"
    When I sign out and sign in as "other-boards-user@example.com"
    And I navigate to "/boards"
    Then I should not see "My Private Board"

  Scenario: Cannot access another user's board by direct URL
    Given I am signed in as "owner-direct@example.com"
    And I have a board "Owner Only Board"
    When I sign out and sign in as "intruder-direct@example.com"
    And I navigate to the board "Owner Only Board" by URL
    Then I should see "Board not found"
```

- [ ] **Step 2: Generate test files from feature spec**

Run: `pnpm exec bddgen`
Expected: Generates test files in `e2e/.features-gen/`.

- [ ] **Step 3: Commit**

```bash
git add e2e/features/boards.feature
git commit -m "feat: add 8 BDD scenarios for retro board feature"
```

---

### Task 9: BDD Step Definitions

**Files:**
- Create: `e2e/steps/boards.ts`

These step definitions support all 8 scenarios. They reuse existing steps from `auth.ts` (sign in, navigate, fill in, click, should see, should not see, sign out and sign in as).

- [ ] **Step 1: Write board step definitions**

Create `e2e/steps/boards.ts`:

```typescript
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

// Store the last board URL for direct-URL-access scenario
let lastBoardUrl = "";

given("I have a board {string}", async ({ page }, title: string) => {
  await page.goto("/boards");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "New Board" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Board Title").fill(title);
  await page.locator('button[type="submit"]').click();
  // Wait for navigation to the board detail page
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 10000,
  });
  // Store the URL for direct access scenario
  lastBoardUrl = page.url();
});

when(
  "I add a card {string} in {string}",
  async ({ page }, text: string, columnLabel: string) => {
    // Find the column by its heading, then find the input within it
    const column = page.locator("div", {
      has: page.getByRole("heading", { name: columnLabel }),
    });
    const input = column.getByPlaceholder(new RegExp(`add ${columnLabel.toLowerCase()}`, "i"));
    await input.fill(text);
    await column.getByRole("button", { name: "Add" }).click();
    // Wait for card to appear
    await expect(page.getByText(text)).toBeVisible({ timeout: 5000 });
  },
);

when("I vote on card {string}", async ({ page }, text: string) => {
  const card = page.locator("div", { hasText: text }).filter({
    has: page.locator("button", { has: page.locator("svg") }),
  });
  // Click the vote button (the one with ThumbsUp icon and a number)
  await card.locator("button").filter({ has: page.locator("svg") }).first().click();
  await page.waitForLoadState("networkidle");
});

when("I delete card {string}", async ({ page }, text: string) => {
  const card = page.locator("div", { hasText: text }).filter({
    has: page.locator("button", { has: page.locator("svg") }),
  });
  // Click the delete button (Trash2 icon) — it's the second button with an svg
  const deleteBtn = card
    .locator("button")
    .filter({ has: page.locator("svg") })
    .last();
  await deleteBtn.click();
  await expect(page.getByText(text)).not.toBeVisible({ timeout: 5000 });
});

when(
  "I navigate to the board {string} by URL",
  async ({ page }, _title: string) => {
    // Use the stored URL from the board creation step
    if (lastBoardUrl) {
      const boardPath = new URL(lastBoardUrl).pathname;
      await page.goto(boardPath);
    } else {
      // Fallback — navigate to a bogus board ID
      await page.goto("/boards/nonexistent-board-id");
    }
    await page.waitForLoadState("networkidle");
  },
);

then(
  "card {string} should have {int} vote(s)",
  async ({ page }, text: string, count: number) => {
    const card = page.locator("div", { hasText: text }).filter({
      has: page.locator("button", { has: page.locator("svg") }),
    });
    const voteBtn = card
      .locator("button")
      .filter({ has: page.locator("svg") })
      .first();
    await expect(voteBtn).toContainText(String(count));
  },
);

then("the add card inputs should not be visible", async ({ page }) => {
  // When a board is closed, no input fields for adding cards should be visible
  const addInputs = page.getByPlaceholder(/add .+\.\.\./i);
  await expect(addInputs).toHaveCount(0);
});
```

- [ ] **Step 2: Generate test files**

Run: `pnpm exec bddgen`
Expected: Test files regenerated with new board scenarios.

- [ ] **Step 3: Commit**

```bash
git add e2e/steps/boards.ts
git commit -m "feat: add BDD step definitions for retro board scenarios"
```

---

### Task 10: Run Full Test Suite and Fix Issues

This task runs both quality gates and BDD tests, fixing any issues.

- [ ] **Step 1: Run quality gates**

Run: `make check`
Expected: 13/13 lint checks pass, typecheck passes.

If there are failures, fix them (likely lint or type issues in the new files).

- [ ] **Step 2: Run BDD tests**

**Important:** Kill any running `make dev` before running tests — test infrastructure uses separate ports (3100/3101) but stale dev servers can interfere.

Run: `make test`
Expected: All scenarios pass (existing auth + todos + mobile-nav + new boards).

If tests fail:
- Check for timing issues — use `waitFor` / `toBeVisible` with timeout instead of `waitForTimeout`
- Check locator accuracy — the card locators may need adjustment based on actual DOM structure
- Check that step definitions match Gherkin step text exactly (including plurals like "vote(s)")

- [ ] **Step 3: Fix any failing tests**

Iterate on step definitions until all tests pass. Common fixes:
- Adjust locators if the DOM structure doesn't match expected selectors
- Add timeouts for slow operations
- Fix Gherkin text to match step patterns exactly

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve BDD test issues, all scenarios passing"
```

---

## Summary

| Task | Description | Files | Estimated Steps |
|------|-------------|-------|----------------|
| 1 | Prisma schema (Board, Card, Vote) | 2 | 5 |
| 2 | Board router (list, create, get, close) | 2 | 4 |
| 3 | Card router (create, delete) | 2 | 4 |
| 4 | Vote router (toggle) | 2 | 4 |
| 5 | Board list page + navbar link | 2 | 5 |
| 6 | Create board page | 1 | 3 |
| 7 | Board detail page (3-column, optimistic) | 1 | 4 |
| 8 | BDD feature file (8 scenarios) | 1 | 3 |
| 9 | BDD step definitions | 1 | 3 |
| 10 | Full test suite run + fixes | varies | 4 |
