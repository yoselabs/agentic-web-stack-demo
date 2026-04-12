# Todo Drag and Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-and-drop reordering to the todo list with position persistence and completed-todo auto-sorting.

**Architecture:** Integer `position` column on Todo model. Active todos sorted by position (0 = top), completed todos auto-sink to bottom. `@dnd-kit/sortable` on the frontend with optimistic reorder and a batch `todo.reorder` mutation.

**Tech Stack:** Prisma (schema), tRPC (mutations), @dnd-kit/core + @dnd-kit/sortable (DnD), Playwright (BDD test)

---

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/db/prisma/schema.prisma` | Add `position Int @default(0)` to Todo |
| Modify | `packages/api/src/router.ts` | Update `todo.list` ordering, `todo.create` position shift, `todo.complete` uncomplete shift, add `todo.reorder` mutation |
| Modify | `packages/api/src/__tests__/todo.test.ts` | Add tests for reorder, position on create, uncomplete repositioning |
| Modify | `apps/web/src/routes/_authenticated/todos.tsx` | Split active/completed sections, add DnD context, SortableItem, reorder mutation |
| Create | `e2e/features/todos-reorder.feature` | BDD scenario for drag reorder |
| Create | `e2e/steps/todos-reorder.ts` | Playwright drag step definition |

---

### Task 1: Add position column to Prisma schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma:24-33`

- [ ] **Step 1: Add position field to Todo model**

```prisma
model Todo {
  id        String   @id @default(cuid())
  title     String
  completed Boolean  @default(false)
  position  Int      @default(0)
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Push schema to dev database**

Run: `make db-push`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat: add position column to Todo model"
```

---

### Task 2: Update tRPC router — list ordering and create with position

**Files:**
- Modify: `packages/api/src/router.ts`

- [ ] **Step 1: Write integration tests for position behavior**

Add to `packages/api/src/__tests__/todo.test.ts` — new `describe("todo.reorder")` block and updated create test. Add these test cases at the end of the existing test file, inside the outer `describe`:

```typescript
it("creates todos at position 0 and shifts others", async () => {
  const first = await caller.todo.create({ title: "First" });
  const second = await caller.todo.create({ title: "Second" });

  const todos = await caller.todo.list();
  const active = todos.filter((t) => !t.completed);

  // Second was created last, should be at position 0 (top)
  expect(active[0]?.title).toBe("Second");
  expect(active[0]?.position).toBe(0);
  expect(active[1]?.title).toBe("First");
  expect(active[1]?.position).toBe(1);
});

it("reorders active todos", async () => {
  const first = await caller.todo.create({ title: "A" });
  const second = await caller.todo.create({ title: "B" });
  const third = await caller.todo.create({ title: "C" });

  // Current order: C (0), B (1), A (2)
  // Reorder to: A, C, B
  await caller.todo.reorder({ ids: [first.id, third.id, second.id] });

  const todos = await caller.todo.list();
  const active = todos.filter((t) => !t.completed);
  expect(active.map((t) => t.title)).toEqual(["A", "C", "B"]);
});

it("sorts completed todos after active ones", async () => {
  const first = await caller.todo.create({ title: "Active" });
  const second = await caller.todo.create({ title: "Done" });
  await caller.todo.complete({ id: second.id, completed: true });

  const todos = await caller.todo.list();
  expect(todos[0]?.title).toBe("Active");
  expect(todos[1]?.title).toBe("Done");
  expect(todos[1]?.completed).toBe(true);
});

it("uncompleting a todo moves it to position 0", async () => {
  const first = await caller.todo.create({ title: "Stay" });
  const second = await caller.todo.create({ title: "Toggle" });
  await caller.todo.complete({ id: second.id, completed: true });
  await caller.todo.complete({ id: second.id, completed: false });

  const todos = await caller.todo.list();
  const active = todos.filter((t) => !t.completed);
  expect(active[0]?.title).toBe("Toggle");
  expect(active[0]?.position).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @project/api test`
