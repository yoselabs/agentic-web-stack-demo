# Retro Board R5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Team Retrospective Board feature exercising all template layers — Prisma relations, tRPC services+routers, optimistic mutations, parameterized SSR routes, auth guards, playwright-bdd.

**Architecture:** 2 mega-tasks. Task 1 builds the full backend (schema, services, routers). Task 2 builds the full frontend (hooks, routes, navbar, BDD). Services layer separates business logic from router wiring. Hook extraction keeps routes as thin shells.

**Tech Stack:** Prisma (schema + enums), tRPC (protectedProcedure), Zod (input validation), TanStack Router (file-based routes), TanStack React Query (optimistic updates), shadcn/ui (Badge, Button, Input, Card), playwright-bdd (Gherkin + step definitions).

**Design Spec:** `docs/superpowers/specs/2026-04-13-retro-board-r5-design.md`

---

### Task 1: Backend — Schema + Services + Routers

**Files:**
- Create: `packages/db/prisma/schema/board.prisma`
- Modify: `packages/db/prisma/schema/auth.prisma` (add reverse relations to User)
- Create: `packages/api/src/services/board.ts`
- Create: `packages/api/src/services/card.ts`
- Create: `packages/api/src/routers/board.ts`
- Create: `packages/api/src/routers/card.ts`
- Modify: `packages/api/src/router.ts` (register new routers)

- [ ] **Step 1: Create Prisma schema for Board, Card, Vote**

Create `packages/db/prisma/schema/board.prisma`:

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

- [ ] **Step 2: Add reverse relations to User model**

In `packages/db/prisma/schema/auth.prisma`, add three relation fields to the User model, after the existing `todos Todo[]` line:

```prisma
  boards   Board[]
  cards    Card[]
  votes    Vote[]
```

The User model's relation block should now end with:

```prisma
  sessions Session[]
  accounts Account[]
  todos    Todo[]
  boards   Board[]
  cards    Card[]
  votes    Vote[]
```

- [ ] **Step 3: Push schema to database**

Run: `make db-push`

Expected: Prisma generates client with Board, Card, Vote models. No errors.

- [ ] **Step 4: Create board service**

Create `packages/api/src/services/board.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@project/db";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function listBoards(db: DbClient, userId: string) {
  return db.board.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { cards: true } } },
  });
}

export async function createBoard(
  db: DbClient,
  userId: string,
  title: string,
) {
  return db.board.create({
    data: { title, userId },
  });
}

export async function getBoard(
  db: DbClient,
  userId: string,
  boardId: string,
) {
  const board = await db.board.findFirst({
    where: { id: boardId, userId },
    include: {
      cards: {
        include: { votes: true },
        orderBy: { createdAt: "asc" },
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
      voteCount: card.votes.length,
      hasVoted: card.votes.some((v) => v.userId === userId),
      votes: undefined,
    })),
  };
}

export async function closeBoard(
  db: DbClient,
  userId: string,
  boardId: string,
) {
  const board = await db.board.findFirst({
    where: { id: boardId, userId },
  });

  if (!board) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return db.board.update({
    where: { id: boardId },
    data: { status: "CLOSED" },
  });
}
```

- [ ] **Step 5: Create card service**

Create `packages/api/src/services/card.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import type { CardCategory, Prisma, PrismaClient } from "@project/db";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function createCard(
  db: DbClient,
  userId: string,
  boardId: string,
  text: string,
  category: CardCategory,
) {
  const board = await db.board.findFirst({
    where: { id: boardId, userId, status: "OPEN" },
  });

  if (!board) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return db.card.create({
    data: { text, category, boardId, userId },
  });
}

export async function deleteCard(
  db: DbClient,
  userId: string,
  cardId: string,
) {
  const card = await db.card.findFirst({
    where: { id: cardId, userId },
    include: { board: true },
  });

  if (!card || card.board.status !== "OPEN") {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return db.card.delete({ where: { id: cardId } });
}

export async function toggleVote(
  db: DbClient,
  userId: string,
  cardId: string,
) {
  const card = await db.card.findFirst({
    where: { id: cardId },
    include: { board: true },
  });

  if (!card || card.board.userId !== userId || card.board.status !== "OPEN") {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  const existing = await db.vote.findUnique({
    where: { cardId_userId: { cardId, userId } },
  });

  if (existing) {
    await db.vote.delete({ where: { id: existing.id } });
    return { voted: false };
  }

  await db.vote.create({ data: { cardId, userId } });
  return { voted: true };
}
```

