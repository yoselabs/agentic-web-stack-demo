# Todo Import/Export Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the standalone file upload/download feature into the todo domain as CSV import/export, reducing the template to a single reference implementation.

**Architecture:** Two-phase refactor: (1) remove all file upload code, (2) add import/export to todos. Import uses a Hono multipart route with bulk `createMany`. Export uses a Hono route returning CSV. Both reuse existing todo service patterns.

**Tech Stack:** Hono (multipart/download routes), papaparse (CSV), Playwright-BDD (E2E), Vitest (unit)

---

### Task 1: Remove File Upload Feature — Backend

**Files:**
- Delete: `packages/api/src/services/file.ts`
- Delete: `packages/api/src/services/__tests__/file.test.ts`
- Delete: `packages/api/src/routers/file.ts`
- Delete: `packages/api/src/__tests__/file.test.ts`
- Delete: `packages/db/prisma/schema/file.prisma`
- Modify: `packages/db/prisma/schema/auth.prisma` — remove `files File[]`
- Modify: `packages/api/src/router.ts` — remove fileRouter import and mount
- Modify: `packages/api/src/index.ts` — remove file/storage re-exports
- Modify: `apps/server/src/index.ts` — remove 3 Hono file routes + `deleteStoredFile` import
- Modify: `packages/env/src/server.ts` — remove `UPLOAD_DIR`

- [ ] **Step 1: Delete file service and tests**

```bash
rm packages/api/src/services/file.ts
rm packages/api/src/services/__tests__/file.test.ts
rm packages/api/src/routers/file.ts
rm packages/api/src/__tests__/file.test.ts
```

- [ ] **Step 2: Delete File Prisma model**

```bash
rm packages/db/prisma/schema/file.prisma
```

Remove `files    File[]` from the User model in `packages/db/prisma/schema/auth.prisma`. The line is after `todos    Todo[]`.

- [ ] **Step 3: Remove fileRouter from app router**

In `packages/api/src/router.ts`, remove the import line:
```typescript
import { fileRouter } from "./routers/file.js";
```

And remove `file: fileRouter,` from the router object.

The file should end up as:
```typescript
import { todoRouter } from "./routers/todo.js";
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
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 4: Remove file/storage re-exports from packages/api/src/index.ts**

Remove these lines from `packages/api/src/index.ts`:
```typescript
export {
  createFileRecord,
  processCSV,
  getFileWithData,
} from "./services/file.js";
export {
  storeFile,
  readStoredFile,
  deleteStoredFile,
  getStoragePath,
} from "./services/storage.js";
```

The file should end up as:
```typescript
export { appRouter, type AppRouter } from "./router.js";
export { createContext, type Context } from "./context.js";
export { router, publicProcedure, protectedProcedure } from "./trpc.js";

// Type inference for frontend data contracts
// Usage: type Todo = RouterOutput['todo']['list'][number]
export type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
```

- [ ] **Step 5: Remove Hono file routes from apps/server/src/index.ts**

Remove the `deleteStoredFile` import from the `@project/api` import block. Keep `createContext` and `appRouter`.

The import should become:
```typescript
import {
  appRouter,
  createContext,
} from "@project/api";
```

Remove ALL three route handlers:
- `app.post("/api/files/upload", ...)` — the entire handler (~25 lines)
- `app.get("/api/files/:id/download", ...)` — the entire handler (~15 lines)
- `app.get("/api/files/:id/preview", ...)` — the entire handler (~15 lines)

- [ ] **Step 6: Remove UPLOAD_DIR from env**

In `packages/env/src/server.ts`, remove:
```typescript
UPLOAD_DIR: z.string().default("./uploads"),
```

- [ ] **Step 7: Remove uploads/ from .gitignore**

Remove these lines from `.gitignore`:
```
# Uploads
uploads/
```

- [ ] **Step 8: Push schema and verify**

```bash
make db-push
cd packages/api && pnpm vitest run
make lint
```

Expected: Schema pushed without File model. Existing todo tests (14 tests) pass. Lint passes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove standalone file upload feature (backend)"
```

---

### Task 2: Remove File Upload Feature — Frontend & E2E

**Files:**
- Delete: `apps/web/src/routes/_authenticated/files.tsx`
- Delete: `apps/web/src/features/file/` (entire directory)
- Delete: `e2e/features/files.feature`
- Delete: `e2e/steps/files.ts`
- Delete: `e2e/fixtures/invalid-file.txt`
- Delete: `e2e/fixtures/test-data.csv`
- Modify: `apps/web/src/widgets/navbar.tsx` — remove Files link