Expected: FAIL — `reorder` doesn't exist, ordering is wrong, no `position` field

- [ ] **Step 3: Update the todo router**

Replace the entire `packages/api/src/router.ts` content with:

```typescript
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./trpc.js";

const todoRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.todo.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: [{ completed: "asc" }, { position: "asc" }],
    });
  }),
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Shift existing active todos down
      await ctx.db.todo.updateMany({
        where: { userId: ctx.session.user.id, completed: false },
        data: { position: { increment: 1 } },
      });
      return ctx.db.todo.create({
        data: {
          title: input.title,
          userId: ctx.session.user.id,
          position: 0,
        },
      });
    }),
  complete: protectedProcedure
    .input(z.object({ id: z.string(), completed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!input.completed) {
        // Uncompleting: move to top (position 0), shift others
        await ctx.db.todo.updateMany({
          where: { userId: ctx.session.user.id, completed: false },
          data: { position: { increment: 1 } },
        });
        return ctx.db.todo.update({
          where: { id: input.id, userId: ctx.session.user.id },
          data: { completed: false, position: 0 },
        });
      }
      return ctx.db.todo.update({
        where: { id: input.id, userId: ctx.session.user.id },
        data: { completed: input.completed },
      });
    }),
  reorder: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Batch update: set position = index for each ID
      await ctx.db.$transaction(
        input.ids.map((id, index) =>
          ctx.db.todo.update({
            where: { id, userId: ctx.session.user.id },
            data: { position: index },
          }),
        ),
      );
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.todo.delete({
        where: { id: input.id, userId: ctx.session.user.id },
      });
    }),
});

export const appRouter = router({
  healthCheck: publicProcedure.query(() => "OK"),
  hello: publicProcedure.query(() => ({
    message: "Hello from tRPC!",
  })),
  me: protectedProcedure.query(({ ctx }) => ({
    user: ctx.session.user,
  })),
  todo: todoRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @project/api test`
Expected: all tests PASS

- [ ] **Step 5: Run make check**

Run: `make check`
Expected: 13 passed, 0 failed + typecheck clean

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/router.ts packages/api/src/__tests__/todo.test.ts
git commit -m "feat: add position ordering and reorder mutation to todo router"
```

---

### Task 3: Install dnd-kit and update todo page frontend

**Files:**
- Modify: `apps/web/src/routes/_authenticated/todos.tsx`

- [ ] **Step 1: Install dnd-kit dependencies**

```bash
pnpm --filter @project/web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Rewrite the todos page with DnD**

Replace `apps/web/src/routes/_authenticated/todos.tsx` with:

```tsx
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/todos")({
  component: TodosPage,
});

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  position: number;
}

function SortableTodoItem({
  todo,
  onComplete,
  onDelete,
}: {
  todo: Todo;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 rounded-lg border bg-background cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={onComplete}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4"
      />
      <span className="flex-1">{todo.title}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="text-destructive hover:text-destructive"
      >
        Delete
      </Button>
    </li>
  );
}

function TodosPage() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
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

    // Optimistic reorder
    const reordered = [...activeTodos];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Update cache optimistically
    queryClient.setQueryData(
      trpc.todo.list.queryFilter().queryKey,
      [...reordered, ...completedTodos],
    );

    // Persist to server
    reorderTodos.mutate({ ids: reordered.map((t) => t.id) });
  };

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
              {activeTodos.length > 0 && (
                <div className="border-t my-4" />
              )}
              <ul className="space-y-2">
                {completedTodos.map((todo) => (
                  <li
                    key={todo.id}
                    className="flex items-center gap-3 p-3 rounded-lg border opacity-60"
                  >
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() =>
                        completeTodo.mutate({
                          id: todo.id,
                          completed: !todo.completed,
                        })
                      }
                      className="h-4 w-4"
                    />
                    <span className="flex-1 line-through text-muted-foreground">
                      {todo.title}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTodo.mutate({ id: todo.id })}
                      className="text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </li>
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
Expected: 13 passed, 0 failed + typecheck clean

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_authenticated/todos.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat: add drag-and-drop reordering to todo list"
```