- [ ] **Step 6: Create board router**

Create `packages/api/src/routers/board.ts`:

```typescript
import { z } from "zod";
import { closeBoard, createBoard, getBoard, listBoards } from "../services/board.js";
import { protectedProcedure, router } from "../trpc.js";

export const boardRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    return listBoards(ctx.db, ctx.session.user.id);
  }),
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(200) }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        createBoard(tx, ctx.session.user.id, input.title),
      );
    }),
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return getBoard(ctx.db, ctx.session.user.id, input.id);
    }),
  close: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        closeBoard(tx, ctx.session.user.id, input.id),
      );
    }),
});
```

- [ ] **Step 7: Create card router**

Create `packages/api/src/routers/card.ts`:

```typescript
import { z } from "zod";
import { createCard, deleteCard, toggleVote } from "../services/card.js";
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
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        createCard(
          tx,
          ctx.session.user.id,
          input.boardId,
          input.text,
          input.category,
        ),
      );
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        deleteCard(tx, ctx.session.user.id, input.id),
      );
    }),
  vote: router({
    toggle: protectedProcedure
      .input(z.object({ cardId: z.string() }))
      .mutation(({ ctx, input }) => {
        return ctx.db.$transaction((tx) =>
          toggleVote(tx, ctx.session.user.id, input.cardId),
        );
      }),
  }),
});
```

- [ ] **Step 8: Register routers in appRouter**

Modify `packages/api/src/router.ts`. Add imports at the top:

```typescript
import { boardRouter } from "./routers/board.js";
import { cardRouter } from "./routers/card.js";
```

Add to the `appRouter` object, after the `todo: todoRouter` line:

```typescript
  board: boardRouter,
  card: cardRouter,
```

The full file should be:

