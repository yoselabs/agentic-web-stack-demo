# Architecture Patterns Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing todo feature to demonstrate all prescribed architecture patterns from the development cycle spec, and update all CLAUDE.md files to reference the new patterns.

**Architecture:** Extract business logic from `routers/todo.ts` into `services/todo.ts` with proper transaction boundaries (`SELECT FOR UPDATE`, VALUES+UPDATE bulk writes). Extract orchestration from `routes/_authenticated/todos.tsx` into `features/todo/use-todos.ts` hook. Update all CLAUDE.md guidance files.

**Tech Stack:** tRPC, Prisma 6.x, TanStack React Query, Vitest, playwright-bdd

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/api/src/services/todo.ts` | Business logic: list, create, complete, reorder, delete |
| Create | `packages/api/src/services/__tests__/todo.test.ts` | Service unit tests (direct function calls) |
| Modify | `packages/api/src/routers/todo.ts` | Thin wiring: Zod + protectedProcedure + $transaction → service |
| Modify | `packages/api/src/__tests__/todo.test.ts` | Trim to router-level concerns (auth guards, input validation) |
| Create | `apps/web/src/features/todo/use-todos.ts` | Orchestration hook: queries, mutations, DnD, optimistic updates |
| Modify | `apps/web/src/routes/_authenticated/todos.tsx` | Thin shell: Route.useRouteContext() → hook → JSX |
| Modify | `packages/api/CLAUDE.md` | Add services layer pattern, update examples |
| Modify | `apps/web/CLAUDE.md` | Add hook extraction pattern |
| Modify | `CLAUDE.md` | Update Development Workflow section |
| Modify | `e2e/CLAUDE.md` | Add step definition timing note |

---

### Task 1: Create todo service with tests (TDD)

**Files:**
- Create: `packages/api/src/services/todo.ts`
- Create: `packages/api/src/services/__tests__/todo.test.ts`

- [ ] **Step 1: Create the service test file with all test cases**

Create `packages/api/src/services/__tests__/todo.test.ts`:

```typescript
import { Prisma } from "@prisma/client";
import { db } from "@project/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  completeTodo,
  createTodo,
  deleteTodo,
  listTodos,
  reorderTodos,
} from "../todo.js";

const TEST_USER_ID = "test-user-todo-service";

const createdTodoIds: string[] = [];

beforeAll(async () => {
  await db.todo.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.deleteMany({ where: { id: TEST_USER_ID } });
  await db.user.create({
    data: {
      id: TEST_USER_ID,
      name: "Service Test User",
      email: "test-todo-service@example.com",
      emailVerified: false,
    },
  });
});

afterEach(async () => {
  if (createdTodoIds.length > 0) {
    await db.todo.deleteMany({
      where: { id: { in: createdTodoIds } },
    });
    createdTodoIds.length = 0;
  }
});

afterAll(async () => {
  await db.todo.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  await db.$disconnect();
});

