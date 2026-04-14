# Todo Lists Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TodoList as a container for todos — demonstrates Prisma `include` pattern, Badge component, parameterized routes, and list→detail navigation.

**Architecture:** New TodoList model with one-to-many relation to Todo. TodoList service + router (CRUD with `_count` include). Todo service refactored to scope all operations by `todoListId`. Frontend: list index page + list detail page (replaces old `/todos`). Optimistic delete on lists demonstrates the `setQueryData` type workaround.

**Tech Stack:** Prisma (relations, include), tRPC (routers), Hono (import/export), shadcn Badge, TanStack Router (parameterized routes), playwright-bdd (E2E)

**Spec:** `docs/superpowers/specs/2026-04-14-todo-lists-feature.md`

---

### Task 1: Schema — TodoList Model + Todo Relation

**Files:**
- Create: `packages/db/prisma/schema/todo-list.prisma`
- Modify: `packages/db/prisma/schema/todo.prisma`
- Modify: `packages/db/prisma/schema/auth.prisma`

- [ ] **Step 1: Create TodoList model**

Create `packages/db/prisma/schema/todo-list.prisma`:

```prisma
// Application owned — full control.

model TodoList {
  id        String   @id @default(cuid())
  name      String
  color     String   @default("#6366f1")
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user  User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  todos Todo[]
}
```

- [ ] **Step 2: Add todoListId to Todo model**

Replace `packages/db/prisma/schema/todo.prisma` with:

```prisma
// Application owned — full control.

model Todo {
  id         String   @id @default(cuid())
  title      String
  completed  Boolean  @default(false)
  position   Int      @default(0)
  userId     String
  todoListId String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  todoList TodoList @relation(fields: [todoListId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: Add reverse relation to User**

In `packages/db/prisma/schema/auth.prisma`, add `todoLists TodoList[]` to the User model after `todos    Todo[]`.

- [ ] **Step 4: Push schema**

```bash
make db-push
```

This is destructive (adds required `todoListId`). Template project — no production data.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema/
git commit -m "feat: add TodoList model with Todo relation"
```

---

### Task 2: TodoList Service + Tests (TDD)

**Files:**
- Create: `packages/api/src/services/todo-list.ts`
- Create: `packages/api/src/services/__tests__/todo-list.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/api/src/services/__tests__/todo-list.test.ts`:

```typescript
import { db } from "@project/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createTodoList,
  deleteTodoList,
  getTodoList,
  listTodoLists,
} from "../todo-list.js";

const TEST_USER_ID = "test-user-todolist-service";
const createdListIds: string[] = [];

beforeAll(async () => {
  await db.todoList.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.todo.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.deleteMany({ where: { id: TEST_USER_ID } });
  await db.user.create({
    data: {
      id: TEST_USER_ID,
      name: "TodoList Test User",
      email: "test-todolist-service@example.com",
      emailVerified: false,
    },
  });
});

afterEach(async () => {
  if (createdListIds.length > 0) {
    await db.todoList.deleteMany({
      where: { id: { in: createdListIds } },
    });
    createdListIds.length = 0;
  }
});

afterAll(async () => {
  await db.todoList.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  await db.$disconnect();
});

describe("todo-list service", () => {
  it("lists todo lists (empty)", async () => {
    const lists = await listTodoLists(db, TEST_USER_ID);
    expect(lists).toEqual([]);
  });

  it("creates a todo list", async () => {
    const list = await createTodoList(db, TEST_USER_ID, "Groceries");
    createdListIds.push(list.id);
    expect(list.name).toBe("Groceries");
    expect(list.color).toBe("#6366f1");
    expect(list.userId).toBe(TEST_USER_ID);
  });

  it("creates a todo list with custom color", async () => {
    const list = await createTodoList(db, TEST_USER_ID, "Work", "#ef4444");
    createdListIds.push(list.id);
    expect(list.color).toBe("#ef4444");
  });

  it("gets a todo list by id", async () => {
    const created = await createTodoList(db, TEST_USER_ID, "Get Test");
    createdListIds.push(created.id);
    const found = await getTodoList(db, TEST_USER_ID, created.id);
    expect(found.name).toBe("Get Test");
  });

  it("deletes a todo list", async () => {
    const list = await createTodoList(db, TEST_USER_ID, "To Delete");
    await deleteTodoList(db, TEST_USER_ID, list.id);
    const lists = await listTodoLists(db, TEST_USER_ID);
    expect(lists.find((l) => l.id === list.id)).toBeUndefined();
  });

  it("includes todo count in list", async () => {
    const list = await createTodoList(db, TEST_USER_ID, "With Todos");
    createdListIds.push(list.id);
    await db.todo.create({
      data: { title: "Task 1", userId: TEST_USER_ID, todoListId: list.id },
    });
    await db.todo.create({
      data: { title: "Task 2", userId: TEST_USER_ID, todoListId: list.id },
    });

    const lists = await listTodoLists(db, TEST_USER_ID);
    const found = lists.find((l) => l.id === list.id);
    expect(found?._count.todos).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/api && pnpm vitest run src/services/__tests__/todo-list.test.ts
```