```typescript
import { boardRouter } from "./routers/board.js";
import { cardRouter } from "./routers/card.js";
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
  card: cardRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 9: Run quality checks**

Run: `make check`

Expected: 13/13 quality gates pass + typecheck clean.

- [ ] **Step 10: Commit**

```bash
git add packages/db/prisma/schema/board.prisma packages/db/prisma/schema/auth.prisma packages/api/src/services/board.ts packages/api/src/services/card.ts packages/api/src/routers/board.ts packages/api/src/routers/card.ts packages/api/src/router.ts
git commit -m "feat: add retro board backend — schema, services, routers"
```

---

### Task 2: Frontend — Hooks + Routes + Navbar + BDD

**Files:**
- Create: `apps/web/src/features/board/use-board-list.ts`
- Create: `apps/web/src/features/board/use-board-detail.ts`
- Create: `apps/web/src/routes/_authenticated/boards/index.tsx`
- Create: `apps/web/src/routes/_authenticated/boards/new.tsx`
- Create: `apps/web/src/routes/_authenticated/boards/$boardId.tsx`
- Modify: `apps/web/src/widgets/navbar.tsx` (add Boards link)
- Create: `e2e/features/boards.feature`
- Create: `e2e/steps/boards.ts`

**Prerequisites (run before starting):**
- Task 1 must be complete (backend exists)
- Install Badge component: `pnpm dlx shadcn@latest add badge`

- [ ] **Step 1: Install Badge component**

Run: `pnpm dlx shadcn@latest add badge`

Expected: `packages/ui/src/components/badge.tsx` created.

- [ ] **Step 2: Create board list hook**

Create `apps/web/src/features/board/use-board-list.ts`:

```typescript
import type { AppRouter } from "@project/api";
import { type QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

export function useBoardList(
  trpc: TRPCOptionsProxy<AppRouter>,
  queryClient: QueryClient,
) {
  const [newTitle, setNewTitle] = useState("");
  const navigate = useNavigate();

  const boards = useQuery(trpc.board.list.queryOptions());

  const createBoard = useMutation(
    trpc.board.create.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries(trpc.board.list.queryFilter());
        setNewTitle("");
        navigate({ to: "/boards/$boardId", params: { boardId: data.id } });
      },
      onError: () => toast.error("Failed to create board"),
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createBoard.mutate({ title: newTitle.trim() });
  };

  return {
    boards,
    newTitle,
    setNewTitle,
    createBoard,
    handleSubmit,
  };
}
```

- [ ] **Step 3: Create board detail hook**

Create `apps/web/src/features/board/use-board-detail.ts`:

```typescript
import type { AppRouter, inferRouterOutputs } from "@project/api";
import { type QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

type RouterOutput = inferRouterOutputs<AppRouter>;
type BoardData = RouterOutput["board"]["get"];
type CardCategory = "WENT_WELL" | "TO_IMPROVE" | "ACTION_ITEM";

export function useBoardDetail(
  trpc: TRPCOptionsProxy<AppRouter>,
  queryClient: QueryClient,
  boardId: string,
) {
  const queryOptions = trpc.board.get.queryOptions({ id: boardId });

  const board = useQuery(queryOptions);

  const createCard = useMutation(
    trpc.card.create.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(trpc.board.get.queryFilter({ id: boardId }));
        const previous = queryClient.getQueryData<BoardData>(queryOptions.queryKey);
        queryClient.setQueryData<BoardData>(queryOptions.queryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            cards: [
              ...old.cards,
              {
                id: `temp-${Date.now()}`,
                text: input.text,
                category: input.category as CardCategory,
                boardId,
                userId: old.userId,
                createdAt: new Date().toISOString(),
                voteCount: 0,
                hasVoted: false,
              },
            ],
          };
        });
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData<BoardData>(queryOptions.queryKey, context.previous);
        }
        toast.error("Failed to add card");
      },
      onSettled: () => {
        queryClient.invalidateQueries(trpc.board.get.queryFilter({ id: boardId }));
      },
    }),
  );

  const deleteCard = useMutation(
    trpc.card.delete.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(trpc.board.get.queryFilter({ id: boardId }));
        const previous = queryClient.getQueryData<BoardData>(queryOptions.queryKey);
        queryClient.setQueryData<BoardData>(queryOptions.queryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            cards: old.cards.filter((c) => c.id !== input.id),
          };
        });
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData<BoardData>(queryOptions.queryKey, context.previous);
        }
        toast.error("Failed to delete card");
      },
      onSettled: () => {
        queryClient.invalidateQueries(trpc.board.get.queryFilter({ id: boardId }));
      },
    }),
  );

  const toggleVote = useMutation(
    trpc.card.vote.toggle.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(trpc.board.get.queryFilter({ id: boardId }));
        const previous = queryClient.getQueryData<BoardData>(queryOptions.queryKey);
        queryClient.setQueryData<BoardData>(queryOptions.queryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            cards: old.cards.map((c) =>
              c.id === input.cardId
                ? {
                    ...c,
                    hasVoted: !c.hasVoted,
                    voteCount: c.hasVoted ? c.voteCount - 1 : c.voteCount + 1,
                  }
                : c,
            ),
          };
        });
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          queryClient.setQueryData<BoardData>(queryOptions.queryKey, context.previous);
        }
        toast.error("Failed to update vote");
      },
      onSettled: () => {
        queryClient.invalidateQueries(trpc.board.get.queryFilter({ id: boardId }));
      },
    }),
  );

  const closeBoard = useMutation(
    trpc.board.close.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.board.get.queryFilter({ id: boardId }));
        queryClient.invalidateQueries(trpc.board.list.queryFilter());
        toast.success("Board closed");
      },
      onError: () => toast.error("Failed to close board"),
    }),
  );

  return {
    board,
    createCard,
    deleteCard,
    toggleVote,
    closeBoard,
  };
}
```

- [ ] **Step 4: Create boards list route**

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
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useBoardList } from "#/features/board/use-board-list";

export const Route = createFileRoute("/_authenticated/boards/")({
  component: BoardsPage,
});

function BoardsPage() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { boards } = useBoardList(trpc, queryClient);

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Boards</h1>
        <Button asChild>
          <Link to="/boards/new">New Board</Link>
        </Button>
      </div>

      {boards.isPending ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : boards.data?.length === 0 ? (
        <p className="text-muted-foreground">No boards yet</p>
      ) : (
        <div className="grid gap-4">
          {boards.data?.map((board) => (
            <Link
              key={board.id}
              to="/boards/$boardId"
              params={{ boardId: board.id }}
              className="block"
            >
              <Card className="hover:bg-muted/50 transition-colors">
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

- [ ] **Step 5: Create new board route**

Create `apps/web/src/routes/_authenticated/boards/new.tsx`:

```tsx
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useBoardList } from "#/features/board/use-board-list";

