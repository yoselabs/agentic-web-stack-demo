# Retro Board R4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a team retrospective board feature (3 models, 7 tRPC procedures, 3 UI routes, 8 BDD scenarios) on the agentic-web-stack template.

**Architecture:** Prisma schema + tRPC routers batched into one task (tightly coupled). All UI pages in a second task. BDD tests isolated in a third task to avoid locator debugging cascading into UI work.

**Tech Stack:** Prisma, tRPC, TanStack Router, TanStack React Query, shadcn/ui, Playwright-BDD

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `packages/db/prisma/schema/board.prisma` | Board, Card, Vote models + enums |
| `packages/api/src/routers/board.ts` | board.list, board.create, board.get, board.close |
| `packages/api/src/routers/card.ts` | card.create, card.delete |
| `packages/api/src/routers/vote.ts` | vote.toggle |
| `apps/web/src/routes/_authenticated/boards/index.tsx` | Board list page |
| `apps/web/src/routes/_authenticated/boards/new.tsx` | Create board page |
| `apps/web/src/routes/_authenticated/boards/$boardId.tsx` | Board detail page |
| `e2e/features/boards.feature` | 8 Gherkin scenarios |
| `e2e/steps/boards.ts` | Board-specific step definitions |

### Modified files
| File | Change |
|------|--------|
| `packages/db/prisma/schema/auth.prisma` | Add `boards Board[]`, `cards Card[]`, `votes Vote[]` to User |
| `packages/api/src/router.ts` | Mount board, card, vote routers |
| `apps/web/src/widgets/navbar.tsx` | Add "Boards" nav link |

---

## Task 1: Prisma Schema + tRPC Routers

**Files:**
- Create: `packages/db/prisma/schema/board.prisma`
- Create: `packages/api/src/routers/board.ts`
- Create: `packages/api/src/routers/card.ts`
- Create: `packages/api/src/routers/vote.ts`
- Modify: `packages/db/prisma/schema/auth.prisma`
- Modify: `packages/api/src/router.ts`

- [ ] **Step 1: Create Prisma schema**

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

In `packages/db/prisma/schema/auth.prisma`, add these three lines inside the `User` model, after the existing `todos Todo[]` line:

```prisma
  boards Board[]
  cards  Card[]
  votes  Vote[]
```

The User model should end up with relations: `sessions`, `accounts`, `todos`, `boards`, `cards`, `votes`.