- [ ] **Step 3: Implement todo-list service**

Create `packages/api/src/services/todo-list.ts`:

```typescript
import type { Prisma, PrismaClient } from "@project/db";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function listTodoLists(db: DbClient, userId: string) {
  return db.todoList.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { todos: true } },
    },
  });
}

export async function getTodoList(
  db: DbClient,
  userId: string,
  id: string,
) {
  return db.todoList.findFirstOrThrow({
    where: { id, userId },
  });
}

export async function createTodoList(
  db: DbClient,
  userId: string,
  name: string,
  color?: string,
) {
  return db.todoList.create({
    data: { name, userId, ...(color ? { color } : {}) },
  });
}

export async function deleteTodoList(
  db: DbClient,
  userId: string,
  id: string,
) {
  const list = await db.todoList.findFirstOrThrow({
    where: { id, userId },
  });
  return db.todoList.delete({ where: { id: list.id } });
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/api && pnpm vitest run src/services/__tests__/todo-list.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/todo-list.ts packages/api/src/services/__tests__/todo-list.test.ts
git commit -m "feat: add todo-list service with tests"
```

---

### Task 3: Refactor Todo Service for todoListId Scoping

**Files:**
- Modify: `packages/api/src/services/todo.ts`
- Modify: `packages/api/src/services/__tests__/todo.test.ts`

- [ ] **Step 1: Update all existing tests to create a TodoList first**

In `packages/api/src/services/__tests__/todo.test.ts`:

Add a `TEST_LIST_ID` variable and create a TodoList in `beforeAll`:

```typescript
let TEST_LIST_ID: string;

beforeAll(async () => {
  // ... existing user cleanup and creation ...
  const list = await db.todoList.create({
    data: {
      name: "Test List",
      userId: TEST_USER_ID,
    },
  });
  TEST_LIST_ID = list.id;
});
```

Update `afterAll` to also clean up lists:

```typescript
afterAll(async () => {
  await db.todo.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.todoList.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  await db.$disconnect();
});
```

Update every call to `createTodo` to pass `TEST_LIST_ID`:
- `createTodo(tx, TEST_USER_ID, "First")` → `createTodo(tx, TEST_USER_ID, "First", TEST_LIST_ID)`

Update every call to `listTodos` to pass `TEST_LIST_ID`:
- `listTodos(db, TEST_USER_ID)` → `listTodos(db, TEST_USER_ID, TEST_LIST_ID)`

Update every call to `importTodosFromCSV` to pass `TEST_LIST_ID`:
- `importTodosFromCSV(tx, TEST_USER_ID, csv)` → `importTodosFromCSV(tx, TEST_USER_ID, csv, TEST_LIST_ID)`

Update every call to `exportTodosAsCSV` to pass `TEST_LIST_ID`:
- `exportTodosAsCSV(db, TEST_USER_ID)` → `exportTodosAsCSV(db, TEST_USER_ID, TEST_LIST_ID)`

Add two new tests:

```typescript
it("listTodos returns todoList via include", async () => {
  const todo = await db.$transaction((tx) =>
    createTodo(tx, TEST_USER_ID, "With list", TEST_LIST_ID),
  );
  createdTodoIds.push(todo.id);

  const todos = await listTodos(db, TEST_USER_ID, TEST_LIST_ID);
  const found = todos.find((t) => t.id === todo.id);
  expect(found?.todoList?.name).toBe("Test List");
});

it("position scoping: creating in one list does not shift another list", async () => {
  const listB = await db.todoList.create({
    data: { name: "List B", userId: TEST_USER_ID },
  });
  const todoB = await db.$transaction((tx) =>
    createTodo(tx, TEST_USER_ID, "B-item", listB.id),
  );

  // Create a todo in the primary list — should NOT shift List B
  const todoA = await db.$transaction((tx) =>
    createTodo(tx, TEST_USER_ID, "A-item", TEST_LIST_ID),
  );
  createdTodoIds.push(todoA.id, todoB.id);

  const listBTodos = await listTodos(db, TEST_USER_ID, listB.id);
  expect(listBTodos[0]?.position).toBe(0); // unchanged

  await db.todoList.delete({ where: { id: listB.id } });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/api && pnpm vitest run src/services/__tests__/todo.test.ts
```