- [ ] **Step 1: Delete frontend file feature**

```bash
rm apps/web/src/routes/_authenticated/files.tsx
rm -rf apps/web/src/features/file/
```

- [ ] **Step 2: Remove Files link from navbar**

In `apps/web/src/widgets/navbar.tsx`, remove this line from the `navLinks` array:
```typescript
{ to: "/files" as const, label: "Files" },
```

The navLinks should be:
```typescript
const navLinks = [
  { to: "/dashboard" as const, label: "Dashboard" },
  { to: "/todos" as const, label: "Todos" },
];
```

- [ ] **Step 3: Delete E2E files**

```bash
rm e2e/features/files.feature
rm e2e/steps/files.ts
rm e2e/fixtures/invalid-file.txt
rm e2e/fixtures/test-data.csv
```

- [ ] **Step 4: Regenerate route tree and verify**

```bash
make routes
make lint
```

Expected: Route tree regenerated without `/files`. Lint passes.

- [ ] **Step 5: Run E2E tests**

```bash
make test
```

Expected: All remaining tests pass (auth, todos, mobile-nav). No file scenarios.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove standalone file upload feature (frontend + E2E)"
```

---

### Task 3: Update Documentation

**Files:**
- Modify: `e2e/CLAUDE.md` — remove file-specific examples
- Modify: `packages/db/CLAUDE.md` — remove file.prisma from table

- [ ] **Step 1: Update e2e/CLAUDE.md**

In the "Scenario Strategy" section, update the example table. Remove all file-specific rows and replace with todo import/export examples where relevant. Specifically:

In the positive/negative ratio table, change:
- "Upload succeeds, file appears" → "Create todo, import todos from CSV"
- "Reject non-CSV (BDD)" → "Reject invalid CSV (BDD)"
- "Files private to each user" → "Todos private to each user"

In the orthogonal scenario design table, the examples are generic enough to keep. Just verify no file-specific text remains.

Remove any reference to `files.feature`, `steps/files.ts`, or `uploadFile()` helper.

- [ ] **Step 2: Update packages/db/CLAUDE.md**

In the schema organization table, remove the `file.prisma` row:
```
| `file.prisma` | Application | File |
```

- [ ] **Step 3: Verify and commit**

```bash
make lint
```

```bash
git add e2e/CLAUDE.md packages/db/CLAUDE.md
git commit -m "docs: update CLAUDE.md files after file upload removal"
```

---

### Task 4: Add Import/Export to Todo Service (TDD)

**Files:**
- Modify: `packages/api/src/services/todo.ts` — add `importTodosFromCSV`, `exportTodosAsCSV`
- Modify: `packages/api/src/services/__tests__/todo.test.ts` — add import/export tests

- [ ] **Step 1: Write failing tests for importTodosFromCSV**

Add to `packages/api/src/services/__tests__/todo.test.ts`:

```typescript
it("imports todos from CSV with title column", async () => {
  const csv = Buffer.from("title\nBuy milk\nWalk the dog");
  const result = await db.$transaction((tx) =>
    importTodosFromCSV(tx, TEST_USER_ID, csv),
  );
  expect(result.count).toBe(2);

  const todos = await listTodos(db, TEST_USER_ID);
  const active = todos.filter((t) => !t.completed);
  expect(active[0]?.title).toBe("Buy milk");
  expect(active[1]?.title).toBe("Walk the dog");
});

it("rejects CSV without title column", async () => {
  const csv = Buffer.from("name,email\nAlice,a@b.com");
  await expect(
    db.$transaction((tx) => importTodosFromCSV(tx, TEST_USER_ID, csv)),
  ).rejects.toThrow("title");
});

it("ignores extra columns beyond title", async () => {
  const csv = Buffer.from("title,priority,notes\nTest todo,high,some note");
  const result = await db.$transaction((tx) =>
    importTodosFromCSV(tx, TEST_USER_ID, csv),
  );
  expect(result.count).toBe(1);

  const todos = await listTodos(db, TEST_USER_ID);
  expect(todos.some((t) => t.title === "Test todo")).toBe(true);
});
```

Add `importTodosFromCSV` to the import at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/api && pnpm vitest run src/services/__tests__/todo.test.ts
```

Expected: FAIL — `importTodosFromCSV` is not exported.

