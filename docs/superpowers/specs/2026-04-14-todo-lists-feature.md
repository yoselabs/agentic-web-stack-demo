# Todo Lists Feature

## Goal

Add a TodoList model as a container for todos. Demonstrates Prisma relations with `include`, Badge component, parameterized routes, and multi-page navigation. Sets up the foundation for future features (breadcrumbs, realtime per-list, AI chat scope).

## Motivation

Three problems solved:

1. **Template gap:** No Prisma `include` pattern exists. Every experiment that adds relations hits a tRPC type inference issue (`() => never`). Adding TodoList → Todo relation with documented workaround prevents this.
2. **Missing Badge component:** Every experiment needs Badge but it's not in the template. TodoList color badges justify its inclusion.
3. **Single-page limitation:** The template only has flat pages (dashboard, todos). TodoList adds a list → detail navigation pattern that future features (boards, projects, chat rooms) will follow.

## Schema

### New: `packages/db/prisma/schema/todo-list.prisma`

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

### Modified: `packages/db/prisma/schema/todo.prisma`

Add required relation to TodoList:

```prisma
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

Note: `todoListId` is required (not optional). This is a template project — there is no production data to migrate. Every todo belongs to a list.

### Modified: `packages/db/prisma/schema/auth.prisma`

Add reverse relation to User:

```prisma
  todoLists TodoList[]
```

## Migration

This is a template project with no production data. The schema change is destructive (adds a required `todoListId` column). `make db-push` handles it. All existing test data is ephemeral (created per test run).

## Backend

### New: `packages/api/src/services/todo-list.ts`

```typescript
import { type Prisma, type PrismaClient } from "@project/db";

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

export async function getTodoList(db: DbClient, userId: string, id: string) {
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
    data: { name, color, userId },
  });
}