Expected: FAIL — function signatures don't match yet.

- [ ] **Step 3: Refactor todo.ts service**

Update `packages/api/src/services/todo.ts`:

Scope `lockActiveTodos` by `todoListId`:

```typescript
async function lockActiveTodos(
  db: DbClient,
  userId: string,
  todoListId: string,
): Promise<void> {
  await db.$queryRaw`
    SELECT id FROM "Todo"
    WHERE "userId" = ${userId} AND "todoListId" = ${todoListId} AND "completed" = false
    FOR UPDATE
  `;
}
```

Scope `shiftActivePositions` by `todoListId`:

```typescript
async function shiftActivePositions(
  db: DbClient,
  userId: string,
  todoListId: string,
): Promise<void> {
  await db.todo.updateMany({
    where: { userId, todoListId, completed: false },
    data: { position: { increment: 1 } },
  });
}
```

Update `listTodos`:

```typescript
export async function listTodos(
  db: DbClient,
  userId: string,
  todoListId: string,
) {
  return db.todo.findMany({
    where: { userId, todoListId },
    orderBy: [{ completed: "asc" }, { position: "asc" }],
    include: { todoList: true },
  });
}
```

Update `createTodo`:

```typescript
export async function createTodo(
  db: DbClient,
  userId: string,
  title: string,
  todoListId: string,
) {
  await lockActiveTodos(db, userId, todoListId);
  await shiftActivePositions(db, userId, todoListId);
  return db.todo.create({
    data: { title, userId, todoListId, position: 0 },
  });
}
```

Update `completeTodo` — pass `todoListId` to lock/shift. Need to read it from the todo:

```typescript
export async function completeTodo(
  db: DbClient,
  userId: string,
  id: string,
  completed: boolean,
) {
  const todo = await db.todo.findFirstOrThrow({ where: { id, userId } });
  if (!completed) {
    await lockActiveTodos(db, userId, todo.todoListId);
    await shiftActivePositions(db, userId, todo.todoListId);
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
```

Update `importTodosFromCSV`:

```typescript
export async function importTodosFromCSV(
  db: DbClient,
  userId: string,
  csvData: Buffer,
  todoListId: string,
): Promise<{ count: number }> {
  const text = csvData.toString("utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (!parsed.meta.fields?.includes("title")) {
    throw new Error("CSV must have a 'title' column");
  }

  const titles = parsed.data.map((row) => row.title).filter(Boolean);
  if (titles.length === 0) {
    throw new Error("CSV must have a 'title' column with at least one value");
  }

  await lockActiveTodos(db, userId, todoListId);
  await db.todo.updateMany({
    where: { userId, todoListId, completed: false },
    data: { position: { increment: titles.length } },
  });
  await db.todo.createMany({
    data: titles.map((title, i) => ({
      title,
      userId,
      todoListId,
      position: i,
    })),
  });

  return { count: titles.length };
}
```

Update `exportTodosAsCSV`:

```typescript
export async function exportTodosAsCSV(
  db: DbClient,
  userId: string,
  todoListId: string,
): Promise<string> {
  const todos = await db.todo.findMany({
    where: { userId, todoListId },
    orderBy: [{ completed: "asc" }, { position: "asc" }],
  });
  if (todos.length === 0) {
    return "title,completed";
  }
  return Papa.unparse(
    todos.map((t) => ({ title: t.title, completed: t.completed })),
  );
}
```

`reorderTodos` and `deleteTodo` are unchanged (they operate by todo ID which already scopes correctly).

- [ ] **Step 4: Run all tests**

```bash
cd packages/api && pnpm vitest run
make lint
```

Expected: All tests PASS. Lint passes.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/todo.ts packages/api/src/services/__tests__/todo.test.ts
git commit -m "refactor: scope todo service by todoListId, add include pattern"
```

---

### Task 4: TodoList Router + Todo Router Update

**Files:**
- Create: `packages/api/src/routers/todo-list.ts`
- Modify: `packages/api/src/routers/todo.ts`
- Modify: `packages/api/src/router.ts`
- Modify: `packages/api/src/index.ts`
- Create: `packages/api/src/__tests__/todo-list.test.ts`

- [ ] **Step 1: Create todo-list router**

Create `packages/api/src/routers/todo-list.ts`:

```typescript
import { z } from "zod";
import {
  createTodoList,
  deleteTodoList,
  getTodoList,
  listTodoLists,
} from "../services/todo-list.js";
import { protectedProcedure, router } from "../trpc.js";