export const Route = createFileRoute("/_authenticated/boards/new")({
  component: NewBoardPage,
});

function NewBoardPage() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { newTitle, setNewTitle, createBoard, handleSubmit } = useBoardList(
    trpc,
    queryClient,
  );

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="text-3xl font-bold mb-6">New Board</h1>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="text"
          placeholder="Board title..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={createBoard.isPending}>
          {createBoard.isPending ? "Creating..." : "Create"}
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Create board detail route**

Create `apps/web/src/routes/_authenticated/boards/$boardId.tsx`:

```tsx
import { Badge } from "@project/ui/components/badge";
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useBoardDetail } from "#/features/board/use-board-detail";

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  component: BoardDetailPage,
});

const COLUMNS = [
  { category: "WENT_WELL" as const, title: "Went Well" },
  { category: "TO_IMPROVE" as const, title: "To Improve" },
  { category: "ACTION_ITEM" as const, title: "Action Items" },
];

function BoardDetailPage() {
  const { boardId } = Route.useParams();
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { board, createCard, deleteCard, toggleVote, closeBoard } =
    useBoardDetail(trpc, queryClient, boardId);

  if (board.isPending) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (board.error || !board.data) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <p className="text-muted-foreground">Board not found</p>
      </main>
    );
  }

  const data = board.data;
  const isClosed = data.status === "CLOSED";

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{data.title}</h1>
          {isClosed && <Badge variant="secondary">Closed</Badge>}
        </div>
        {!isClosed && (
          <Button
            variant="outline"
            onClick={() => closeBoard.mutate({ id: boardId })}
            disabled={closeBoard.isPending}
          >
            Close Board
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {COLUMNS.map((col) => (
          <BoardColumn
            key={col.category}
            title={col.title}
            category={col.category}
            cards={data.cards.filter((c) => c.category === col.category)}
            isClosed={isClosed}
            boardId={boardId}
            onCreateCard={(text) =>
              createCard.mutate({
                boardId,
                text,
                category: col.category,
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

function BoardColumn({
  title,
  cards,
  isClosed,
  onCreateCard,
  onDeleteCard,
  onToggleVote,
}: {
  title: string;
  category: string;
  cards: Array<{
    id: string;
    text: string;
    voteCount: number;
    hasVoted: boolean;
  }>;
  isClosed: boolean;
  boardId: string;
  onCreateCard: (text: string) => void;
  onDeleteCard: (id: string) => void;
  onToggleVote: (cardId: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onCreateCard(text.trim());
    setText("");
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>

      {!isClosed && (
        <form onSubmit={handleSubmit} className="flex gap-2">
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

      <div className="flex flex-col gap-2">
        {cards.map((card) => (
          <div
            key={card.id}
            className="rounded-lg border p-3 flex items-start justify-between gap-2"
          >
            <p className="text-sm flex-1">{card.text}</p>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant={card.hasVoted ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleVote(card.id)}
                disabled={isClosed}
              >
                {card.hasVoted ? "Voted" : "Vote"} ({card.voteCount})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteCard(card.id)}
                disabled={isClosed}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Add Boards link to navbar**

Modify `apps/web/src/widgets/navbar.tsx`. Add the Boards entry to the `navLinks` array:

```typescript
const navLinks = [
  { to: "/dashboard" as const, label: "Dashboard" },
  { to: "/todos" as const, label: "Todos" },
  { to: "/boards" as const, label: "Boards" },
];
```

- [ ] **Step 8: Regenerate route tree**

Run: `make routes`

Expected: `apps/web/src/routeTree.gen.ts` updated with new board routes.

- [ ] **Step 9: Run quality checks**

Run: `make check`

Expected: 13/13 quality gates pass + typecheck clean.

- [ ] **Step 10: Commit frontend**

```bash
git add apps/web/src/features/board/ apps/web/src/routes/_authenticated/boards/ apps/web/src/widgets/navbar.tsx packages/ui/src/components/badge.tsx
git commit -m "feat: add retro board frontend — hooks, routes, navbar"
```

- [ ] **Step 11: Create BDD feature file**

Create `e2e/features/boards.feature`:

```gherkin
Feature: Retro Board

  Scenario: Create a board
    Given I am signed in as "create-board@example.com"
    And I navigate to "/boards/new"
    When I fill in "Board title..." with "Sprint 42 Retro"
    And I click "Create"
    Then I should see "Sprint 42 Retro"

  Scenario: Add cards to a board
    Given I am signed in as "add-cards@example.com"
    And I have a board "Card Test Board"
    When I add a card "Great teamwork" in the "Went Well" column
    And I add a card "Slow deployments" in the "To Improve" column
    And I add a card "Automate CI" in the "Action Items" column
    Then the "Went Well" column should contain "Great teamwork"
    And the "To Improve" column should contain "Slow deployments"
    And the "Action Items" column should contain "Automate CI"

  Scenario: Vote on a card
    Given I am signed in as "vote-card@example.com"
    And I have a board "Vote Test Board"
    And I add a card "Nice work" in the "Went Well" column
    When I vote on the card "Nice work"
    Then the card "Nice work" should show "Voted (1)"
    When I vote on the card "Nice work"
    Then the card "Nice work" should show "Vote (0)"

  Scenario: Cannot interact with a closed board
    Given I am signed in as "closed-board@example.com"
    And I have a board "Closed Test Board"
    And I add a card "Before close" in the "Went Well" column
    When I click "Close Board"
    Then I should see "Closed"
    And the card form should not be visible
    And the "Vote" button for "Before close" should be disabled

  Scenario: Delete a card
    Given I am signed in as "delete-card@example.com"
    And I have a board "Delete Test Board"
    And I add a card "Remove me" in the "Went Well" column
    When I delete the card "Remove me"
    Then I should not see "Remove me"

  Scenario: Close a board
    Given I am signed in as "close-board@example.com"
    And I have a board "Close Me Board"
    When I click "Close Board"
    Then I should see "Closed"
    When I navigate to "/boards"
    Then I should see "Closed"

  Scenario: User isolation - boards are private
    Given I am signed in as "isolation-a@example.com"
    And I navigate to "/boards/new"
    And I fill in "Board title..." with "Private Board"
    And I click "Create"
    When I sign out and sign in as "isolation-b@example.com"
    And I navigate to "/boards"
    Then I should see "No boards yet"

  Scenario: Cannot access another user's board by direct URL
    Given I am signed in as "direct-url-a@example.com"
    And I navigate to "/boards/new"
    And I fill in "Board title..." with "Secret Board"
    And I click "Create"
    And I save the current URL as "boardUrl"
    When I sign out and sign in as "direct-url-b@example.com"
    And I navigate to the saved "boardUrl"
    Then I should see "Board not found"
