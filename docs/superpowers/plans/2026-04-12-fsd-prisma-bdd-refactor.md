# FSD + Prisma + BDD Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce medium-scale patterns: extract todo feature into FSD, split Prisma schema per-domain, consolidate BDD feature files by domain, update all docs.

**Architecture:** Pure refactoring — no new features. Move files into proper structure, update imports, update documentation to enforce patterns for future development.

**Tech Stack:** Prisma (multi-file schema), TypeScript (FSD components), playwright-bdd (feature consolidation)

---

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/web/src/features/todo/types.ts` | Todo interface |
| Create | `apps/web/src/features/todo/sortable-todo-item.tsx` | Draggable active todo item |
| Create | `apps/web/src/features/todo/completed-todo-item.tsx` | Static completed todo item |
| Modify | `apps/web/src/routes/_authenticated/todos.tsx` | Thin shell: DnD context, mutations, layout |
| Create | `packages/db/prisma/schema/base.prisma` | Generator + datasource config |
| Create | `packages/db/prisma/schema/auth.prisma` | User, Session, Account, Verification |
| Create | `packages/db/prisma/schema/todo.prisma` | Todo model |
| Delete | `packages/db/prisma/schema.prisma` | Replaced by schema/ directory |
| Modify | `e2e/features/todos.feature` | Add reorder scenario |
| Delete | `e2e/features/todos-reorder.feature` | Merged into todos.feature |
| Modify | `e2e/steps/todos.ts` | Add drag + order assertion steps |
| Delete | `e2e/steps/todos-reorder.ts` | Merged into todos.ts |
| Modify | `apps/web/CLAUDE.md` | Add FSD enforcement rule |
| Modify | `packages/db/CLAUDE.md` | Document multi-file schema |
| Modify | `e2e/CLAUDE.md` | Document feature file = domain area rule |

---

### Task 1: Extract `features/todo/` from route file

**Files:**
- Create: `apps/web/src/features/todo/types.ts`
- Create: `apps/web/src/features/todo/sortable-todo-item.tsx`
- Create: `apps/web/src/features/todo/completed-todo-item.tsx`
- Modify: `apps/web/src/routes/_authenticated/todos.tsx`

- [ ] **Step 1: Create `apps/web/src/features/todo/types.ts`**

```typescript
export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  position: number;
}
```

- [ ] **Step 2: Create `apps/web/src/features/todo/sortable-todo-item.tsx`**

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@project/ui/components/button";
import type { Todo } from "./types";

export function SortableTodoItem({
  todo,
  onComplete,
  onDelete,
}: {
  todo: Todo;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

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
```

- [ ] **Step 3: Create `apps/web/src/features/todo/completed-todo-item.tsx`**

```tsx
import { Button } from "@project/ui/components/button";
import type { Todo } from "./types";

export function CompletedTodoItem({
  todo,
  onUncomplete,
  onDelete,
}: {
  todo: Todo;
  onUncomplete: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 p-3 rounded-lg border opacity-60">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={onUncomplete}
        className="h-4 w-4"
      />
      <span className="flex-1 line-through text-muted-foreground">
        {todo.title}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDelete()}
        className="text-destructive hover:text-destructive"
      >
        Delete
      </Button>
    </li>
  );
}
```

- [ ] **Step 4: Rewrite `apps/web/src/routes/_authenticated/todos.tsx` as thin shell**

Replace entire file with:

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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CompletedTodoItem } from "#/features/todo/completed-todo-item";
import { SortableTodoItem } from "#/features/todo/sortable-todo-item";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/todos")({
  component: TodosPage,
});

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

    const reordered = [...activeTodos];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    queryClient.setQueryData(trpc.todo.list.queryFilter().queryKey, [
      ...reordered,
      ...completedTodos,
    ]);

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

- [ ] **Step 5: Run quality gate**