export const todoListRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    return listTodoLists(ctx.db, ctx.session.user.id);
  }),
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return getTodoList(ctx.db, ctx.session.user.id, input.id);
    }),
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), color: z.string().optional() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        createTodoList(tx, ctx.session.user.id, input.name, input.color),
      );
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        deleteTodoList(tx, ctx.session.user.id, input.id),
      );
    }),
});
```

- [ ] **Step 2: Update todo router to require todoListId**

Replace `packages/api/src/routers/todo.ts`:

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
  list: protectedProcedure
    .input(z.object({ todoListId: z.string() }))
    .query(({ ctx, input }) => {
      return listTodos(ctx.db, ctx.session.user.id, input.todoListId);
    }),
  create: protectedProcedure
    .input(
      z.object({ title: z.string().min(1), todoListId: z.string() }),
    )
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        createTodo(
          tx,
          ctx.session.user.id,
          input.title,
          input.todoListId,
        ),
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

- [ ] **Step 3: Mount todoListRouter in app router**

Replace `packages/api/src/router.ts`:

```typescript
import { todoListRouter } from "./routers/todo-list.js";
import { todoRouter } from "./routers/todo.js";
import { router } from "./trpc.js";

export const appRouter = router({
  todoList: todoListRouter,
  todo: todoRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 4: Update package exports**

In `packages/api/src/index.ts`, the current exports already include `importTodosFromCSV` and `exportTodosAsCSV`. No changes needed — the function signatures changed but the names are the same.

- [ ] **Step 5: Write router integration tests**

Create `packages/api/src/__tests__/todo-list.test.ts`:

```typescript
import { db } from "@project/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext } from "../context.js";
import { appRouter } from "../router.js";

const TEST_USER_ID = "test-user-todolist-router";
const TEST_USER = {
  id: TEST_USER_ID,
  name: "TodoList Router Test User",
  email: "test-todolist-router@example.com",
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeSession = {
  user: TEST_USER,
  session: {
    id: "test-session-todolist-router",
    token: "test-token-todolist-router",
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
  await db.todoList.deleteMany({ where: { userId: TEST_USER_ID } });
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
  await db.todoList.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  await db.$disconnect();
});

describe("todoList router (integration)", () => {
  it("rejects unauthenticated calls", async () => {
    const ctx = await createContext({ session: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.todoList.list()).rejects.toThrow("UNAUTHORIZED");
  });

  it("round-trips a todo list through create and list", async () => {
    const caller = await createCaller();
    const list = await caller.todoList.create({ name: "Integration Test" });

    expect(list.name).toBe("Integration Test");

    const lists = await caller.todoList.list();
    expect(lists.some((l) => l.id === list.id)).toBe(true);

    await caller.todoList.delete({ id: list.id });
  });
});
```

- [ ] **Step 6: Update existing todo router tests**

In `packages/api/src/__tests__/todo.test.ts`, the existing tests need a TodoList. Add list creation in `beforeAll` and update the `create` call:

Add after user creation:
```typescript
const list = await db.todoList.create({
  data: { name: "Router Test List", userId: TEST_USER_ID },
});
```

Update the "rejects empty title" test to include `todoListId` (otherwise Zod rejects the missing field, not the empty title):
```typescript
await expect(caller.todo.create({ title: "", todoListId: list.id })).rejects.toThrow();
```

Update the round-trip test:
```typescript
const todo = await caller.todo.create({ title: "Router round-trip", todoListId: list.id });
```

Update the `list` call:
```typescript
const todos = await caller.todo.list({ todoListId: list.id });
```

- [ ] **Step 7: Run all tests and lint**

```bash
cd packages/api && pnpm vitest run
make lint
```

Expected: All tests PASS. Lint passes.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/routers/ packages/api/src/router.ts packages/api/src/index.ts packages/api/src/__tests__/
git commit -m "feat: add todoList router, update todo router for todoListId"
```

---

### Task 5: Update Hono Import/Export Routes

**Files:**
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Update import route to require todoListId**

In the `app.post("/api/todos/import", ...)` handler, after the CSV validation block, add:

```typescript
  const todoListId = formData.get("todoListId");
  if (typeof todoListId !== "string")
    return c.json({ error: "todoListId is required" }, 400);
```

Update the `importTodosFromCSV` call:

```typescript
  const result = await db.$transaction((tx) =>
    importTodosFromCSV(tx, session.user.id, buffer, todoListId),
  );
```

- [ ] **Step 2: Update export route to require todoListId**

Replace the export handler:

```typescript
app.get("/api/todos/export", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const todoListId = c.req.query("todoListId");
  if (!todoListId)
    return c.json({ error: "todoListId is required" }, 400);

  const csv = await exportTodosAsCSV(db, session.user.id, todoListId);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="todos.csv"',
    },
  });
});
```

- [ ] **Step 3: Verify**

```bash
make lint
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "feat: scope Hono import/export routes by todoListId"
```

---

### Task 6: Badge Component + Frontend TodoList Feature

**Files:**
- Create: `packages/ui/src/components/badge.tsx` (via shadcn CLI)
- Create: `apps/web/src/features/todo-list/types.ts`
- Create: `apps/web/src/features/todo-list/use-todo-lists.ts`
- Create: `apps/web/src/routes/_authenticated/todo-lists.index.tsx`
- Delete: `apps/web/src/routes/_authenticated/todos.tsx`
- Modify: `apps/web/src/widgets/navbar.tsx`

- [ ] **Step 1: Add Badge component**

```bash
cd packages/ui && pnpm dlx shadcn@latest add badge
```

If the CLI doesn't work, create `packages/ui/src/components/badge.tsx` manually following the same `ComponentProps` pattern as existing components (button.tsx, etc.).

- [ ] **Step 2: Create todo-list types**

Create `apps/web/src/features/todo-list/types.ts`:

```typescript
import type { AppRouter, inferRouterOutputs } from "@project/api";