- [ ] **Step 3: Implement importTodosFromCSV**

Add to `packages/api/src/services/todo.ts`:

```typescript
import Papa from "papaparse";
```

(Add at the top with other imports.)

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

  if (!parsed.meta.fields?.includes("title")) {
    throw new Error("CSV must have a 'title' column");
  }

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
```

- [ ] **Step 4: Run import tests to verify they pass**

```bash
cd packages/api && pnpm vitest run src/services/__tests__/todo.test.ts
```

Expected: All import tests PASS.

- [ ] **Step 5: Write failing tests for exportTodosAsCSV**

Add to the test file:

```typescript
it("exports todos as CSV with title and completed columns", async () => {
  const todo = await db.$transaction((tx) =>
    createTodo(tx, TEST_USER_ID, "Export me"),
  );
  createdTodoIds.push(todo.id);

  const csv = await exportTodosAsCSV(db, TEST_USER_ID);
  expect(csv).toContain("title");
  expect(csv).toContain("completed");
  expect(csv).toContain("Export me");
});

it("exports empty CSV with headers when no todos exist", async () => {
  const csv = await exportTodosAsCSV(db, TEST_USER_ID);
  expect(csv).toBe("title,completed");
});

it("properly escapes titles containing commas", async () => {
  const todo = await db.$transaction((tx) =>
    createTodo(tx, TEST_USER_ID, "Buy eggs, milk, bread"),
  );
  createdTodoIds.push(todo.id);

  const csv = await exportTodosAsCSV(db, TEST_USER_ID);
  expect(csv).toContain('"Buy eggs, milk, bread"');
});
```

Add `exportTodosAsCSV` to the import at the top.

- [ ] **Step 6: Run tests to verify they fail**

```bash
cd packages/api && pnpm vitest run src/services/__tests__/todo.test.ts
```

Expected: FAIL — `exportTodosAsCSV` is not exported.

- [ ] **Step 7: Implement exportTodosAsCSV**

Add to `packages/api/src/services/todo.ts`:

```typescript
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

- [ ] **Step 8: Run all tests to verify they pass**

```bash
cd packages/api && pnpm vitest run
make lint
```

Expected: All tests PASS. Lint passes.

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/services/todo.ts packages/api/src/services/__tests__/todo.test.ts
git commit -m "feat: add importTodosFromCSV and exportTodosAsCSV to todo service"
```

---

### Task 5: Add Hono Import/Export Routes

**Files:**
- Modify: `apps/server/src/index.ts` — add import and export routes
- Modify: `packages/api/src/index.ts` — export new functions

- [ ] **Step 1: Export import/export functions from packages/api**

In `packages/api/src/index.ts`, add:

```typescript
export { importTodosFromCSV, exportTodosAsCSV } from "./services/todo.js";
```

- [ ] **Step 2: Add import route to Hono server**

In `apps/server/src/index.ts`, add the import at the top:

```typescript
import {
  appRouter,
  createContext,
  exportTodosAsCSV,
  importTodosFromCSV,
} from "@project/api";
```

Add this route BEFORE the tRPC handler:

```typescript
// Todo import — multipart CSV
app.post("/api/todos/import", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!(file instanceof File))
    return c.json({ error: "No file provided" }, 400);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: "File too large (max 10 MB)" }, 413);
  }

  const isCSV =
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.name.endsWith(".csv");
  if (!isCSV) {
    return c.json({ error: "Only CSV files are accepted" }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await db.$transaction((tx) =>
      importTodosFromCSV(tx, session.user.id, buffer),
    );
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return c.json({ error: message }, 400);
  }
});
```

- [ ] **Step 3: Add export route to Hono server**

Add this route right after the import route:

```typescript
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

- [ ] **Step 4: Verify**

```bash
make lint
```