```

- [ ] **Step 12: Create BDD step definitions**

Create `e2e/steps/boards.ts`:

```typescript
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

const savedUrls: Record<string, string> = {};

given("I have a board {string}", async ({ page }, title: string) => {
  await page.goto("/boards/new");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("Board title...").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 10000,
  });
});

when(
  "I add a card {string} in the {string} column",
  async ({ page }, text: string, columnName: string) => {
    const section = page.locator("section", {
      has: page.getByRole("heading", { name: columnName }),
    });
    await section.getByPlaceholder("Add a card...").fill(text);
    await section.getByRole("button", { name: "Add" }).click();
    await expect(section.getByText(text)).toBeVisible({ timeout: 5000 });
  },
);

when("I vote on the card {string}", async ({ page }, text: string) => {
  const card = page.locator("div.rounded-lg.border", { hasText: text });
  const voteButton = card.getByRole("button", { name: /Vote|Voted/ });
  await voteButton.click();
  await page.waitForLoadState("networkidle");
});

when("I delete the card {string}", async ({ page }, text: string) => {
  const card = page.locator("div.rounded-lg.border", { hasText: text });
  await card.getByRole("button", { name: "Delete" }).click();
  await expect(card).not.toBeVisible({ timeout: 5000 });
});

when(
  "I save the current URL as {string}",
  async ({ page }, name: string) => {
    savedUrls[name] = page.url();
  },
);