describe("todo service", () => {
  it("lists todos (empty)", async () => {
    const todos = await listTodos(db, TEST_USER_ID);
    expect(todos).toEqual([]);
  });

  it("creates a todo at position 0 and shifts others", async () => {
    const first = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "First"),
    );
    createdTodoIds.push(first.id);

    const second = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Second"),
    );
    createdTodoIds.push(second.id);

    const todos = await listTodos(db, TEST_USER_ID);
    const active = todos.filter((t) => !t.completed);

    expect(active[0]?.title).toBe("Second");
    expect(active[0]?.position).toBe(0);
    expect(active[1]?.title).toBe("First");
    expect(active[1]?.position).toBe(1);
  });

  it("completes a todo", async () => {
    const todo = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "To complete"),
    );
    createdTodoIds.push(todo.id);

    const updated = await db.$transaction((tx) =>
      completeTodo(tx, TEST_USER_ID, todo.id, true),
    );
    expect(updated.completed).toBe(true);
  });

  it("uncompleting a todo moves it to position 0", async () => {
    const first = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Stay"),
    );
    const second = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Toggle"),
    );
    createdTodoIds.push(first.id, second.id);

    await db.$transaction((tx) =>
      completeTodo(tx, TEST_USER_ID, second.id, true),
    );
    await db.$transaction((tx) =>
      completeTodo(tx, TEST_USER_ID, second.id, false),
    );

    const todos = await listTodos(db, TEST_USER_ID);
    const active = todos.filter((t) => !t.completed);
    expect(active[0]?.title).toBe("Toggle");
    expect(active[0]?.position).toBe(0);
  });

  it("reorders todos with bulk UPDATE", async () => {
    const a = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "A"),
    );
    const b = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "B"),
    );
    const c = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "C"),
    );
    createdTodoIds.push(a.id, b.id, c.id);

    // Current order: C(0), B(1), A(2). Reorder to A, C, B.
    await db.$transaction((tx) =>
      reorderTodos(tx, TEST_USER_ID, [a.id, c.id, b.id]),
    );

    const todos = await listTodos(db, TEST_USER_ID);
    const active = todos.filter((t) => !t.completed);
    expect(active.map((t) => t.title)).toEqual(["A", "C", "B"]);
  });

  it("deletes a todo", async () => {
    const todo = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "To delete"),
    );

    await deleteTodo(db, TEST_USER_ID, todo.id);

    const todos = await listTodos(db, TEST_USER_ID);
    expect(todos.find((t) => t.id === todo.id)).toBeUndefined();
  });

  it("sorts completed todos after active ones", async () => {
    const active = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Active"),
    );
    const done = await db.$transaction((tx) =>
      createTodo(tx, TEST_USER_ID, "Done"),
    );
    createdTodoIds.push(active.id, done.id);

    await db.$transaction((tx) =>
      completeTodo(tx, TEST_USER_ID, done.id, true),
    );

    const todos = await listTodos(db, TEST_USER_ID);
    expect(todos[0]?.title).toBe("Active");
    expect(todos[1]?.title).toBe("Done");
    expect(todos[1]?.completed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @project/api test -- --reporter=verbose 2>&1 | tail -30`

Expected: FAIL — `services/todo.js` module not found.

- [ ] **Step 3: Create the todo service**

Create `packages/api/src/services/todo.ts`:

```typescript
import { Prisma, type PrismaClient } from "@project/db";

type DbClient = PrismaClient | Prisma.TransactionClient;

async function lockActiveTodos(db: DbClient, userId: string): Promise<void> {
  await db.$queryRaw`
    SELECT id FROM "Todo"
    WHERE "userId" = ${userId} AND "completed" = false
    FOR UPDATE
  `;
}

async function shiftActivePositions(
  db: DbClient,
  userId: string,
): Promise<void> {
  await db.todo.updateMany({
    where: { userId, completed: false },
    data: { position: { increment: 1 } },
  });
}

export async function listTodos(db: DbClient, userId: string) {
  return db.todo.findMany({
    where: { userId },
    orderBy: [{ completed: "asc" }, { position: "asc" }],
  });
}

export async function createTodo(
  db: DbClient,
  userId: string,
  title: string,
) {
  await lockActiveTodos(db, userId);
  await shiftActivePositions(db, userId);
  return db.todo.create({
    data: { title, userId, position: 0 },
  });
}

export async function completeTodo(
  db: DbClient,
  userId: string,
  id: string,
  completed: boolean,
) {
  if (!completed) {
    await lockActiveTodos(db, userId);
    await shiftActivePositions(db, userId);
    return db.todo.update({
      where: { id, userId },
      data: { completed: false, position: 0 },
    });
  }
  return db.todo.update({
    where: { id, userId },
    data: { completed },
  });
}

export async function reorderTodos(
  db: DbClient,
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

export async function deleteTodo(db: DbClient, userId: string, id: string) {
  return db.todo.delete({
    where: { id, userId },
  });
}
```

- [ ] **Step 4: Run the service tests to verify they pass**

Run: `pnpm --filter @project/api test -- --reporter=verbose 2>&1 | tail -30`

Expected: All service tests PASS. Existing router tests may still pass (unchanged).

- [ ] **Step 5: Run make check**

Run: `make check`

Expected: typecheck + lint pass.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/todo.ts packages/api/src/services/__tests__/todo.test.ts
git commit -m "feat: extract todo service with SELECT FOR UPDATE and bulk reorder"
```

---

### Task 2: Refactor todo router to thin wiring + update router tests

**Files:**
- Modify: `packages/api/src/routers/todo.ts`
- Modify: `packages/api/src/__tests__/todo.test.ts`

- [ ] **Step 1: Rewrite the todo router to delegate to services**

Replace the entire content of `packages/api/src/routers/todo.ts`:

```typescript
import { z } from "zod";
import {
  completeTodo,
  createTodo,
  deleteTodo,
  listTodos,
  reorderTodos,
} from "../services/todo.js";
import { protectedProcedure, router } from "../trpc.js";

export const todoRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    return listTodos(ctx.db, ctx.session.user.id);
  }),
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        createTodo(tx, ctx.session.user.id, input.title),
      );
    }),
  complete: protectedProcedure
    .input(z.object({ id: z.string(), completed: z.boolean() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        completeTodo(tx, ctx.session.user.id, input.id, input.completed),
      );
    }),
  reorder: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        reorderTodos(tx, ctx.session.user.id, input.ids),
      );
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        deleteTodo(tx, ctx.session.user.id, input.id),
      );
    }),
});
```

- [ ] **Step 2: Trim router tests to focus on router-level concerns**

Replace the entire content of `packages/api/src/__tests__/todo.test.ts`:

```typescript
import { db } from "@project/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext } from "../context.js";
import { appRouter } from "../router.js";

const TEST_USER_ID = "test-user-todo-router";
const TEST_USER = {
  id: TEST_USER_ID,
  name: "Router Test User",
  email: "test-todo-router@example.com",
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeSession = {
  user: TEST_USER,
  session: {
    id: "test-session-router",
    token: "test-token-router",
    userId: TEST_USER_ID,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

async function createCaller() {
  const ctx = await createContext({ session: fakeSession });
  return appRouter.createCaller(ctx);
}

beforeAll(async () => {
  await db.todo.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.deleteMany({ where: { id: TEST_USER_ID } });
  await db.user.create({
    data: {
      id: TEST_USER_ID,
      name: TEST_USER.name,
      email: TEST_USER.email,
      emailVerified: TEST_USER.emailVerified,
    },
  });
});

afterAll(async () => {
  await db.todo.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  await db.$disconnect();
});

describe("todo router (integration)", () => {
  it("rejects unauthenticated calls", async () => {
    const ctx = await createContext({ session: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.todo.list()).rejects.toThrow("UNAUTHORIZED");
  });

  it("rejects empty title", async () => {
    const caller = await createCaller();
    await expect(caller.todo.create({ title: "" })).rejects.toThrow();
  });

  it("rejects empty reorder array", async () => {
    const caller = await createCaller();
    await expect(caller.todo.reorder({ ids: [] })).rejects.toThrow();
  });

  it("round-trips a todo through create and list", async () => {
    const caller = await createCaller();
    const todo = await caller.todo.create({ title: "Router round-trip" });

    expect(todo.title).toBe("Router round-trip");
    expect(todo.userId).toBe(TEST_USER_ID);

    const todos = await caller.todo.list();
    expect(todos.some((t) => t.id === todo.id)).toBe(true);

    // Clean up
    await caller.todo.delete({ id: todo.id });
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `pnpm --filter @project/api test -- --reporter=verbose 2>&1 | tail -40`

Expected: All service tests AND router tests pass.

- [ ] **Step 4: Run make check**

Run: `make check`

Expected: typecheck + lint pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/todo.ts packages/api/src/__tests__/todo.test.ts
git commit -m "refactor: thin todo router delegates to service, trim router tests to auth/validation"
```

---

### Task 3: Extract frontend orchestration hook

**Files:**
- Create: `apps/web/src/features/todo/use-todos.ts`
- Modify: `apps/web/src/routes/_authenticated/todos.tsx`

- [ ] **Step 1: Create the orchestration hook**

Create `apps/web/src/features/todo/use-todos.ts`:

```typescript
import type { AppRouter } from "@project/api";
import {
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  type QueryClient,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { useState } from "react";
import { toast } from "sonner";

export function useTodos(
  trpc: TRPCOptionsProxy<AppRouter>,
  queryClient: QueryClient,
) {
  const [newTitle, setNewTitle] = useState("");

  const todos = useQuery(trpc.todo.list.queryOptions());

  const activeTodos = todos.data?.filter((t) => !t.completed) ?? [];
  const completedTodos = todos.data?.filter((t) => t.completed) ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const createTodo = useMutation(
    trpc.todo.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.todo.list.queryFilter());
        setNewTitle("");
        toast.success("Todo added");
      },
      onError: () => toast.error("Failed to add todo"),
    }),
  );

  const completeTodo = useMutation(
    trpc.todo.complete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.todo.list.queryFilter());
      },
      onError: () => toast.error("Failed to update todo"),
    }),
  );

  const deleteTodo = useMutation(
    trpc.todo.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.todo.list.queryFilter());
        toast.success("Todo deleted");
      },
      onError: () => toast.error("Failed to delete todo"),
    }),
  );

  const reorderTodos = useMutation(
    trpc.todo.reorder.mutationOptions({
      onError: () => {
        queryClient.invalidateQueries(trpc.todo.list.queryFilter());
        toast.error("Failed to reorder");
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createTodo.mutate({ title: newTitle.trim() });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activeTodos.findIndex((t) => t.id === active.id);
    const newIndex = activeTodos.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...activeTodos];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    queryClient.setQueryData(trpc.todo.list.queryFilter().queryKey, [
      ...reordered,
      ...completedTodos,
    ]);

    reorderTodos.mutate({ ids: reordered.map((t) => t.id) });
  };

  return {
    newTitle,
    setNewTitle,
    todos,
    activeTodos,
    completedTodos,
    sensors,
    completeTodo,
    deleteTodo,
    handleSubmit,
    handleDragEnd,
  };
}
```

- [ ] **Step 2: Rewrite the route as a thin shell**

Replace the entire content of `apps/web/src/routes/_authenticated/todos.tsx`:

```tsx
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CompletedTodoItem } from "#/features/todo/completed-todo-item";
import { SortableTodoItem } from "#/features/todo/sortable-todo-item";
import { useTodos } from "#/features/todo/use-todos";

export const Route = createFileRoute("/_authenticated/todos")({
  component: TodosPage,
});

function TodosPage() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const {
    newTitle,
    setNewTitle,
    todos,
    activeTodos,
    completedTodos,
    sensors,
    completeTodo,
    deleteTodo,
    handleSubmit,
    handleDragEnd,
  } = useTodos(trpc, queryClient);

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="text-3xl font-bold mb-6">Todos</h1>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <Input
          type="text"
          placeholder="Add a todo..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="flex-1"
        />
        <Button type="submit">Add</Button>
      </form>

      {todos.isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : todos.data?.length === 0 ? (
        <p className="text-muted-foreground">No todos yet</p>
      ) : (
        <>
          {activeTodos.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={activeTodos.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-2">
                  {activeTodos.map((todo) => (
                    <SortableTodoItem
                      key={todo.id}
                      todo={todo}
                      onComplete={() =>
                        completeTodo.mutate({
                          id: todo.id,
                          completed: !todo.completed,
                        })
                      }
                      onDelete={() => deleteTodo.mutate({ id: todo.id })}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          {completedTodos.length > 0 && (
            <>
              {activeTodos.length > 0 && <div className="border-t my-4" />}
              <ul className="space-y-2">
                {completedTodos.map((todo) => (
                  <CompletedTodoItem
                    key={todo.id}
                    todo={todo}
                    onUncomplete={() =>
                      completeTodo.mutate({
                        id: todo.id,
                        completed: !todo.completed,
                      })
                    }
                    onDelete={() => deleteTodo.mutate({ id: todo.id })}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Run make check**

Run: `make check`

Expected: typecheck + lint pass.

- [ ] **Step 4: Run BDD tests to verify no regressions**

Run: `make test 2>&1 | tail -30`

Expected: All 25 BDD scenarios pass. The UI behavior is unchanged — only the code organization moved.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/todo/use-todos.ts apps/web/src/routes/_authenticated/todos.tsx
git commit -m "refactor: extract todo orchestration into use-todos hook, route becomes thin shell"
```

---

### Task 4: Update all CLAUDE.md files

**Files:**
- Modify: `packages/api/CLAUDE.md`
- Modify: `apps/web/CLAUDE.md`
- Modify: `CLAUDE.md`
- Modify: `e2e/CLAUDE.md`

- [ ] **Step 1: Rewrite packages/api/CLAUDE.md**

Replace the entire content of `packages/api/CLAUDE.md`:

````markdown
# packages/api — tRPC Router + Context

## Architecture: Router → Service → Prisma

```
routers/todo.ts              ← Thin: Zod validation + protectedProcedure + $transaction → service
services/todo.ts             ← Business logic: accepts db|tx, owns domain rules
services/__tests__/todo.test.ts  ← Service unit tests (direct function calls)
__tests__/todo.test.ts       ← Router integration tests (createCaller, auth guards)
```

**Routers** are wiring only — input validation (Zod), auth (`protectedProcedure`), and transaction boundaries.

**Services** are pure functions that accept `PrismaClient | Prisma.TransactionClient` as first argument. They never receive tRPC context (`ctx`), never start transactions, and never import from tRPC.

## Adding a New Feature

1. Create `src/services/<name>.ts` with business logic functions
2. Create `src/services/__tests__/<name>.test.ts` with service unit tests (TDD)
3. Create `src/routers/<name>.ts` with thin router wiring
4. Mount in `src/router.ts`
5. Create/update `src/__tests__/<name>.test.ts` for router-level tests (auth, validation)
6. Run `make check` — types propagate to apps/web automatically

### Example: Add a posts feature

Create service `src/services/post.ts`:

```typescript
import { type PrismaClient, Prisma } from "@project/db";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function listPosts(db: DbClient, userId: string) {
  return db.post.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createPost(db: DbClient, userId: string, title: string) {
  return db.post.create({
    data: { title, userId },
  });
}
```

Create router `src/routers/post.ts`:

```typescript
import { z } from "zod";
import { createPost, listPosts } from "../services/post.js";
import { protectedProcedure, router } from "../trpc.js";

export const postRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    return listPosts(ctx.db, ctx.session.user.id);
  }),
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        createPost(tx, ctx.session.user.id, input.title),
      );
    }),
});
```

Mount in `src/router.ts`:

```typescript
import { postRouter } from "./routers/post.js";

export const appRouter = router({
  // ... existing routes
  post: postRouter,
});
```

## Transaction Rules

- **All mutations:** router wraps in `db.$transaction(async (tx) => ...)`
- **All reads:** router calls service with `db` directly (no transaction)
- **Cross-service:** router wraps multiple service calls in one `$transaction`
- **Race conditions:** service uses `SELECT FOR UPDATE` inside the tx it receives

```typescript
// Race-safe pattern inside a service function
await db.$queryRaw`
  SELECT id FROM "Todo" WHERE "userId" = ${userId} FOR UPDATE
`;
```

## N+1 Prevention

- **Reads:** always use `include`/`select` for related data, never loop queries
- **Bulk writes:** use VALUES + UPDATE join pattern:

```typescript
const pairs = ids.map((id, i) => Prisma.sql`(${id}::text, ${i}::integer)`);
await db.$executeRaw`
  UPDATE "Todo" AS t
  SET "position" = d.new_position
  FROM (VALUES ${Prisma.join(pairs, ",")}) AS d(id, new_position)
  WHERE t.id = d.id AND t."userId" = ${userId}
`;
```

## File Structure

- `src/trpc.ts` — single `initTRPC.create()`, exports `router`, `publicProcedure`, `protectedProcedure`
- `src/context.ts` — `createContext()` receives session from Hono, exports `Context` type
- `src/router.ts` — `appRouter` merging sub-routers, exports `AppRouter` type
- `src/routers/` — one file per domain sub-router (thin wiring only)
- `src/services/` — one file per domain service (business logic)
- `src/services/__tests__/` — service unit tests
- `src/__tests__/` — router integration tests
- `src/index.ts` — re-exports everything

## Context

`protectedProcedure` narrows `ctx.session` to non-null. Inside a protected procedure:
- `ctx.session.user` — authenticated user (id, email, name, etc.)
- `ctx.db` — Prisma client

## Do Not

- Create a second `initTRPC.create()` — all routers must use the one from `src/trpc.ts`
- Import `appRouter` value in client code — only import `type AppRouter`
- Skip input validation — always use `.input(z.object({...}))` for mutations
- Access `ctx.session.user` in `publicProcedure` — it's nullable, use `protectedProcedure`
- Name procedures `then`, `call`, or `apply` — reserved by JavaScript Proxy
- Put business logic in routers — delegate to service functions
- Call `db.$transaction` inside a service — the router owns transaction boundaries
- Pass tRPC `ctx` to services — extract fields and pass as plain arguments
````

- [ ] **Step 2: Update apps/web/CLAUDE.md — add hook extraction pattern**

In `apps/web/CLAUDE.md`, find the "Using tRPC Data" section and add the hook pattern after it. Find the text `### Optimistic Updates` and insert before it:

```markdown
### Hook Extraction Pattern

When a route has 2+ mutations or the return object would have 5+ properties, extract orchestration into a `features/*/use-*.ts` hook. The route becomes a thin shell.

```tsx
// features/todo/use-todos.ts — orchestration hook
export function useTodos(
  trpc: TRPCOptionsProxy<AppRouter>,
  queryClient: QueryClient,
) {
  const todos = useQuery(trpc.todo.list.queryOptions());
  const createTodo = useMutation(trpc.todo.create.mutationOptions({ ... }));
  // ... all mutations, handlers, derived state
  return { todos, createTodo, handleSubmit, handleDragEnd, ... };
}

// routes/_authenticated/todos.tsx — thin shell
function TodosPage() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { todos, handleSubmit, ... } = useTodos(trpc, queryClient);
  return <main>...</main>;
}
```

The hook receives `trpc` and `queryClient` as parameters because `Route.useRouteContext()` can only be called inside the route component.

```

- [ ] **Step 3: Update root CLAUDE.md — Development Workflow section**

In `CLAUDE.md`, replace the "Development Workflow (BDD-first)" section with:

```markdown
## Development Workflow (BDD-first, Vertical Slices)

Features are built as vertical slices within domain groups. A domain group is a cluster of related Prisma models that serve one user-facing capability (e.g., Board + Column + Card).

For each domain group:

1. **Write Gherkin scenarios** — behavior contract for ALL features in the domain group
2. **Schema** — all Prisma models for the domain group, `make db-push`
3. **Backend (batched)** — all services + routers + Vitest for the domain group → API GREEN
4. **Frontend (per feature)** — hook + components + route + step defs + BDD → GREEN per feature

Step definitions are written AFTER the UI exists (Phase 3), not before. The Gherkin spec is the source of truth, but step defs need real HTML to reference correct selectors.

See `docs/superpowers/specs/2026-04-12-development-cycle-handover.md` for the full process spec.
```

- [ ] **Step 4: Update e2e/CLAUDE.md — add step definition timing note**

In `e2e/CLAUDE.md`, find the "Add a Feature (BDD-first workflow)" section and replace it with:

```markdown
## Add a Feature (BDD-first workflow)

1. **Write the Gherkin spec** in `features/<name>.feature` (Phase 0 — before any code)
2. **Implement backend** — services + routers + Vitest (Phase 2)
3. **Implement frontend** — hooks + components + routes (Phase 3)
4. **Write step definitions** in `steps/<name>.ts` against real HTML (Phase 3)
5. **Generate tests:** `pnpm exec bddgen` (generates `.features-gen/`)
6. **Run:** `make test`
7. **Verify:** `make check && make test`

Step definitions are written AFTER the UI exists so selectors reference real elements. The Gherkin spec (written first) is the behavior contract; step defs are the implementation detail.
```

- [ ] **Step 5: Run make check**

Run: `make check`

Expected: typecheck + lint pass (docs are markdown, no type impact).

- [ ] **Step 6: Commit**

```bash
git add packages/api/CLAUDE.md apps/web/CLAUDE.md CLAUDE.md e2e/CLAUDE.md
git commit -m "docs: update CLAUDE.md files with services layer, hook extraction, and vertical slice workflow"
```

---

## Self-Review

**Spec coverage:**
- ✅ Backend services layer with `PrismaClient | Prisma.TransactionClient`
- ✅ Services never receive ctx, never start transactions
- ✅ Router owns transaction boundary (`$transaction` for all mutations)
- ✅ `SELECT FOR UPDATE` for race-prone operations (create, complete)
- ✅ VALUES+UPDATE bulk write for reorder (N+1 fix)
- ✅ Two-layer testing (service unit + router integration)
- ✅ Frontend hook extraction (`use-todos.ts`)
- ✅ Route as thin shell
- ✅ Hook receives trpc + queryClient as params
- ✅ All 4 CLAUDE.md files updated
- ✅ Development Workflow updated to vertical slices
- ✅ Step definition timing documented in e2e/CLAUDE.md
- ✅ Anti-patterns documented in packages/api/CLAUDE.md Do Not section

**Placeholder scan:** No TBD, TODO, or vague steps. All code blocks are complete.

**Type consistency:** `DbClient` type alias used consistently in service. `listTodos`, `createTodo`, `completeTodo`, `reorderTodos`, `deleteTodo` — same names in service, test, and router import.
