# Todo Import/Export Refactor

## Goal

Merge the standalone file upload/download feature into the todo domain as import/export capabilities. Reduces the template to a single reference implementation (todos) that demonstrates all patterns including file handling.

## Motivation

The template should have one well-built example feature, not multiple thin ones. Todo already covers CRUD, drag-and-drop, optimistic updates, auth isolation. Adding import/export to it demonstrates file upload, CSV processing, and download — all within one domain. When the scaffolder strips "todo," everything goes together cleanly.

## What to Remove

### Files to delete

- `apps/web/src/routes/_authenticated/files.tsx` — files page route
- `apps/web/src/features/file/` — entire directory (types, hook, components)
- `packages/db/prisma/schema/file.prisma` — File model
- `packages/api/src/services/file.ts` — file service
- `packages/api/src/services/__tests__/file.test.ts` — file service tests
- `packages/api/src/routers/file.ts` — file tRPC router
- `packages/api/src/__tests__/file.test.ts` — file router integration tests
- `e2e/features/files.feature` — file BDD scenarios
- `e2e/steps/files.ts` — file step definitions
- `e2e/fixtures/invalid-file.txt` — test fixture for rejection test
- `e2e/fixtures/test-data.csv` — old CSV fixture (replaced by `import-todos.csv`)

### Lines/references to remove from existing files

- `packages/db/prisma/schema/auth.prisma` — remove `files File[]` from User model
- `packages/api/src/router.ts` — remove `fileRouter` import and mount
- `packages/api/src/routers/file.ts` — removed (see above)
- `packages/api/src/index.ts` — remove re-exports: `createFileRecord`, `processCSV`, `getFileWithData`, `storeFile`, `readStoredFile`, `deleteStoredFile`, `getStoragePath`
- `apps/server/src/index.ts` — remove all 3 Hono file routes (upload, download, preview), remove `deleteStoredFile` import
- `apps/web/src/widgets/navbar.tsx` — remove `{ to: "/files" as const, label: "Files" }` from navLinks
- `packages/env/src/server.ts` — remove `UPLOAD_DIR` env var
- `.gitignore` — remove `uploads/` entry

### Documentation updates

- `e2e/CLAUDE.md` — remove file-specific examples (uploadFile helper, file scenarios in strategy table)
- `packages/db/CLAUDE.md` — remove `file.prisma` from schema organization table
- Regenerate route tree (`make routes`) after removing files route

## What to Keep

- Storage abstraction (`packages/api/src/services/storage.ts` + tests) — useful pattern reference for features that need persistent file storage
- Table UI component (`packages/ui/src/components/table.tsx`) — reusable
- `papaparse` dependency — used for CSV parsing in import/export

## What to Add

### Backend

**`packages/api/src/services/todo.ts`** — add two functions:

```typescript
export async function importTodosFromCSV(
  db: DbClient,
  userId: string,
  csvData: Buffer,
): Promise<{ count: number }> {
  const text = csvData.toString("utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const titles = parsed.data.map((row) => row.title).filter(Boolean);
  if (titles.length === 0) {
    throw new Error("CSV must have a 'title' column with at least one value");
  }

  // Bulk import: shift existing positions once, then createMany
  await lockActiveTodos(db, userId);
  await db.todo.updateMany({
    where: { userId, completed: false },
    data: { position: { increment: titles.length } },
  });
  await db.todo.createMany({
    data: titles.map((title, i) => ({
      title,
      userId,
      position: i,
    })),
  });

  return { count: titles.length };
}

export async function exportTodosAsCSV(
  db: DbClient,
  userId: string,
): Promise<string> {
  const todos = await listTodos(db, userId);
  return Papa.unparse(
    todos.map((t) => ({ title: t.title, completed: t.completed })),
  );
}
```

**Key design decisions for import:**
- Uses bulk `createMany` instead of per-row `createTodo()` to avoid N+1 position shifts
- Single position shift by `titles.length` before bulk insert
- First CSV row = position 0 (top of list), last row = bottom
- Extra CSV columns beyond `title` are silently ignored
- Duplicate titles are allowed (matches manual creation behavior)
- All imported todos are active (not completed)

**`apps/server/src/index.ts`** — add two Hono routes (before tRPC handler):

```typescript
// Todo import — multipart CSV
app.post("/api/todos/import", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  // ... validate file (size, MIME/extension) ...

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await db.$transaction((tx) =>
    importTodosFromCSV(tx, session.user.id, buffer),
  );
  return c.json(result, 201);
});

// Todo export — CSV download
app.get("/api/todos/export", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const csv = await exportTodosAsCSV(db, session.user.id);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="todos.csv"',
    },
  });
});
```

**Transaction ownership:** The Hono import route wraps `importTodosFromCSV` in `db.$transaction()`. Either all rows import or none. The export route does not need a transaction (read-only).

**Validation:**
- 10 MB file size limit
- CSV must have a `title` column (reject with 400 if missing)
- Accept `.csv` extension and `text/csv` / `application/vnd.ms-excel` MIME types

### Frontend

**`apps/web/src/features/todo/use-todos.ts`** — add:

- `importTodos` mutation (FormData fetch to `/api/todos/import`, invalidate list, toast "Imported N todos")
- `exportTodos` function (fetch `/api/todos/export` with credentials, blob download as `todos.csv`)

**`apps/web/src/routes/_authenticated/todos.tsx`** — add import/export buttons above the todo input form:

- "Import CSV" button — hidden file input triggered by button click, uploads on select
- "Export CSV" button — triggers blob download

### Tests

**`packages/api/src/services/__tests__/todo.test.ts`** — add tests for:

- `importTodosFromCSV` — parses CSV, creates todos in bulk, returns count
- `importTodosFromCSV` — imported todos appear at top of list in CSV order
- `importTodosFromCSV` — rejects CSV without `title` column (throws error)
- `importTodosFromCSV` — ignores extra columns beyond `title`
- `exportTodosAsCSV` — exports todos with title and completed columns
- `exportTodosAsCSV` — returns headers-only CSV when no todos exist
- `exportTodosAsCSV` — properly escapes titles containing commas/quotes

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
- Import uses bulk insert — first CSV row becomes position 0 (top of list)
- Extra columns in imported CSV are silently ignored
- Duplicate titles are allowed (consistent with manual creation)
- Import is atomic (transaction) — all rows or none
- Export of zero todos returns a valid CSV with headers only