Run: `make -C /Users/iorlas/Workspaces/agentic-web-stack fix && make -C /Users/iorlas/Workspaces/agentic-web-stack check`
Expected: 13 passed, 0 failed + typecheck clean

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/todo/ apps/web/src/routes/_authenticated/todos.tsx
git commit -m "refactor: extract todo feature components into FSD features/todo/"
```

---

### Task 2: Split Prisma schema into per-domain files

**Files:**
- Create: `packages/db/prisma/schema/base.prisma`
- Create: `packages/db/prisma/schema/auth.prisma`
- Create: `packages/db/prisma/schema/todo.prisma`
- Delete: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Create `packages/db/prisma/schema/` directory**

```bash
mkdir -p /Users/iorlas/Workspaces/agentic-web-stack/packages/db/prisma/schema
```

- [ ] **Step 2: Create `packages/db/prisma/schema/base.prisma`**

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["prismaSchemaFolder"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 3: Create `packages/db/prisma/schema/auth.prisma`**

```prisma
// Better-Auth owned tables — add columns only, do not rename/remove existing ones.

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
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  ipAddress String?
  userAgent String?
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Verification {
  id         String    @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime? @default(now())
  updatedAt  DateTime? @updatedAt
}
```

- [ ] **Step 4: Create `packages/db/prisma/schema/todo.prisma`**

```prisma
// Application owned — full control.

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

- [ ] **Step 5: Delete old single schema file**

```bash
rm /Users/iorlas/Workspaces/agentic-web-stack/packages/db/prisma/schema.prisma
```

- [ ] **Step 6: Push schema to verify it works**

Run: `make -C /Users/iorlas/Workspaces/agentic-web-stack db-push`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 7: Run quality gate**

Run: `make -C /Users/iorlas/Workspaces/agentic-web-stack check`
Expected: 13 passed, 0 failed + typecheck clean

- [ ] **Step 8: Commit**

```bash
git add packages/db/prisma/schema/ && git rm packages/db/prisma/schema.prisma
git commit -m "refactor: split Prisma schema into per-domain files (auth, todo)"
```

---

### Task 3: Consolidate BDD feature files by domain

**Files:**
- Modify: `e2e/features/todos.feature`
- Delete: `e2e/features/todos-reorder.feature`
- Modify: `e2e/steps/todos.ts`
- Delete: `e2e/steps/todos-reorder.ts`

- [ ] **Step 1: Append reorder scenario to `e2e/features/todos.feature`**

The file should become:

```gherkin
Feature: Todo Management

  Scenario: Empty state shows no todos
    Given I am signed in as "empty-todos@example.com"
    And I navigate to "/todos"
    Then I should see "No todos yet"

  Scenario: Create a todo
    Given I am signed in as "create-todo@example.com"
    And I navigate to "/todos"
    When I fill in "Add a todo..." with "Buy groceries"
    And I click "Add"
    Then I should see "Buy groceries"

  Scenario: Complete a todo
    Given I am signed in as "complete-todo@example.com"
    And I navigate to "/todos"
    And I have a todo "Write tests"
    When I toggle the todo "Write tests"
    Then the todo "Write tests" should be completed

  Scenario: Delete a todo
    Given I am signed in as "delete-todo@example.com"
    And I navigate to "/todos"
    And I have a todo "Old task"
    When I delete the todo "Old task"
    Then I should not see "Old task"

  Scenario: Todos are private to each user
    Given I am signed in as "private-todos@example.com"
    And I navigate to "/todos"
    And I have a todo "My private task"
    When I sign out and sign in as "other-user@example.com"
    And I navigate to "/todos"
    Then I should not see "My private task"
    And I should see "No todos yet"

  Scenario: Reorder todos by dragging
    Given I am signed in as "reorder-todos@example.com"
    And I navigate to "/todos"
    And I have a todo "First task"
    And I have a todo "Second task"
    When I drag "Second task" above "First task"
    Then "Second task" should appear before "First task"
```

- [ ] **Step 2: Delete `e2e/features/todos-reorder.feature`**

```bash
rm /Users/iorlas/Workspaces/agentic-web-stack/e2e/features/todos-reorder.feature
```

- [ ] **Step 3: Append drag steps to `e2e/steps/todos.ts`**

Add at the end of `e2e/steps/todos.ts` (after the existing step definitions):