---

### Task 4: Add BDD test for drag reorder

**Files:**
- Create: `e2e/features/todos-reorder.feature`
- Create: `e2e/steps/todos-reorder.ts`

- [ ] **Step 1: Write the Gherkin feature**

Create `e2e/features/todos-reorder.feature`:

```gherkin
Feature: Todo Reordering

  Scenario: Reorder todos by dragging
    Given I am signed in as "reorder-todos@example.com"
    And I navigate to "/todos"
    And I have a todo "First task"
    And I have a todo "Second task"
    When I drag "Second task" above "First task"
    Then "Second task" should appear before "First task"
```

- [ ] **Step 2: Write the step definition for drag**

Create `e2e/steps/todos-reorder.ts`:

```typescript
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { When: when, Then: then } = createBdd();

when(
  "I drag {string} above {string}",
  async ({ page }, source: string, target: string) => {
    const sourceItem = page.locator("li", { hasText: source });
    const targetItem = page.locator("li", { hasText: target });

    // Get bounding boxes
    const targetBox = await targetItem.boundingBox();
    if (!targetBox) throw new Error(`Could not find target item "${target}"`);

    // Drag source to the top edge of target (above it)
    await sourceItem.dragTo(targetItem, {
      targetPosition: { x: targetBox.width / 2, y: 0 },
    });

    // Wait for optimistic update to settle
    await page.waitForLoadState("networkidle");
  },
);

then(
  "{string} should appear before {string}",
  async ({ page }, first: string, second: string) => {
    const items = page.locator("ul").first().locator("li");
    const texts: string[] = [];
    for (let i = 0; i < (await items.count()); i++) {
      const text = await items.nth(i).innerText();
      texts.push(text);
    }

    const firstIndex = texts.findIndex((t) => t.includes(first));
    const secondIndex = texts.findIndex((t) => t.includes(second));

    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThanOrEqual(0);
    expect(firstIndex).toBeLessThan(secondIndex);
  },
);
```

- [ ] **Step 3: Run BDD tests**

Run: `make test`
Expected: 25 passed (23 existing + 2 new reorder scenarios for desktop + mobile)

Note: the "I have a todo" and "I navigate to" steps are already defined in existing step files. Only the drag and order assertion steps are new.

- [ ] **Step 4: Run make check**

Run: `make check`
Expected: 13 passed, 0 failed

- [ ] **Step 5: Commit**

```bash
git add e2e/features/todos-reorder.feature e2e/steps/todos-reorder.ts
git commit -m "test: add BDD scenario for todo drag-and-drop reorder"
```

---

### Task 5: Update seed script and docs

**Files:**
- Modify: `scripts/seed.ts`
- Modify: `TODO.md`

- [ ] **Step 1: Update seed to include position values**

In `scripts/seed.ts`, update the `createMany` call to include explicit positions:

```typescript
await db.todo.createMany({
  data: [
    { title: "Set up the project", completed: true, position: 0, userId: user.id },
    { title: "Add authentication", completed: true, position: 1, userId: user.id },
    { title: "Build the dashboard", completed: false, position: 0, userId: user.id },
    { title: "Write BDD tests", completed: false, position: 1, userId: user.id },
    { title: "Deploy to production", completed: false, position: 2, userId: user.id },
  ],
});
```

- [ ] **Step 2: Mark drag-and-drop as done in TODO.md**

Change the drag-and-drop line from `[ ]` to `[x]` and update the description:
```
- [x] **[recipe]** Drag and drop — @dnd-kit/sortable with position-based ordering on todo list
```

- [ ] **Step 3: Run make check**

Run: `make check`
Expected: 13 passed, 0 failed

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.ts TODO.md
git commit -m "chore: update seed positions and mark drag-and-drop done"
```