export async function deleteTodoList(db: DbClient, userId: string, id: string) {
  const list = await db.todoList.findFirstOrThrow({
    where: { id, userId },
  });
  return db.todoList.delete({ where: { id: list.id } });
}
```

Note: `deleteTodoList` uses `findFirstOrThrow` + `delete` for authorization safety (verifies ownership before deleting by unique ID).

### New: `packages/api/src/routers/todo-list.ts`

```typescript
import { z } from "zod";
import {
  createTodoList,
  deleteTodoList,
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

### Modified: `packages/api/src/router.ts`

Mount as `todoList: todoListRouter`.

### Modified: Todo service (`packages/api/src/services/todo.ts`)

All todo operations become scoped by `todoListId`:

- `listTodos(db, userId, todoListId)` — filter by `todoListId`, add `include: { todoList: true }`
- `createTodo(db, userId, title, todoListId)` — require `todoListId` parameter
- `lockActiveTodos(db, userId, todoListId)` — scope lock to `todoListId`
- `shiftActivePositions(db, userId, todoListId)` — scope shift to `todoListId`
- `reorderTodos(db, userId, ids)` — unchanged (IDs already scope to the right todos)
- `completeTodo`, `deleteTodo` — unchanged (operate by todo ID)
- `importTodosFromCSV(db, userId, csvData, todoListId)` — require `todoListId`, assign to list
- `exportTodosAsCSV(db, userId, todoListId)` — require `todoListId`, export only that list's todos

### Modified: Todo router (`packages/api/src/routers/todo.ts`)

All procedures that create or list todos require `todoListId` in their input:

```typescript
list: protectedProcedure
  .input(z.object({ todoListId: z.string() }))
  .query(({ ctx, input }) => {
    return listTodos(ctx.db, ctx.session.user.id, input.todoListId);
  }),
create: protectedProcedure
  .input(z.object({ title: z.string().min(1), todoListId: z.string() }))
  .mutation(({ ctx, input }) => {
    return ctx.db.$transaction((tx) =>
      createTodo(tx, ctx.session.user.id, input.title, input.todoListId),
    );
  }),
```

### Modified: Hono routes (`apps/server/src/index.ts`)

```typescript
// Todo import — multipart CSV, scoped to list
app.post("/api/todos/import", async (c) => {
  // ... auth check, file validation (unchanged) ...

  const todoListId = formData.get("todoListId");
  if (typeof todoListId !== "string")
    return c.json({ error: "todoListId is required" }, 400);

  const result = await db.$transaction((tx) =>
    importTodosFromCSV(tx, session.user.id, buffer, todoListId),
  );
  return c.json(result, 201);
});

// Todo export — CSV download, scoped to list
app.get("/api/todos/export", async (c) => {
  // ... auth check ...

  const todoListId = c.req.query("todoListId");
  if (!todoListId)
    return c.json({ error: "todoListId is required" }, 400);

  const csv = await exportTodosAsCSV(db, session.user.id, todoListId);
  // ... return CSV response ...
});
```

## Frontend

### New: Badge component

```bash
cd packages/ui && pnpm dlx shadcn@latest add badge
```

### Removed: `/todos` route

Delete `apps/web/src/routes/_authenticated/todos.tsx`. This page is replaced by the list detail page at `/todo-lists/$listId`.

### New: `/todo-lists` — index page

Route: `apps/web/src/routes/_authenticated/todo-lists.index.tsx`

Shows all todo lists as cards. Each card displays:
- List name
- Badge with list color showing todo count (e.g., "3 todos")
- Delete button

"New List" form at the top (name input + create button). No color picker in V1 — uses default indigo. Color parameter exists in the API for future use.

Empty state: "No lists yet. Create one to get started."

### New: `/todo-lists/$listId` — list detail page

Route: `apps/web/src/routes/_authenticated/todo-lists.$listId.tsx`

This replaces the old todos page. Same functionality (CRUD, drag-and-drop, import/export) but scoped to the list. The heading shows the list name with a Badge in the list color. Back navigation to `/todo-lists`.

Import form sends `todoListId` alongside the CSV file. Export URL includes `?todoListId=...`.

### New: Optimistic delete for TodoList (demonstrates the `include` type pattern)

The `use-todo-lists.ts` hook includes an optimistic delete mutation that demonstrates the `setQueryData` workaround:

```typescript
type TodoListWithCount = RouterOutput["todoList"]["list"][number];

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
```

This is the key pattern reference — it shows how to explicitly type the `setQueryData` callback when the router output includes Prisma `include` data.

### Modified: Navbar

- "Todos" → "Todo Lists" pointing to `/todo-lists`

### Feature organization

```
src/features/
  todo-list/
    types.ts           # TodoListWithCount type from router output
    use-todo-lists.ts  # list query, create/delete mutations (with optimistic delete)
  todo/
    types.ts           # Todo type (now includes todoList relation)
    use-todos.ts       # existing, scoped to todoListId
```

### Modified: `apps/web/src/features/todo/use-todos.ts`

- `useTodos` hook now accepts `todoListId` as a parameter
- All queries and mutations pass `todoListId`
- Import sends `todoListId` as form data field
- Export appends `?todoListId=...` to the URL

## Type Pattern Documentation

### The `include` type workaround (add to `apps/web/CLAUDE.md`)

When a Prisma query uses `include`, the frontend type inference via `inferRouterOutputs<AppRouter>` works correctly for deriving types. The issue occurs with `setQueryData` callbacks where tRPC's type inference breaks on the callback parameter.

**Workaround:**

```typescript
// 1. Define explicit type matching the router output shape
import type { AppRouter, inferRouterOutputs } from "@project/api";
type RouterOutput = inferRouterOutputs<AppRouter>;
type TodoListWithCount = RouterOutput["todoList"]["list"][number];

// 2. Use explicit type generic in setQueryData
queryClient.setQueryData<TodoListWithCount[]>(
  trpc.todoList.list.queryFilter().queryKey,
  (old) => {
    if (!old) return old;
    return old.filter((list) => list.id !== deletedId);
  },
);
```

**Why:** tRPC's `queryKey` type inference breaks on the `onMutate` callback parameter, returning `unknown` instead of the expected type. The explicit `<TodoListWithCount[]>` generic bypasses this.

**When:** Any `setQueryData` or `getQueryData` call on a tRPC query that returns data with Prisma `include`.

## BDD Scenarios

### New: `e2e/features/todo-lists.feature`

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

### Rewritten: `e2e/features/todos.feature`

All todo scenarios now operate within a list. The `/todos` route no longer exists.

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

### New step definitions needed

- `Given I am on the todo lists page` — navigate to `/todo-lists`
- `When I create a list named {string}` — fill name, click Create
- `Given I have a list named {string}` — create a list via UI
- `Given I am in the list {string}` — click list card to navigate to detail
- `When I delete the list {string}` — click delete button on list card
- Existing todo steps (`I have a todo`, `I toggle the todo`, etc.) work unchanged within the list detail page

### Step definition organization

- `e2e/steps/todo-lists.ts` — new file for list-specific steps
- `e2e/steps/todos.ts` — existing, unchanged (operates within whatever page is current)
- `e2e/steps/auth.ts` — update: remove `I am on the todos page`, add `I am on the todo lists page`

## Testing

### Unit tests: `packages/api/src/services/__tests__/todo-list.test.ts`

- List todo lists (empty)
- Create a todo list
- Get a todo list by ID
- Delete a todo list (with ownership check)
- List with `_count` includes todo count

### Unit tests: `packages/api/src/services/__tests__/todo.test.ts`

- All existing tests updated to create a TodoList first and pass `todoListId`
- New test: `listTodos` returns `todoList` via include
- New test: `lockActiveTodos` scoped to `todoListId` (todos in other lists unaffected)

### Router integration tests: `packages/api/src/__tests__/todo-list.test.ts`

- Rejects unauthenticated calls
- Round-trip create and list

## CLAUDE.md Updates

### `packages/api/CLAUDE.md`

Add to the "Adding a New Feature" section: example of a service using `include` (TodoList with `_count`).

### `apps/web/CLAUDE.md`

Add the `include` type workaround documentation (see Type Pattern Documentation section above).

Update the "Hook Extraction Pattern" example to reference `use-todo-lists.ts` alongside `use-todos.ts`.

### `packages/db/CLAUDE.md`

Add `todo-list.prisma` to the schema organization table.

### `e2e/CLAUDE.md`

Update step definition organization to include `todo-lists.ts`.

## Architecture Notes

- TodoList is a simple container — no position/ordering on lists themselves (`createdAt desc`)
- `todoListId` is required on Todo (not optional). This is a template — no legacy data to migrate
- The `include: { todoList: true }` on todo queries is the key pattern this feature demonstrates
- `include: { _count: { select: { todos: true } } }` on list queries demonstrates the aggregate include pattern
- The optimistic delete mutation in `use-todo-lists.ts` is the concrete example of the `setQueryData` type workaround
- Color is a hex string with default indigo. No color picker in V1 — the `color` parameter exists in the API for future use
- `deleteTodoList` uses `findFirstOrThrow` + `delete` pattern for authorization safety (not compound `where` on `delete`)
- `lockActiveTodos` and `shiftActivePositions` are scoped by `todoListId` to prevent cross-list position interference
- No `updateTodoList` endpoint in V1 — intentionally deferred