```typescript
when(
  "I drag {string} above {string}",
  async ({ page }, source: string, target: string) => {
    const sourceItem = page.locator("li", { hasText: source });
    const targetItem = page.locator("li", { hasText: target });

    const targetBox = await targetItem.boundingBox();
    if (!targetBox) throw new Error(`Could not find target item "${target}"`);

    await sourceItem.dragTo(targetItem, {
      targetPosition: { x: targetBox.width / 2, y: 0 },
    });

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

- [ ] **Step 4: Delete `e2e/steps/todos-reorder.ts`**

```bash
rm /Users/iorlas/Workspaces/agentic-web-stack/e2e/steps/todos-reorder.ts
```

- [ ] **Step 5: Run quality gate**

Run: `make -C /Users/iorlas/Workspaces/agentic-web-stack fix && make -C /Users/iorlas/Workspaces/agentic-web-stack check`
Expected: 13 passed, 0 failed

- [ ] **Step 6: Kill stale servers and run BDD tests**

```bash
lsof -i :3000 -i :3001 2>/dev/null | grep LISTEN | awk '{print $2}' | sort -u | xargs kill 2>/dev/null
docker ps -q --filter "name=agentic-postgres-test" | xargs docker rm -f 2>/dev/null
make -C /Users/iorlas/Workspaces/agentic-web-stack test
```

Expected: 25 passed (same count — scenarios just moved between files)

- [ ] **Step 7: Commit**

```bash
git add e2e/features/todos.feature e2e/steps/todos.ts
git rm e2e/features/todos-reorder.feature e2e/steps/todos-reorder.ts
git commit -m "refactor: consolidate BDD feature files by domain area"
```

---

### Task 4: Update documentation to enforce patterns

**Files:**
- Modify: `apps/web/CLAUDE.md`
- Modify: `packages/db/CLAUDE.md`
- Modify: `e2e/CLAUDE.md`

- [ ] **Step 1: Update `apps/web/CLAUDE.md` FSD section**

Find the line `**Adding a new feature:** create `src/features/<name>/` with its UI components and logic. Import it from routes.` and replace with:

```markdown
**Adding a new feature:** create `src/features/<name>/` with its UI components and logic. Import it from routes.

**Mandatory:** Routes must be thin shells — layout, context providers, mutation hooks, and composition only. Extract all reusable components, types, and business logic into `features/` or `widgets/`. Never inline feature components in route files.
```

- [ ] **Step 2: Update `packages/db/CLAUDE.md`**

Replace the "Modify Schema Workflow" section with:

```markdown
## Modify Schema Workflow

1. Edit the appropriate file in `prisma/schema/`:
   - `base.prisma` — generator + datasource (rarely changed)
   - `auth.prisma` — Better-Auth tables (User, Session, Account, Verification)
   - `todo.prisma` — Todo model
   - Create a new `<domain>.prisma` for new domains
2. Run `make db-push` (pushes schema + regenerates client)
3. Update TypeScript code that uses the changed models
4. Run `make check` to verify types

For production with migrations: `pnpm --filter @project/db migrate` instead of `db-push`.

## Schema Organization

One `.prisma` file per domain area. Models that belong together live in the same file.

| File | Owner | Contents |
|------|-------|----------|
| `base.prisma` | Infrastructure | Generator + datasource config |
| `auth.prisma` | Better-Auth | User, Session, Account, Verification |
| `todo.prisma` | Application | Todo |

New domains get a new file (e.g., `post.prisma` for a blog feature). Never put unrelated models in the same file.
```

- [ ] **Step 3: Update `e2e/CLAUDE.md`**

After the "Rules:" section under "Writing Feature Files", add:

```markdown
## Feature File Organization

Feature files map to **domain areas**, not individual capabilities:
- `auth.feature` — all authentication scenarios
- `todos.feature` — all todo scenarios (CRUD, reorder, filtering, etc.)
- `mobile-nav.feature` — navigation-specific scenarios

All scenarios for a domain belong in one file. Split into sub-files only when a feature exceeds ~15-20 scenarios. Step definition files mirror feature files: `steps/auth.ts`, `steps/todos.ts`, etc.
```

- [ ] **Step 4: Run quality gate**

Run: `make -C /Users/iorlas/Workspaces/agentic-web-stack check`
Expected: 13 passed, 0 failed

- [ ] **Step 5: Commit**

```bash
git add apps/web/CLAUDE.md packages/db/CLAUDE.md e2e/CLAUDE.md
git commit -m "docs: enforce FSD, multi-file schema, and BDD domain organization patterns"
```