type RouterOutput = inferRouterOutputs<AppRouter>;
export type TodoListWithCount = RouterOutput["todoList"]["list"][number];
```

- [ ] **Step 3: Create use-todo-lists hook with optimistic delete**

Create `apps/web/src/features/todo-list/use-todo-lists.ts`:

```typescript
import type { AppRouter } from "@project/api";
import { type QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { TodoListWithCount } from "./types";

export function useTodoLists(
  trpc: TRPCOptionsProxy<AppRouter>,
  queryClient: QueryClient,
) {
  const [newName, setNewName] = useState("");

  const todoLists = useQuery(trpc.todoList.list.queryOptions());

  const createTodoList = useMutation(
    trpc.todoList.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.todoList.list.queryFilter());
        setNewName("");
        toast.success("List created");
      },
      onError: () => toast.error("Failed to create list"),
    }),
  );

  const deleteTodoList = useMutation(
    trpc.todoList.delete.mutationOptions({
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries(trpc.todoList.list.queryFilter());
        const previous = queryClient.getQueryData<TodoListWithCount[]>(
          trpc.todoList.list.queryFilter().queryKey,
        );
        queryClient.setQueryData<TodoListWithCount[]>(
          trpc.todoList.list.queryFilter().queryKey,
          (old) => old?.filter((list) => list.id !== id),
        );
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(
            trpc.todoList.list.queryFilter().queryKey,
            context.previous,
          );
        }
        toast.error("Failed to delete list");
      },
      onSettled: () => {
        queryClient.invalidateQueries(trpc.todoList.list.queryFilter());
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createTodoList.mutate({ name: newName.trim() });
  };

  return {
    newName,
    setNewName,
    todoLists,
    createTodoList,
    deleteTodoList,
    handleSubmit,
  };
}
```

- [ ] **Step 4: Create todo-lists index page**

Create `apps/web/src/routes/_authenticated/todo-lists.index.tsx`:

```tsx
import { Badge } from "@project/ui/components/badge";
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useTodoLists } from "#/features/todo-list/use-todo-lists";

export const Route = createFileRoute("/_authenticated/todo-lists/")({
  component: TodoListsPage,
});

