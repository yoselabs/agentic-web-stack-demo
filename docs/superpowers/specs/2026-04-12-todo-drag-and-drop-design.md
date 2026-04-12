# Todo Drag and Drop — Design Spec

## Summary

Add drag-and-drop reordering to the todo list using `@dnd-kit/core` + `@dnd-kit/sortable`. New todos appear at the top. Completed todos auto-sink to the bottom in a non-draggable section.

## Data Model

Add `position Int @default(0)` to the `Todo` model.

- New todos: `position = 0`, existing active todos shift `position += 1`
- Query order: `ORDER BY completed ASC, position ASC` (active first by position, completed at bottom)
- Reorder: receive ordered array of active todo IDs, write `position = index` for each

## tRPC Routes

### `todo.list` (modify)

Change `orderBy` to `[{ completed: 'asc' }, { position: 'asc' }]`.

### `todo.create` (modify)

Before inserting, increment `position` on all active (non-completed) todos for the current user:
```sql
UPDATE "Todo" SET position = position + 1 WHERE "userId" = $1 AND completed = false
```
Then insert with `position = 0`.

### `todo.reorder` (new mutation)

Input: `{ ids: string[] }` — ordered array of active todo IDs.

Validation: all IDs must belong to the current user and be non-completed.

Action: batch update `position = index` for each ID in the array.

### `todo.complete` (modify)

When completing a todo, no position change needed — the `ORDER BY completed ASC` handles sorting completed todos to the bottom. When uncompleting, set `position = 0` and shift others (same as create).

## Frontend

### Dependencies

- `@dnd-kit/core` — drag and drop engine
- `@dnd-kit/sortable` — sortable list preset
- `@dnd-kit/utilities` — CSS transform utility

Install in `apps/web`.

### Todo List Component

Split the todo list into two sections:
1. **Active todos** — wrapped in `DndContext` + `SortableContext`, each item is a `SortableItem`
2. **Completed todos** — plain list, not draggable, rendered below with muted styling

### SortableItem

- Full-row drag (no grip icon)
- Activation constraint: `distance: 8` (8px movement threshold before drag starts — prevents accidental drags on mobile touch)
- Visual feedback during drag: reduced opacity (0.5), slight shadow

### Drag End Handler

1. Compute new order from `event.active` and `event.over`
2. Optimistic update: reorder the React Query cache immediately
3. Fire `todo.reorder` mutation with the new ID order
4. On error: invalidate query to revert to server state

## BDD Test

```gherkin
Scenario: Reorder todos by dragging
  Given I am signed in as "reorder-todos@example.com"
  And I navigate to "/todos"
  And I have a todo "First task"
  And I have a todo "Second task"
  When I drag "Second task" above "First task"
  Then "Second task" should appear before "First task"
```

The drag step uses Playwright's `dragTo` API to simulate the drag gesture.

## Not In Scope

- Drag between lists/categories
- Keyboard-based reordering (dnd-kit supports it, but not wiring it up)
- Animation/transitions beyond opacity change
