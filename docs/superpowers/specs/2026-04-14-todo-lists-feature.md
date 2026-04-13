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

Add optional relation to TodoList:

```prisma
model Todo {
  id         String    @id @default(cuid())
  title      String
  completed  Boolean   @default(false)
  position   Int       @default(0)
  userId     String
  todoListId String?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  todoList TodoList? @relation(fields: [todoListId], references: [id], onDelete: Cascade)
}
```

### Modified: `packages/db/prisma/schema/auth.prisma`

Add reverse relation to User:

```prisma
  todoLists TodoList[]
```

## Backend

### New: `packages/api/src/services/todo-list.ts`

```typescript
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
  return db.todoList.delete({
    where: { id, userId },
  });
}
```

### New: `packages/api/src/routers/todo-list.ts`

```typescript
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

### Modified: Todo service

- `listTodos` — add filter by `todoListId`, add `include: { todoList: true }` to return list info with each todo
- `createTodo` — accept optional `todoListId` parameter
- `importTodosFromCSV` — accept optional `todoListId`, assign imported todos to the list
- `exportTodosAsCSV` — accept optional `todoListId`, export only that list's todos

### Modified: Todo router

- All todo procedures that take `todoListId` pass it through to services

### Modified: Hono routes

- `POST /api/todos/import` — accept optional `todoListId` in form data
- `GET /api/todos/export` — accept optional `todoListId` query param

## Frontend

### New: Badge component

```bash
cd packages/ui && pnpm dlx shadcn@latest add badge
```

### New: `/todo-lists` — index page

Route: `apps/web/src/routes/_authenticated/todo-lists.index.tsx`

Shows all todo lists as cards. Each card displays:
- List name
- Badge with list color showing todo count (e.g., "3 todos")
- Delete button

"New List" form at the top (name input + optional color picker + create button).

Empty state: "No lists yet. Create one to get started."

### Modified: `/todo-lists/$listId` — list detail page

Route: `apps/web/src/routes/_authenticated/todo-lists.$listId.tsx`

This is the current todos page, scoped to a specific list. The heading shows the list name. Each todo shows a Badge with the list color/name (useful when viewing all todos later).

Import/export operates on the current list's todos.

### Modified: Navbar

- "Todos" → "Todo Lists" pointing to `/todo-lists`

### Feature organization

```
src/features/
  todo-list/
    types.ts         # TodoList type from router output
    use-todo-lists.ts  # list query, create/delete mutations
  todo/
    types.ts         # Todo type (now includes todoList relation)
    use-todos.ts     # existing, scoped to todoListId
```

## Type Pattern Documentation

### The `include` type workaround

When a Prisma query uses `include`, the frontend type inference via `inferRouterOutputs<AppRouter>` works correctly for the top-level type. The issue occurs with `setQueryData` callbacks where the inferred type becomes `unknown`.

**Workaround** (document in `apps/web/CLAUDE.md`):

```typescript
// Define explicit type matching the router output shape
type TodoListWithCount = RouterOutput["todoList"]["list"][number];

// Use explicit type in setQueryData
queryClient.setQueryData<TodoListWithCount[]>(
  trpc.todoList.list.queryFilter().queryKey,
  (old) => { ... }
);
```

This pattern is already partially documented for `setQueryData` callbacks. The TodoList feature provides a concrete example.

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

  Scenario: Navigate to list and add todo
    Given I am signed in as "list-todo@example.com"
    And I am on the todo lists page
    And I have a list named "Work"
    When I open the list "Work"
    And I fill in "Add a todo..." with "Finish report"
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

### Modified: `e2e/features/todos.feature`

Existing todo scenarios now operate within a list context. Each scenario creates a list first, then navigates into it.

```gherkin
  Scenario: Create a todo in a list
    Given I am signed in as "create-todo@example.com"
    And I am on the todo lists page
    And I have a list named "Test List"
    And I am in the list "Test List"
    When I fill in "Add a todo..." with "Buy groceries"
    And I click "Add"
    Then I should see "Buy groceries"
```

Import/export scenarios also operate within a list.

## Testing

### Unit tests: `packages/api/src/services/__tests__/todo-list.test.ts`

- List todo lists (empty)
- Create a todo list
- Get a todo list
- Delete a todo list
- List with `_count` includes todo count

### Unit tests: `packages/api/src/services/__tests__/todo.test.ts`

- Existing tests updated to pass `todoListId` where needed
- New test: `listTodos` returns `todoList` via include

### Router integration tests: `packages/api/src/__tests__/todo-list.test.ts`

- Rejects unauthenticated calls
- Round-trip create and list

## Architecture Notes

- TodoList is a simple container — no position/ordering on lists themselves (just `createdAt desc`)
- Todo's `todoListId` is optional to maintain backward compatibility with existing data during migration. New todos created through the UI always have a `todoListId`.
- The `include: { todoList: true }` on todo queries is the key pattern this feature demonstrates. The type workaround is documented in CLAUDE.md.
- `include: { _count: { select: { todos: true } } }` on list queries demonstrates the aggregate include pattern.
- Color is a hex string with a default indigo. The Badge renders with that color as background. No color picker in V1 — just the default or hardcoded options.