function TodoListsPage() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const {
    newName,
    setNewName,
    todoLists,
    createTodoList,
    deleteTodoList,
    handleSubmit,
  } = useTodoLists(trpc, queryClient);

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="text-3xl font-bold mb-6">Todo Lists</h1>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <Input
          type="text"
          placeholder="New list name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={createTodoList.isPending}>
          {createTodoList.isPending ? "Creating..." : "Create"}
        </Button>
      </form>

      {todoLists.isPending ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : todoLists.data?.length === 0 ? (
        <p className="text-muted-foreground">
          No lists yet. Create one to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {todoLists.data?.map((list) => (
            <li
              key={list.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <Link
                to={"/todo-lists/$listId" as string}
                params={{ listId: list.id }}
                className="flex items-center gap-3 flex-1 hover:opacity-80"
              >
                <span className="font-medium">{list.name}</span>
                <Badge
                  style={{ backgroundColor: list.color }}
                  className="text-white"
                >
                  {list._count.todos} todos
                </Badge>
              </Link>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteTodoList.mutate({ id: list.id })}
                aria-label={`Delete ${list.name}`}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Delete old todos page**

```bash
rm apps/web/src/routes/_authenticated/todos.tsx
```

- [ ] **Step 6: Update navbar**

In `apps/web/src/widgets/navbar.tsx`, change navLinks:

```typescript
const navLinks = [
  { to: "/dashboard" as const, label: "Dashboard" },
  { to: "/todo-lists" as const, label: "Todo Lists" },
];
```

- [ ] **Step 7: Regenerate routes and verify**

```bash
make routes
make lint
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add todo-lists index page with Badge, remove old /todos route"
```

---

### Task 7: List Detail Page (Todos within a List)

**Files:**
- Create: `apps/web/src/routes/_authenticated/todo-lists.$listId.tsx`
- Modify: `apps/web/src/features/todo/use-todos.ts`
- Modify: `apps/web/src/features/todo/types.ts`

- [ ] **Step 1: Update todo types**

Replace `apps/web/src/features/todo/types.ts` (if it exists) or create it:

```typescript
import type { AppRouter, inferRouterOutputs } from "@project/api";

type RouterOutput = inferRouterOutputs<AppRouter>;
export type Todo = RouterOutput["todo"]["list"][number];
```

- [ ] **Step 2: Update use-todos hook for todoListId**

Modify `apps/web/src/features/todo/use-todos.ts`:

Add `todoListId: string` as the third parameter to `useTodos`:

```typescript
export function useTodos(
  trpc: TRPCOptionsProxy<AppRouter>,
  queryClient: QueryClient,
  todoListId: string,
) {
```

Update `todos` query:
```typescript
const todos = useQuery(trpc.todo.list.queryOptions({ todoListId }));
```

Update `createTodo` mutation:
```typescript
createTodo.mutate({ title: newTitle.trim(), todoListId });
```

Update `queryFilter` calls — all `trpc.todo.list.queryFilter()` become `trpc.todo.list.queryFilter({ todoListId })`:
- In `createTodo.onSuccess`
- In `completeTodo.onSuccess`
- In `deleteTodo.onSuccess`
- In `reorderTodos.onError`
- In `handleDragEnd` (both `cancelQueries` and `setQueryData`)

Update `importTodos` to send `todoListId` as form data:
```typescript
const importTodos = useMutation({
  mutationFn: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("todoListId", todoListId);
    // ... rest unchanged
  },
  onSuccess: (data) => {
    queryClient.invalidateQueries(trpc.todo.list.queryFilter({ todoListId }));
    toast.success(`Imported ${data.count} todos`);
  },
  // ...
});
```

Update `exportTodos` to include `todoListId`:
```typescript
const exportTodos = async () => {
  const res = await fetch(
    `${API_URL}/api/todos/export?todoListId=${todoListId}`,
    { credentials: "include" },
  );
  // ... rest unchanged
};
```

- [ ] **Step 3: Create list detail page**

Create `apps/web/src/routes/_authenticated/todo-lists.$listId.tsx`:

This is essentially the old `todos.tsx` but with:
- Route path `/_authenticated/todo-lists/$listId`
- Reads `listId` from route params
- Fetches list name via `trpc.todoList.get`
- Passes `todoListId` to `useTodos`
- Shows list name in heading with back link

```tsx
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { CompletedTodoItem } from "#/features/todo/completed-todo-item";
import { SortableTodoItem } from "#/features/todo/sortable-todo-item";
import { useTodos } from "#/features/todo/use-todos";

export const Route = createFileRoute("/_authenticated/todo-lists/$listId")({
  component: TodoListDetailPage,
});

function TodoListDetailPage() {
  const { trpc } = Route.useRouteContext();
  const { listId } = Route.useParams();
  const queryClient = useQueryClient();

  const listQuery = useQuery(trpc.todoList.get.queryOptions({ id: listId }));
  const {
    newTitle,
    setNewTitle,
    todos,
    activeTodos,
    completedTodos,
    sensors,
    createTodo,
    completeTodo,
    deleteTodo,
    handleSubmit,
    handleDragEnd,
    importTodos,
    exportTodos,
  } = useTodos(trpc, queryClient, listId);

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-6">
        <Link
          to={"/todo-lists" as string}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to lists
        </Link>
        <h1 className="text-3xl font-bold mt-2">
          {listQuery.data?.name ?? "Loading..."}
        </h1>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              importTodos.mutate(file);
              e.target.value = "";
            }
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={importTodos.isPending}
        >
          {importTodos.isPending ? "Importing..." : "Import CSV"}
        </Button>
        <Button variant="outline" size="sm" onClick={exportTodos}>
          Export CSV
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <Input
          type="text"
          placeholder="Add a todo..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={createTodo.isPending}>
          {createTodo.isPending ? "Adding..." : "Add"}
        </Button>
      </form>

      {todos.isPending ? (
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

- [ ] **Step 4: Regenerate routes and verify**

```bash
make routes
make lint
```

- [ ] **Step 5: Start dev server and test manually**

```bash
make dev
```

Test:
1. Navigate to `/todo-lists` — see empty state
2. Create a list "Groceries" — appears with "0 todos" badge
3. Click into list — see empty todos page with list name heading
4. Add todos, complete, delete, reorder — all work within the list
5. Import CSV — todos appear in the list
6. Export CSV — downloads only that list's todos
7. Go back to lists — badge shows correct count

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add todo-lists detail page, scope todos by list"
```

---

### Task 8: BDD Tests

**Files:**
- Create: `e2e/features/todo-lists.feature`
- Rewrite: `e2e/features/todos.feature`
- Create: `e2e/steps/todo-lists.ts`
- Modify: `e2e/steps/todos.ts`
- Modify: `e2e/steps/auth.ts`

- [ ] **Step 1: Create todo-lists.feature**

Create `e2e/features/todo-lists.feature`:

```gherkin
Feature: Todo Lists

  Scenario: Empty state shows no lists
    Given I am signed in as "empty-lists@example.com"
    And I am on the todo lists page
    Then I should see "No lists yet"

  Scenario: Create a todo list
    Given I am signed in as "create-list@example.com"
    And I am on the todo lists page
    When I create a list named "Groceries"
    Then I should see "Groceries"

  Scenario: Add a todo to a list
    Given I am signed in as "list-todo@example.com"
    And I am on the todo lists page
    And I have a list named "Work"
    And I am in the list "Work"
    When I fill in "Add a todo..." with "Finish report"
    And I click "Add"
    Then I should see "Finish report"

  Scenario: Delete a todo list
    Given I am signed in as "delete-list@example.com"
    And I am on the todo lists page
    And I have a list named "Old list"
    When I delete the list "Old list"
    Then I should not see "Old list"
    And I should see "No lists yet"

  Scenario: Lists are private to each user
    Given I am signed in as "private-list@example.com"
    And I am on the todo lists page
    And I have a list named "My private list"
    When I sign out and sign in as "other-list-user@example.com"
    And I am on the todo lists page
    Then I should not see "My private list"
    And I should see "No lists yet"
```

- [ ] **Step 2: Rewrite todos.feature**

Replace `e2e/features/todos.feature`:

```gherkin
Feature: Todo Management

  Scenario: Empty state shows no todos in a list
    Given I am signed in as "empty-todos@example.com"
    And I am on the todo lists page
    And I have a list named "Empty List"
    And I am in the list "Empty List"
    Then I should see "No todos yet"

  Scenario: Create a todo
    Given I am signed in as "create-todo@example.com"
    And I am on the todo lists page
    And I have a list named "Test List"
    And I am in the list "Test List"
    When I fill in "Add a todo..." with "Buy groceries"
    And I click "Add"
    Then I should see "Buy groceries"

  Scenario: Complete a todo
    Given I am signed in as "complete-todo@example.com"
    And I am on the todo lists page
    And I have a list named "Test List"
    And I am in the list "Test List"
    And I have a todo "Write tests"
    When I toggle the todo "Write tests"
    Then the todo "Write tests" should be completed

  Scenario: Delete a todo
    Given I am signed in as "delete-todo@example.com"
    And I am on the todo lists page
    And I have a list named "Test List"
    And I am in the list "Test List"
    And I have a todo "Old task"
    When I delete the todo "Old task"
    Then I should not see "Old task"

  Scenario: Todos are private to each user
    Given I am signed in as "private-todos@example.com"
    And I am on the todo lists page
    And I have a list named "Private List"
    And I am in the list "Private List"
    And I have a todo "My private task"
    When I sign out and sign in as "other-user@example.com"
    And I am on the todo lists page
    Then I should not see "My private task"

  Scenario: Reorder todos by dragging
    Given I am signed in as "reorder-todos@example.com"
    And I am on the todo lists page
    And I have a list named "Reorder List"
    And I am in the list "Reorder List"
    And I have a todo "First task"
    And I have a todo "Second task"
    When I drag "Second task" above "First task"
    Then "Second task" should appear before "First task"

  Scenario: Import todos from CSV
    Given I am signed in as "import-todos@example.com"
    And I am on the todo lists page
    And I have a list named "Import List"
    And I am in the list "Import List"
    When I import todos from "import-todos.csv"
    Then I should see "Buy milk"
    And I should see "Walk the dog"

  Scenario: Export todos as CSV
    Given I am signed in as "export-todos@example.com"
    And I am on the todo lists page
    And I have a list named "Export List"
    And I am in the list "Export List"
    And I have a todo "Export me"
    When I export todos
    Then the downloaded file should contain "Export me"
```

- [ ] **Step 3: Update auth.ts steps**

In `e2e/steps/auth.ts`:

Replace `I am on the todos page` with `I am on the todo lists page`:

```typescript
given("I am on the todo lists page", async ({ page }) => {
  await page.goto("/todo-lists");
  await page.waitForLoadState("networkidle");
});
```

Remove the old `I am on the todos page` step if it still exists.

- [ ] **Step 4: Create todo-lists.ts steps**

Create `e2e/steps/todo-lists.ts`:

```typescript
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given: given, When: when } = createBdd();

given("I have a list named {string}", async ({ page }, name: string) => {
  await page.getByPlaceholder("New list name...").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });
});

given("I am in the list {string}", async ({ page }, name: string) => {
  await page.getByText(name).first().click();
  await page.waitForLoadState("networkidle");
});

when("I create a list named {string}", async ({ page }, name: string) => {
  await page.getByPlaceholder("New list name...").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForLoadState("networkidle");
});

when("I delete the list {string}", async ({ page }, name: string) => {
  const row = page.locator("li", { hasText: name });
  await row.getByRole("button", { name: /Delete/i }).click();
  await row.waitFor({ state: "detached", timeout: 5000 });
});
```

- [ ] **Step 5: Generate BDD tests and run**

```bash
cd e2e && pnpm exec bddgen
make test
```

Expected: All tests pass — todo-lists + todos + auth + mobile-nav.

- [ ] **Step 6: Commit**

```bash
git add e2e/
git commit -m "feat: add BDD tests for todo lists, rewrite todo scenarios for list context"
```

---

### Task 9: Update Documentation (CLAUDE.md files)

**Files:**
- Modify: `packages/db/CLAUDE.md`
- Modify: `packages/api/CLAUDE.md`
- Modify: `apps/web/CLAUDE.md`
- Modify: `e2e/CLAUDE.md`

- [ ] **Step 1: Update packages/db/CLAUDE.md**

Add `todo-list.prisma` to the schema organization table:

```
| `todo-list.prisma` | Application | TodoList |
```

- [ ] **Step 2: Update packages/api/CLAUDE.md**

Add a note about the `include` pattern in the "Frontend Type Contracts" section:

```markdown
### Include Pattern (Prisma relations)

When a service uses `include` (e.g., `listTodoLists` with `_count`), the type flows correctly through `inferRouterOutputs`. The issue arises in `setQueryData` callbacks — see `apps/web/CLAUDE.md` for the workaround.
```

- [ ] **Step 3: Update apps/web/CLAUDE.md**

Add the `include` type workaround to the "Optimistic Updates" section:

```markdown
### Include Type Workaround

When using `setQueryData` on a query that returns data with Prisma `include`, tRPC's type inference breaks on the callback parameter. Define an explicit type:

\`\`\`typescript
type TodoListWithCount = RouterOutput["todoList"]["list"][number];

queryClient.setQueryData<TodoListWithCount[]>(
  trpc.todoList.list.queryFilter().queryKey,
  (old) => old?.filter((list) => list.id !== id),
);
\`\`\`

See `features/todo-list/use-todo-lists.ts` for the full optimistic delete pattern.
```

- [ ] **Step 4: Update e2e/CLAUDE.md**

Update step definition organization to include `todo-lists.ts`.

- [ ] **Step 5: Verify and commit**

```bash
make lint
git add -A
git commit -m "docs: update CLAUDE.md files for TodoList feature"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full quality gate**

```bash
make lint
```

- [ ] **Step 2: Run unit tests**

```bash
make test-unit
```

- [ ] **Step 3: Run E2E tests**

```bash
make test
```

- [ ] **Step 4: Verify no stale references**

```bash
grep -rn "\"\/todos\"" apps/ e2e/ --include="*.ts" --include="*.tsx" --include="*.feature" | grep -v node_modules | grep -v .features-gen | grep -v routeTree.gen | grep -v CLAUDE.md
```

Expected: No references to the old `/todos` route in source code.