when(
  "I navigate to the saved {string}",
  async ({ page }, name: string) => {
    const url = savedUrls[name];
    if (!url) throw new Error(`No saved URL named "${name}"`);
    await page.goto(url);
    await page.waitForLoadState("networkidle");
  },
);

then(
  "the {string} column should contain {string}",
  async ({ page }, columnName: string, text: string) => {
    const section = page.locator("section", {
      has: page.getByRole("heading", { name: columnName }),
    });
    await expect(section.getByText(text)).toBeVisible({ timeout: 5000 });
  },
);

then(
  "the card {string} should show {string}",
  async ({ page }, cardText: string, buttonText: string) => {
    const card = page.locator("div.rounded-lg.border", { hasText: cardText });
    await expect(card.getByRole("button", { name: buttonText })).toBeVisible({
      timeout: 5000,
    });
  },
);

then("the card form should not be visible", async ({ page }) => {
  await expect(page.getByPlaceholder("Add a card...")).not.toBeVisible();
});

then(
  "the {string} button for {string} should be disabled",
  async ({ page }, buttonName: string, cardText: string) => {
    const card = page.locator("div.rounded-lg.border", { hasText: cardText });
    await expect(
      card.getByRole("button", { name: buttonName }),
    ).toBeDisabled();
  },
);
```

- [ ] **Step 13: Generate BDD tests**

Run: `pnpm exec bddgen`

Expected: `.features-gen/` updated with generated test files for boards.

- [ ] **Step 14: Run quality checks**

Run: `make check`

Expected: 13/13 quality gates + typecheck clean.

- [ ] **Step 15: Run BDD tests**

Run: `make test`

Expected: All board scenarios pass (8 new scenarios).

- [ ] **Step 16: Commit BDD tests**

```bash
git add e2e/features/boards.feature e2e/steps/boards.ts
git commit -m "test: add retro board BDD scenarios and step definitions"
```