Expected: Lint + typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/index.ts packages/api/src/index.ts
git commit -m "feat: add Hono routes for todo import/export"
```

---

### Task 6: Frontend — Import/Export UI

**Files:**
- Modify: `apps/web/src/features/todo/use-todos.ts` — add importTodos mutation + exportTodos function
- Modify: `apps/web/src/routes/_authenticated/todos.tsx` — add import/export buttons

- [ ] **Step 1: Add import/export to use-todos hook**

In `apps/web/src/features/todo/use-todos.ts`, add at the top (with existing imports):

```typescript
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
```

Add inside the `useTodos` function, after the existing mutations:

```typescript
const importTodos = useMutation({
  mutationFn: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_URL}/api/todos/import`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Import failed");
    }
    return res.json() as Promise<{ count: number }>;
  },
  onSuccess: (data) => {
    queryClient.invalidateQueries(trpc.todo.list.queryFilter());
    toast.success(`Imported ${data.count} todos`);
  },
  onError: (err: Error) => toast.error(err.message),
});

const exportTodos = async () => {
  const res = await fetch(`${API_URL}/api/todos/export`, {
    credentials: "include",
  });
  if (!res.ok) {
    toast.error("Export failed");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "todos.csv";
  a.click();
  URL.revokeObjectURL(url);
};
```

Add `importTodos` and `exportTodos` to the return object.

- [ ] **Step 2: Add import/export buttons to the todos page**

In `apps/web/src/routes/_authenticated/todos.tsx`, destructure the new values from `useTodos`:

```typescript
const {
  // ... existing
  importTodos,
  exportTodos,
} = useTodos(trpc, queryClient);
```

Add a `useRef` for the hidden file input:

```typescript
import { useRef } from "react";
```

```typescript
const fileInputRef = useRef<HTMLInputElement>(null);
```

Add import/export buttons between the heading and the form. Before the `<form>`:

```tsx
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
```

- [ ] **Step 3: Verify**

```bash
make lint
```

Expected: Lint + typecheck pass.

- [ ] **Step 4: Start dev server and test manually**

```bash
make dev
```

Test in browser:
1. Go to `/todos`, add a few todos
2. Click "Export CSV" — should download `todos.csv` with title,completed columns
3. Create `import-test.csv` with `title\nImported Todo 1\nImported Todo 2`
4. Click "Import CSV" — select the file — should see imported todos appear with toast

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/todo/use-todos.ts apps/web/src/routes/_authenticated/todos.tsx
git commit -m "feat: add todo import/export UI"
```

---

### Task 7: E2E Tests for Import/Export

**Files:**
- Create: `e2e/fixtures/import-todos.csv`
- Modify: `e2e/features/todos.feature` — add import/export scenarios
- Modify: `e2e/steps/todos.ts` — add import/export step definitions

- [ ] **Step 1: Create test fixture**

Create `e2e/fixtures/import-todos.csv`:

```csv
title
Buy milk
Walk the dog
```

- [ ] **Step 2: Add scenarios to todos.feature**

Add these scenarios to the end of `e2e/features/todos.feature`:

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

- [ ] **Step 3: Add step definitions**

Add to `e2e/steps/todos.ts`:

```typescript
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const stepsDir = dirname(fileURLToPath(import.meta.url));
```

(Add at the top of the file.)

```typescript
let lastDownloadPath: string | null = null;

when(
  "I import todos from {string}",
  async ({ page }, filename: string) => {
    const filePath = resolve(stepsDir, `../fixtures/${filename}`);
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(filePath);
    await page.waitForLoadState("networkidle");
  },
);

when("I export todos", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Download failed — no file path");
  lastDownloadPath = path;
});

then(
  "the downloaded file should contain {string}",
  async (_ctx, text: string) => {
    if (!lastDownloadPath)
      throw new Error("No download captured — run download step first");
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(lastDownloadPath, "utf-8");
    expect(content).toContain(text);
    lastDownloadPath = null;
  },
);
```

- [ ] **Step 4: Generate BDD tests and run**

```bash
cd e2e && pnpm exec bddgen
make test
```

Expected: All tests pass — existing todo + auth + mobile-nav + new import/export scenarios.

- [ ] **Step 5: Commit**

```bash
git add e2e/
git commit -m "feat: add BDD tests for todo import/export"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run full quality gate**

```bash
make lint
```

Expected: All 13 checks + typecheck pass.

- [ ] **Step 2: Run unit tests**

```bash
make test-unit
```

Expected: All tests pass (existing todo tests + new import/export tests).

- [ ] **Step 3: Run E2E tests**

```bash
make test
```

Expected: All scenarios pass (auth, todos with import/export, mobile-nav).

- [ ] **Step 4: Verify no stale references**

```bash
grep -r "files\|file-upload\|File model\|file\.prisma\|UPLOAD_DIR" packages/ apps/ e2e/ --include="*.md" --include="*.ts" --include="*.tsx" --include="*.prisma" | grep -v node_modules | grep -v .features-gen | grep -v storage
```

Expected: No stale references to the removed file upload feature. Storage abstraction references are OK (it's kept).
