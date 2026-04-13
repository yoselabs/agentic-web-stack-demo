# Todo Import/Export Refactor

## Goal

Merge the standalone file upload/download feature into the todo domain as import/export capabilities. Reduces the template to a single reference implementation (todos) that demonstrates all patterns including file handling.

## Motivation

The template should have one well-built example feature, not multiple thin ones. Todo already covers CRUD, drag-and-drop, optimistic updates, auth isolation. Adding import/export to it demonstrates file upload, CSV processing, and download — all within one domain. When the scaffolder strips "todo," everything goes together cleanly.

## What to Remove

- `/files` page, route (`apps/web/src/routes/_authenticated/files.tsx`), navbar link
- `File` Prisma model (`packages/db/prisma/schema/file.prisma`), reverse relation from User
- File service (`packages/api/src/services/file.ts`) and its tests
- File router (`packages/api/src/routers/file.ts`), mount in `router.ts`, exports from `index.ts`
- File router integration tests (`packages/api/src/__tests__/file.test.ts`)
- Frontend file feature (`apps/web/src/features/file/`)
- Hono file routes (upload, download, preview) in `apps/server/src/index.ts`
- `UPLOAD_DIR` env var from `packages/env/src/server.ts`
- `files.feature`, `steps/files.ts`, `fixtures/invalid-file.txt`
- `uploads/` from `.gitignore` (no longer needed)

## What to Keep

- Storage abstraction (`packages/api/src/services/storage.ts`) — useful pattern reference, tested
- Table UI component (`packages/ui/src/components/table.tsx`) — reusable
- `papaparse` dependency — used for CSV parsing in import/export
- Test fixture `e2e/fixtures/test-data.csv` — renamed/adapted for todo import

## What to Add

### Backend

**`packages/api/src/services/todo.ts`** — add two functions:

```typescript
export async function importTodosFromCSV(
  db: DbClient,
  userId: string,
  csvData: Buffer,
): Promise<{ count: number }> {
  // Parse CSV with papaparse, expect "title" column
  // Create todos for each row using createTodo()
  // Return count of imported todos
}

export async function exportTodosAsCSV(
  db: DbClient,
  userId: string,
): Promise<string> {
  // List all todos for user
  // Format as CSV with columns: title, completed
  // Return CSV string
}
```

**`apps/server/src/index.ts`** — add two Hono routes (before tRPC handler):

- `POST /api/todos/import` — multipart upload, auth check, parse CSV, call `importTodosFromCSV`, return `{ count }` with 201
- `GET /api/todos/export` — auth check, call `exportTodosAsCSV`, return CSV as `attachment; filename="todos.csv"`

Both routes follow the same auth pattern as the existing file routes (check session, return 401 if missing).

**Validation:**
- 10 MB file size limit (same as before)
- CSV must have a `title` column (reject with 400 if missing)
- Accept `.csv` extension and `text/csv` / `application/vnd.ms-excel` MIME types

### Frontend

**`apps/web/src/features/todo/use-todos.ts`** — add:

- `importTodos` mutation (FormData fetch to `/api/todos/import`, invalidate list, toast)
- `exportTodos` function (fetch `/api/todos/export` with credentials, blob download)

**`apps/web/src/routes/_authenticated/todos.tsx`** — add import/export buttons above the todo input form:

- "Import CSV" button — opens file picker (`input[type="file"]` hidden, triggered by button click), uploads on select
- "Export CSV" button — triggers download

### Tests

**`packages/api/src/services/__tests__/todo.test.ts`** — add tests for:

- `importTodosFromCSV` — parses CSV, creates todos, returns count
- `importTodosFromCSV` — rejects CSV without `title` column
- `exportTodosAsCSV` — exports todos as CSV string with correct columns

**`e2e/features/todos.feature`** — add scenarios:

```gherkin
Scenario: Import todos from CSV
  Given I am signed in as "import-todos@example.com"
  And I am on the todos page
  When I import todos from "import-todos.csv"
  Then I should see "Buy milk"
  And I should see "Walk the dog"

Scenario: Export todos as CSV
  Given I am signed in as "export-todos@example.com"
  And I am on the todos page
  And I have a todo "Export me"
  When I export todos
  Then the downloaded file should contain "Export me"
```

**`e2e/fixtures/import-todos.csv`:**

```csv
title
Buy milk
Walk the dog
```

**`e2e/steps/todos.ts`** — add step definitions for import and export.

## Architecture Notes

- Import/export are Hono routes (not tRPC) because they need multipart upload and binary download — same rationale as the original file upload
- The storage abstraction is NOT used for import/export (CSV is processed in-memory, not stored on disk). It remains in the codebase as a tested pattern reference for features that need persistent file storage
- Export includes both active and completed todos (the user's full dataset)
- Import creates todos at position 0 (newest first), same as manual creation