- [ ] **Step 3: Create board router**

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
        data: {
          title: input.title,
          userId: ctx.session.user.id,
        },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const board = await ctx.db.board.findUnique({
        where: { id: input.id, userId: ctx.session.user.id },
        include: {
          cards: {
            include: {
              _count: { select: { votes: true } },
              votes: { where: { userId: ctx.session.user.id } },
            },
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
          id: card.id,
          text: card.text,
          category: card.category,
          boardId: card.boardId,
          userId: card.userId,
          createdAt: card.createdAt,
          voteCount: card._count.votes,
          myVote: card.votes.length > 0,
        })),
      };
    }),

  close: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const board = await ctx.db.board.findUnique({
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

- [ ] **Step 4: Create card router**

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
      const board = await ctx.db.board.findUnique({
        where: { id: input.boardId, userId: ctx.session.user.id },
      });

      if (!board || board.status !== "OPEN") {
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
      const card = await ctx.db.card.findUnique({
        where: { id: input.id },
        include: { board: true },
      });

      if (!card || card.board.userId !== ctx.session.user.id || card.board.status !== "OPEN") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.db.card.delete({ where: { id: input.id } });
    }),
});
```

- [ ] **Step 5: Create vote router**

Create `packages/api/src/routers/vote.ts`:

```typescript
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const voteRouter = router({
  toggle: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const card = await ctx.db.card.findUnique({
        where: { id: input.cardId },
        include: { board: true },
      });

      if (!card || card.board.userId !== ctx.session.user.id || card.board.status !== "OPEN") {
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

- [ ] **Step 6: Mount routers in appRouter**

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

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema/board.prisma packages/db/prisma/schema/auth.prisma packages/api/src/routers/board.ts packages/api/src/routers/card.ts packages/api/src/routers/vote.ts packages/api/src/router.ts
git commit -m "feat: add board/card/vote schema and tRPC routers"
```

---

## Task 2: All UI Routes + Navbar

**Files:**
- Create: `apps/web/src/routes/_authenticated/boards/index.tsx`
- Create: `apps/web/src/routes/_authenticated/boards/new.tsx`
- Create: `apps/web/src/routes/_authenticated/boards/$boardId.tsx`
- Modify: `apps/web/src/widgets/navbar.tsx`

**Important context for this task:**
- The route tree (`apps/web/src/routeTree.gen.ts`) will NOT have the new board routes yet. Use `as string` for Link `to` props pointing to board routes. The orchestrator will regenerate the route tree after this task.
- Badge component will be available at `@project/ui/components/badge` (orchestrator installs it before this task).
- Access tRPC via `Route.useRouteContext()` which returns `{ trpc, queryClient }`.
- Use `import type` for any server-only types. Never import `appRouter` value.
- For `createFileRoute` path strings: use the route path as it appears in the file structure, e.g. `"/_authenticated/boards/"` for the index route.

- [ ] **Step 1: Create board list page**

Create `apps/web/src/routes/_authenticated/boards/index.tsx`:

```tsx
import { Badge } from "@project/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@project/ui/components/card";
import { Button } from "@project/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/boards/")({
  component: BoardsPage,
});

function BoardsPage() {
  const { trpc } = Route.useRouteContext();
  const navigate = useNavigate();
  const boards = useQuery(trpc.board.list.queryOptions());

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Boards</h1>
        <Button
          onClick={() =>
            navigate({ to: "/boards/new" as string })
          }
        >
          New Board
        </Button>
      </div>

      {boards.isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : boards.data?.length === 0 ? (
        <p className="text-muted-foreground">
          {"No boards yet \u2014 create your first one!"}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {boards.data?.map((board) => (
            <Link
              key={board.id}
              to={"/boards/$boardId" as string}
              params={{ boardId: board.id }}
              className="block"
            >
              <Card className="hover:border-foreground/20 transition-colors">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{board.title}</CardTitle>
                    <Badge
                      variant={
                        board.status === "OPEN" ? "default" : "secondary"
                      }
                    >
                      {board.status === "OPEN" ? "Open" : "Closed"}
                    </Badge>
                  </div>
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

- [ ] **Step 2: Create new board page**

Create `apps/web/src/routes/_authenticated/boards/new.tsx`:

```tsx
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/boards/new")({
  component: NewBoardPage,
});

function NewBoardPage() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");

  const createBoard = useMutation(
    trpc.board.create.mutationOptions({
      onSuccess: (board) => {
        queryClient.invalidateQueries(trpc.board.list.queryFilter());
        toast.success("Board created");
        navigate({
          to: "/boards/$boardId" as string,
          params: { boardId: board.id },
        });
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
    <main className="max-w-md mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="text-3xl font-bold mb-6">New Board</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          placeholder="Board title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" disabled={createBoard.isPending}>
          Create Board
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Create board detail page**

Create `apps/web/src/routes/_authenticated/boards/$boardId.tsx`:

```tsx
import { Badge } from "@project/ui/components/badge";
import { Button } from "@project/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ThumbsUp, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  component: BoardDetailPage,
});

type CardWithVotes = {
  id: string;
  text: string;
  category: string;
  boardId: string;
  userId: string;
  createdAt: Date;
  voteCount: number;
  myVote: boolean;
};

type BoardData = {
  id: string;
  title: string;
  status: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  cards: CardWithVotes[];
};

const COLUMNS = [
  { category: "WENT_WELL", label: "Went Well", testId: "column-went-well" },
  {
    category: "TO_IMPROVE",
    label: "To Improve",
    testId: "column-to-improve",
  },
  {
    category: "ACTION_ITEM",
    label: "Action Items",
    testId: "column-action-item",
  },
] as const;

function BoardDetailPage() {
  const { trpc } = Route.useRouteContext();
  const { boardId } = Route.useParams();
  const queryClient = useQueryClient();

  const board = useQuery(trpc.board.get.queryOptions({ id: boardId }));

  const closeBoard = useMutation(
    trpc.board.close.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.board.get.queryFilter());
        queryClient.invalidateQueries(trpc.board.list.queryFilter());
        toast.success("Board closed");
      },
      onError: () => toast.error("Failed to close board"),
    }),
  );

  const createCard = useMutation(
    trpc.card.create.mutationOptions({
      onMutate: async (newCard) => {
        await queryClient.cancelQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
        const previous = queryClient.getQueryData(
          trpc.board.get.queryOptions({ id: boardId }).queryKey,
        );
        queryClient.setQueryData(
          trpc.board.get.queryOptions({ id: boardId }).queryKey,
          (old: BoardData | undefined) => {
            if (!old) return old;
            return {
              ...old,
              cards: [
                ...old.cards,
                {
                  id: `temp-${Date.now()}`,
                  text: newCard.text,
                  category: newCard.category,
                  boardId: newCard.boardId,
                  userId: "",
                  createdAt: new Date(),
                  voteCount: 0,
                  myVote: false,
                },
              ],
            };
          },
        );
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(
            trpc.board.get.queryOptions({ id: boardId }).queryKey,
            context.previous,
          );
        }
        toast.error("Failed to add card");
      },
      onSettled: () => {
        queryClient.invalidateQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
      },
    }),
  );

  const deleteCard = useMutation(
    trpc.card.delete.mutationOptions({
      onMutate: async (deleted) => {
        await queryClient.cancelQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
        const previous = queryClient.getQueryData(
          trpc.board.get.queryOptions({ id: boardId }).queryKey,
        );
        queryClient.setQueryData(
          trpc.board.get.queryOptions({ id: boardId }).queryKey,
          (old: BoardData | undefined) => {
            if (!old) return old;
            return {
              ...old,
              cards: old.cards.filter((c) => c.id !== deleted.id),
            };
          },
        );
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(
            trpc.board.get.queryOptions({ id: boardId }).queryKey,
            context.previous,
          );
        }
        toast.error("Failed to delete card");
      },
      onSettled: () => {
        queryClient.invalidateQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
      },
    }),
  );

  const toggleVote = useMutation(
    trpc.vote.toggle.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
        const previous = queryClient.getQueryData(
          trpc.board.get.queryOptions({ id: boardId }).queryKey,
        );
        queryClient.setQueryData(
          trpc.board.get.queryOptions({ id: boardId }).queryKey,
          (old: BoardData | undefined) => {
            if (!old) return old;
            return {
              ...old,
              cards: old.cards.map((c) =>
                c.id === vars.cardId
                  ? {
                      ...c,
                      myVote: !c.myVote,
                      voteCount: c.myVote ? c.voteCount - 1 : c.voteCount + 1,
                    }
                  : c,
              ),
            };
          },
        );
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(
            trpc.board.get.queryOptions({ id: boardId }).queryKey,
            context.previous,
          );
        }
        toast.error("Failed to update vote");
      },
      onSettled: () => {
        queryClient.invalidateQueries(
          trpc.board.get.queryFilter({ id: boardId }),
        );
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
        <p className="text-muted-foreground">Board not found</p>
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
          >
            Close Board
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <Column
            key={col.category}
            testId={col.testId}
            label={col.label}
            category={col.category}
            cards={board.data.cards.filter((c) => c.category === col.category)}
            isOpen={isOpen}
            onAddCard={(text) =>
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

function Column({
  testId,
  label,
  cards,
  isOpen,
  onAddCard,
  onDeleteCard,
  onToggleVote,
}: {
  testId: string;
  label: string;
  category: string;
  cards: CardWithVotes[];
  isOpen: boolean;
  onAddCard: (text: string) => void;
  onDeleteCard: (id: string) => void;
  onToggleVote: (cardId: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAddCard(text.trim());
    setText("");
  };

  return (
    <div data-testid={testId}>
      <h2 className="text-lg font-semibold mb-4">{label}</h2>
      <div className="space-y-3">
        {cards.map((card) => (
          <div
            key={card.id}
            data-testid="card"
            className="rounded-lg border p-3 space-y-2"
          >
            <p className="text-sm">{card.text}</p>
            <div className="flex items-center justify-between">
              <button
                type="button"
                data-testid="vote-button"
                disabled={!isOpen}
                onClick={() => onToggleVote(card.id)}
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${
                  card.myVote
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <ThumbsUp className="h-3 w-3" />
                <span data-testid="vote-count">{card.voteCount}</span>
              </button>
              {isOpen && (
                <button
                  type="button"
                  data-testid="delete-button"
                  onClick={() => onDeleteCard(card.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {isOpen && (
        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <textarea
            placeholder={`Add a card to ${label}...`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[60px] resize-none"
          />
          <Button type="submit" size="sm" className="self-end">
            Add Card
          </Button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update navbar**

In `apps/web/src/widgets/navbar.tsx`, replace the `navLinks` array:

```typescript
const navLinks = [
  { to: "/dashboard" as const, label: "Dashboard" },
  { to: "/todos" as const, label: "Todos" },
  { to: "/boards" as string, label: "Boards" },
];
```

Note: `/boards` uses `as string` because the route tree hasn't been regenerated yet. The orchestrator will clean this up after route tree regen.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_authenticated/boards/index.tsx apps/web/src/routes/_authenticated/boards/new.tsx apps/web/src/routes/_authenticated/boards/\$boardId.tsx apps/web/src/widgets/navbar.tsx
git commit -m "feat: add board list, create, and detail UI pages"
```

---

## Task 3: BDD Feature + Step Definitions

**Files:**
- Create: `e2e/features/boards.feature`
- Create: `e2e/steps/boards.ts`

**Important context for this task:**
- Existing shared steps in `e2e/steps/auth.ts`: `I am signed in as {string}`, `I navigate to {string}`, `I should see {string}`, `I click {string}`, `I fill in {string} with {string}`.
- Each scenario uses a unique email to avoid DB conflicts with parallel workers.
- The `I click` step in auth.ts handles both visible buttons and buttons behind the mobile hamburger menu.
- Use `data-testid` attributes for locators: `column-went-well`, `column-to-improve`, `column-action-item`, `card`, `vote-button`, `delete-button`, `vote-count`.
- Use `page.locator('button[type="submit"]')` for form submit buttons (avoids matching other buttons).
- The `I should not see` step does NOT exist in auth.ts — define it in boards.ts.
- After creating these files, the orchestrator will run `pnpm exec bddgen` to generate test files, then `make test`.

- [ ] **Step 1: Create Gherkin feature file**

Create `e2e/features/boards.feature`:

```gherkin
Feature: Retrospective Boards

  Scenario: Create a board
    Given I am signed in as "boards-create@example.com"
    And I navigate to "/boards"
    When I click "New Board"
    And I fill in "Board title" with "Sprint 42 Retro"
    And I click "Create Board"
    Then I should see "Sprint 42 Retro"
    And I should see "Open"

  Scenario: Add cards to a board
    Given I am signed in as "boards-cards@example.com"
    And I navigate to "/boards"
    And I click "New Board"
    And I fill in "Board title" with "Cards Test Board"
    And I click "Create Board"
    When I add a card "Great teamwork" in the "Went Well" column
    And I add a card "Slow deployments" in the "To Improve" column
    And I add a card "Automate CI" in the "Action Items" column
    Then I should see card "Great teamwork" in the "Went Well" column
    And I should see card "Slow deployments" in the "To Improve" column
    And I should see card "Automate CI" in the "Action Items" column

  Scenario: Vote on a card
    Given I am signed in as "boards-vote@example.com"
    And I navigate to "/boards"
    And I click "New Board"
    And I fill in "Board title" with "Vote Test Board"
    And I click "Create Board"
    And I add a card "Nice work" in the "Went Well" column
    When I vote on card "Nice work"
    Then I should see vote count "1" on card "Nice work"
    When I vote on card "Nice work"
    Then I should see vote count "0" on card "Nice work"

  Scenario: Cannot interact with a closed board
    Given I am signed in as "boards-closed@example.com"
    And I navigate to "/boards"
    And I click "New Board"
    And I fill in "Board title" with "Closed Test Board"
    And I click "Create Board"
    And I add a card "Some thought" in the "Went Well" column
    When I close the board
    Then I should see "Closed"
    And the add card forms should be hidden
    And the vote buttons should be disabled

  Scenario: Delete a card
    Given I am signed in as "boards-delete@example.com"
    And I navigate to "/boards"
    And I click "New Board"
    And I fill in "Board title" with "Delete Test Board"
    And I click "Create Board"
    And I add a card "Remove me" in the "To Improve" column
    When I delete card "Remove me"
    Then I should not see "Remove me"

  Scenario: Close a board
    Given I am signed in as "boards-close@example.com"
    And I navigate to "/boards"
    And I click "New Board"
    And I fill in "Board title" with "Close Test Board"
    And I click "Create Board"
    When I close the board
    Then I should see "Closed"

  Scenario: User isolation - boards are private
    Given I am signed in as "boards-isolation-a@example.com"
    And I navigate to "/boards"
    And I click "New Board"
    And I fill in "Board title" with "Private Board"
    And I click "Create Board"
    And I should see "Private Board"
    When I sign out and sign in as "boards-isolation-b@example.com"
    And I navigate to "/boards"
    Then I should not see "Private Board"

  Scenario: Cannot access another user's board by direct URL
    Given I am signed in as "boards-url-a@example.com"
    And I navigate to "/boards"
    And I click "New Board"
    And I fill in "Board title" with "Secret Board"
    And I click "Create Board"
    And I save the current URL
    When I sign out and sign in as "boards-url-b@example.com"
    And I navigate to the saved URL
    Then I should see "Board not found"
```

- [ ] **Step 2: Create step definitions**

Create `e2e/steps/boards.ts`:

```typescript
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when, Then: then } = createBdd();

// Column name to data-testid mapping
function columnTestId(columnName: string): string {
  const map: Record<string, string> = {
    "Went Well": "column-went-well",
    "To Improve": "column-to-improve",
    "Action Items": "column-action-item",
  };
  const testId = map[columnName];
  if (!testId) throw new Error(`Unknown column: ${columnName}`);
  return testId;
}

// --- Board creation helpers ---

when(
  "I add a card {string} in the {string} column",
  async ({ page }, text: string, columnName: string) => {
    const column = page.locator(
      `[data-testid="${columnTestId(columnName)}"]`,
    );
    await column.locator("textarea").fill(text);
    await column.locator('button[type="submit"]').click();
    // Wait for the card to appear
    await expect(
      column.locator('[data-testid="card"]', { hasText: text }),
    ).toBeVisible({ timeout: 5000 });
  },
);

then(
  "I should see card {string} in the {string} column",
  async ({ page }, text: string, columnName: string) => {
    const column = page.locator(
      `[data-testid="${columnTestId(columnName)}"]`,
    );
    await expect(
      column.locator('[data-testid="card"]', { hasText: text }),
    ).toBeVisible({ timeout: 5000 });
  },
);

when("I vote on card {string}", async ({ page }, text: string) => {
  const card = page.locator('[data-testid="card"]', { hasText: text });
  await card.locator('[data-testid="vote-button"]').click();
  // Brief wait for optimistic update
  await page.waitForTimeout(300);
});

then(
  "I should see vote count {string} on card {string}",
  async ({ page }, count: string, text: string) => {
    const card = page.locator('[data-testid="card"]', { hasText: text });
    await expect(
      card.locator('[data-testid="vote-count"]'),
    ).toHaveText(count, { timeout: 5000 });
  },
);

when("I delete card {string}", async ({ page }, text: string) => {
  const card = page.locator('[data-testid="card"]', { hasText: text });
  await card.locator('[data-testid="delete-button"]').click();
  await card.waitFor({ state: "detached", timeout: 5000 });
});

when("I close the board", async ({ page }) => {
  await page.getByRole("button", { name: "Close Board" }).click();
  // Wait for status to update
  await expect(page.getByText("Closed")).toBeVisible({ timeout: 5000 });
});

then("the add card forms should be hidden", async ({ page }) => {
  // All textareas inside columns should be gone
  await expect(page.locator("textarea")).toHaveCount(0, { timeout: 5000 });
});

then("the vote buttons should be disabled", async ({ page }) => {
  const voteButtons = page.locator('[data-testid="vote-button"]');
  const count = await voteButtons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(voteButtons.nth(i)).toBeDisabled();
  }
});

then("I should not see {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).not.toBeVisible({ timeout: 5000 });
});

// --- URL tracking for direct URL test ---

let savedUrl = "";

given("I save the current URL", async ({ page }) => {
  savedUrl = page.url();
});

when("I navigate to the saved URL", async ({ page }) => {
  await page.goto(savedUrl);
  await page.waitForLoadState("networkidle");
});

// --- Sign out and sign in (reuse pattern from todos.ts) ---

when("I sign out and sign in as {string}", async ({ page }, email: string) => {
  // Sign out - handle mobile hamburger menu
  const signOutBtn = page.getByRole("button", { name: "Sign Out" });
  if (!(await signOutBtn.isVisible())) {
    const hamburger = page.getByRole("button", { name: "Toggle menu" });
    if (await hamburger.isVisible()) {
      await hamburger.click();
      await signOutBtn.waitFor({ state: "visible", timeout: 3000 });
    }
  }
  await signOutBtn.click();
  await page.waitForURL("**/", { timeout: 5000 });

  // Sign up as new user
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Sign Up" }).click();
  await page.getByLabel("Name").fill(email.split("@")[0]);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("testpassword123");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
});
```

- [ ] **Step 3: Commit**

```bash
git add e2e/features/boards.feature e2e/steps/boards.ts
git commit -m "feat: add BDD scenarios and step definitions for retro boards"
```

---

## Orchestrator Checklist

These steps are performed by the orchestrator between and after implementation tasks. They are NOT part of the subagent dispatches.

### After Task 1
1. `make db-push` — push schema and regenerate Prisma client
2. `make check` — verify 13/13 lint + typecheck passes

### Before Task 2
1. Install Badge component:
   ```bash
   cd packages/ui && pnpm dlx shadcn@latest add badge && cd ../..
   ```
2. Commit Badge if files changed

### After Task 2
1. Start `make dev` briefly (~5s) to regenerate route tree, then kill
2. In `apps/web/src/widgets/navbar.tsx`, change `as string` to `as const` for the `/boards` link
3. `make check` — verify passes

### After Task 3
1. Generate BDD tests:
   ```bash
   cd e2e && pnpm exec bddgen && cd ..
   ```
2. Kill any dev servers:
   ```bash
   lsof -ti :3000,:3001,:3100,:3101 | xargs kill -9 2>/dev/null || true
   ```
3. `make test` — all BDD scenarios should pass
4. `make check` — final quality gate
