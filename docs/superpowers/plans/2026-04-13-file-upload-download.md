# File Upload & Download (CSV Processing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vertical slice demonstrating file upload, processing, and download — upload a CSV, parse it, preview data in a table, download the processed result.

**Architecture:** Files are uploaded via a Hono multipart endpoint (not tRPC — needs raw request body), metadata tracked in Prisma, and stored on local disk behind a storage abstraction (swappable to S3 later). tRPC handles listing/deleting file metadata. Frontend shows upload form, file list with status, data preview table, and download link.

**Tech Stack:** Hono (multipart upload + download streaming), Prisma (file metadata), tRPC (list/delete), papaparse (CSV parsing), TanStack Query (frontend data), shadcn/ui Table component.

---

### Task 1: Gherkin Spec

**Files:**
- Create: `e2e/features/files.feature`

- [ ] **Step 1: Write the feature file**

```gherkin
Feature: File Upload and Download

  Scenario: Empty state shows no files
    Given I am signed in as "empty-files@example.com"
    And I navigate to "/files"
    Then I should see "No files uploaded yet"

  Scenario: Upload a CSV file
    Given I am signed in as "upload-file@example.com"
    And I navigate to "/files"
    When I upload the file "test-data.csv"
    Then I should see "test-data.csv"
    And I should see "Processed"

  Scenario: Preview uploaded CSV data
    Given I am signed in as "preview-file@example.com"
    And I navigate to "/files"
    And I have uploaded "test-data.csv"
    When I click "Preview"
    Then I should see a data table with 3 rows

  Scenario: Download processed file
    Given I am signed in as "download-file@example.com"
    And I navigate to "/files"
    And I have uploaded "test-data.csv"
    Then I should see "Download"

  Scenario: Delete an uploaded file
    Given I am signed in as "delete-file@example.com"
    And I navigate to "/files"
    And I have uploaded "test-data.csv"
    When I click the delete button for "test-data.csv"
    Then I should not see "test-data.csv"
    And I should see "No files uploaded yet"

  Scenario: Files are private to each user
    Given I am signed in as "private-files@example.com"
    And I navigate to "/files"
    And I have uploaded "test-data.csv"
    When I sign out and sign in as "other-files-user@example.com"
    And I navigate to "/files"
    Then I should not see "test-data.csv"
    And I should see "No files uploaded yet"
```

- [ ] **Step 2: Create test fixture CSV**

Create `e2e/fixtures/test-data.csv`:

```csv
name,email,age
Alice,alice@example.com,30
Bob,bob@example.com,25
Charlie,charlie@example.com,35
```

- [ ] **Step 3: Commit**

```bash
git add e2e/features/files.feature e2e/fixtures/test-data.csv
git commit -m "feat: add file upload/download Gherkin spec and test fixture"
```

---

### Task 2: Prisma Schema

**Files:**
- Create: `packages/db/prisma/schema/file.prisma`
- Modify: `packages/db/prisma/schema/auth.prisma` (add relation)

- [ ] **Step 1: Create the File model**

Create `packages/db/prisma/schema/file.prisma`:

```prisma
// Application owned — full control.

model File {
  id            String   @id @default(cuid())
  filename      String
  originalName  String
  mimeType      String
  size          Int
  status        String   @default("pending") // pending | processed | error
  rowCount      Int?
  storagePath   String
  userId        String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Add reverse relation to User**

In `packages/db/prisma/schema/auth.prisma`, add to the User model:

```prisma
  files    File[]
```

(After the existing `todos    Todo[]` line)

- [ ] **Step 3: Push schema**

```bash
make db-push
```

Expected: Schema pushed, Prisma client regenerated.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema/file.prisma packages/db/prisma/schema/auth.prisma
git commit -m "feat: add File model for upload metadata"
```

---

### Task 3: Storage Abstraction

**Files:**
- Create: `packages/api/src/services/storage.ts`
- Create: `packages/api/src/services/__tests__/storage.test.ts`

- [ ] **Step 1: Write failing tests for storage service**

Create `packages/api/src/services/__tests__/storage.test.ts`:

```typescript
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteStoredFile, getStoragePath, storeFile } from "../storage.js";

const TEST_DIR = join(process.cwd(), ".test-uploads");

beforeAll(() => {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("storage service", () => {
  it("stores a buffer and returns the storage path", async () => {
    const data = Buffer.from("hello,world\na,b");
    const path = await storeFile(TEST_DIR, "test.csv", data);

    expect(path).toMatch(/\.csv$/);
    const content = await readFile(join(TEST_DIR, path), "utf-8");
    expect(content).toBe("hello,world\na,b");
  });

  it("generates unique filenames to avoid collisions", async () => {
    const data = Buffer.from("data");
    const path1 = await storeFile(TEST_DIR, "same.csv", data);
    const path2 = await storeFile(TEST_DIR, "same.csv", data);

    expect(path1).not.toBe(path2);
  });

  it("returns full path via getStoragePath", () => {
    const full = getStoragePath(TEST_DIR, "abc123.csv");
    expect(full).toBe(join(TEST_DIR, "abc123.csv"));
  });

  it("deletes a stored file", async () => {
    const data = Buffer.from("to-delete");
    const path = await storeFile(TEST_DIR, "delete-me.csv", data);

    await deleteStoredFile(TEST_DIR, path);
    expect(existsSync(join(TEST_DIR, path))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/api && pnpm vitest run src/services/__tests__/storage.test.ts
```

Expected: FAIL — module `../storage.js` not found.

- [ ] **Step 3: Implement storage service**

Create `packages/api/src/services/storage.ts`:

```typescript
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

export async function storeFile(
  uploadDir: string,
  originalName: string,
  data: Buffer,
): Promise<string> {
  await mkdir(uploadDir, { recursive: true });
  const ext = extname(originalName);
  const filename = `${randomUUID()}${ext}`;
  await writeFile(join(uploadDir, filename), data);
  return filename;
}

export function getStoragePath(uploadDir: string, filename: string): string {
  return join(uploadDir, filename);
}

export async function readStoredFile(
  uploadDir: string,
  filename: string,
): Promise<Buffer> {
  return readFile(join(uploadDir, filename));
}

export async function deleteStoredFile(
  uploadDir: string,
  filename: string,
): Promise<void> {
  await rm(join(uploadDir, filename), { force: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/api && pnpm vitest run src/services/__tests__/storage.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/storage.ts packages/api/src/services/__tests__/storage.test.ts
git commit -m "feat: add local file storage abstraction"
```

---

### Task 4: File Service (Business Logic)

**Files:**
- Create: `packages/api/src/services/file.ts`
- Create: `packages/api/src/services/__tests__/file.test.ts`

- [ ] **Step 1: Install papaparse**

```bash
pnpm --filter @project/api add papaparse && pnpm --filter @project/api add -D @types/papaparse
```

- [ ] **Step 2: Write failing tests for file service**

Create `packages/api/src/services/__tests__/file.test.ts`:

```typescript
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { db } from "@project/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createFileRecord,
  deleteFileRecord,
  getFileWithData,
  listFiles,
  processCSV,
} from "../file.js";

const TEST_USER_ID = "test-user-file-service";
const TEST_DIR = join(process.cwd(), ".test-file-uploads");
const createdFileIds: string[] = [];

beforeAll(async () => {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  await db.file.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.deleteMany({ where: { id: TEST_USER_ID } });
  await db.user.create({
    data: {
      id: TEST_USER_ID,
      name: "File Test User",
      email: "test-file-service@example.com",
      emailVerified: false,
    },
  });
});

afterEach(async () => {
  if (createdFileIds.length > 0) {
    await db.file.deleteMany({ where: { id: { in: createdFileIds } } });
    createdFileIds.length = 0;
  }
});

afterAll(async () => {
  await db.file.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  rmSync(TEST_DIR, { recursive: true, force: true });
  await db.$disconnect();
});

describe("file service", () => {
  it("lists files (empty)", async () => {
    const files = await listFiles(db, TEST_USER_ID);
    expect(files).toEqual([]);
  });

  it("creates a file record", async () => {
    const file = await createFileRecord(db, {
      userId: TEST_USER_ID,
      filename: "abc123.csv",
      originalName: "data.csv",
      mimeType: "text/csv",
      size: 100,
      storagePath: "abc123.csv",
    });
    createdFileIds.push(file.id);

    expect(file.originalName).toBe("data.csv");
    expect(file.status).toBe("pending");
  });

  it("processes CSV and updates record", async () => {
    const csvData = Buffer.from("name,email\nAlice,alice@test.com\nBob,bob@test.com");
    const file = await createFileRecord(db, {
      userId: TEST_USER_ID,
      filename: "process-test.csv",
      originalName: "users.csv",
      mimeType: "text/csv",
      size: csvData.length,
      storagePath: "process-test.csv",
    });
    createdFileIds.push(file.id);

    const result = await processCSV(db, file.id, csvData);

    expect(result.status).toBe("processed");
    expect(result.rowCount).toBe(2);
  });

  it("returns parsed data with getFileWithData", async () => {
    const csvData = Buffer.from("name,age\nAlice,30\nBob,25");
    const file = await createFileRecord(db, {
      userId: TEST_USER_ID,
      filename: "data-test.csv",
      originalName: "people.csv",
      mimeType: "text/csv",
      size: csvData.length,
      storagePath: "data-test.csv",
    });
    createdFileIds.push(file.id);

    await processCSV(db, file.id, csvData);
    const result = await getFileWithData(db, TEST_USER_ID, file.id, csvData);

    expect(result.headers).toEqual(["name", "age"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ name: "Alice", age: "30" });
  });

  it("deletes a file record", async () => {
    const file = await createFileRecord(db, {
      userId: TEST_USER_ID,
      filename: "delete-test.csv",
      originalName: "remove.csv",
      mimeType: "text/csv",
      size: 50,
      storagePath: "delete-test.csv",
    });

    await deleteFileRecord(db, TEST_USER_ID, file.id);

    const files = await listFiles(db, TEST_USER_ID);
    expect(files.find((f) => f.id === file.id)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd packages/api && pnpm vitest run src/services/__tests__/file.test.ts
```

Expected: FAIL — module `../file.js` not found.

- [ ] **Step 4: Implement file service**

Create `packages/api/src/services/file.ts`:

```typescript
import { Prisma, type PrismaClient } from "@project/db";
import Papa from "papaparse";

type DbClient = PrismaClient | Prisma.TransactionClient;

interface CreateFileInput {
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
}

export async function listFiles(db: DbClient, userId: string) {
  return db.file.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createFileRecord(db: DbClient, input: CreateFileInput) {
  return db.file.create({ data: input });
}

export async function processCSV(
  db: DbClient,
  fileId: string,
  data: Buffer,
) {
  const text = data.toString("utf-8");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

  return db.file.update({
    where: { id: fileId },
    data: {
      status: "processed",
      rowCount: parsed.data.length,
    },
  });
}

export async function getFileWithData(
  db: DbClient,
  userId: string,
  fileId: string,
  data: Buffer,
) {
  const file = await db.file.findFirstOrThrow({
    where: { id: fileId, userId },
  });

  const text = data.toString("utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return {
    ...file,
    headers: parsed.meta.fields ?? [],
    rows: parsed.data,
  };
}

export async function deleteFileRecord(
  db: DbClient,
  userId: string,
  fileId: string,
) {
  return db.file.delete({ where: { id: fileId, userId } });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/api && pnpm vitest run src/services/__tests__/file.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/file.ts packages/api/src/services/__tests__/file.test.ts package.json pnpm-lock.yaml packages/api/package.json
git commit -m "feat: add file service with CSV processing"
```

---

### Task 5: tRPC Router + Hono Upload/Download Endpoints

**Files:**
- Create: `packages/api/src/routers/file.ts`
- Modify: `packages/api/src/router.ts`
- Create: `packages/api/src/__tests__/file.test.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `packages/env/src/server.ts`

- [ ] **Step 1: Add UPLOAD_DIR env var**

In `packages/env/src/server.ts`, add to the `server` object:

```typescript
UPLOAD_DIR: z.string().default("./uploads"),
```

- [ ] **Step 2: Write the tRPC file router**

Create `packages/api/src/routers/file.ts`:

```typescript
import { z } from "zod";
import { deleteFileRecord, listFiles } from "../services/file.js";
import { protectedProcedure, router } from "../trpc.js";

export const fileRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    return listFiles(ctx.db, ctx.session.user.id);
  }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.$transaction((tx) =>
        deleteFileRecord(tx, ctx.session.user.id, input.id),
      );
    }),
});
```

- [ ] **Step 3: Mount file router in app router**

In `packages/api/src/router.ts`, add the import:

```typescript
import { fileRouter } from "./routers/file.js";
```

Add to the router object:

```typescript
file: fileRouter,
```

- [ ] **Step 4: Export file service and storage from packages/api**

In `packages/api/src/index.ts`, add:

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

- [ ] **Step 5: Add upload and download Hono routes**

In `apps/server/src/index.ts`, add imports at the top:

```typescript
import {
  createFileRecord,
  processCSV,
  getFileWithData,
  storeFile,
  readStoredFile,
  deleteStoredFile,
} from "@project/api";
```

Add these routes after the Better-Auth handler and before the tRPC handler:

```typescript
// File upload — multipart (not tRPC, needs raw request body)
app.post("/api/files/upload", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return c.json({ error: "No file provided" }, 400);

  if (file.type !== "text/csv") {
    return c.json({ error: "Only CSV files are accepted" }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadDir = env.UPLOAD_DIR;
  const storageName = await storeFile(uploadDir, file.name, buffer);

  const record = await createFileRecord(db, {
    userId: session.user.id,
    filename: storageName,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    storagePath: storageName,
  });

  const processed = await processCSV(db, record.id, buffer);
  return c.json(processed, 201);
});

// File download
app.get("/api/files/:id/download", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const fileRecord = await db.file.findFirst({
    where: { id: c.req.param("id"), userId: session.user.id },
  });
  if (!fileRecord) return c.json({ error: "File not found" }, 404);

  const buffer = await readStoredFile(env.UPLOAD_DIR, fileRecord.storagePath);

  return new Response(buffer, {
    headers: {
      "Content-Type": fileRecord.mimeType,
      "Content-Disposition": `attachment; filename="${fileRecord.originalName}"`,
    },
  });
});

// File preview data
app.get("/api/files/:id/preview", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const fileRecord = await db.file.findFirst({
    where: { id: c.req.param("id"), userId: session.user.id },
  });
  if (!fileRecord) return c.json({ error: "File not found" }, 404);

  const buffer = await readStoredFile(env.UPLOAD_DIR, fileRecord.storagePath);
  const result = await getFileWithData(db, session.user.id, fileRecord.id, buffer);

  return c.json({ headers: result.headers, rows: result.rows });
});
```

Also update the `app.use("/trpc/*", ...)` block's `deleteStoredFile` usage — add a middleware or note that the tRPC `file.delete` mutation needs to also delete the stored file. Update the tRPC file router's delete to handle this:

In `packages/api/src/routers/file.ts`, update the delete mutation to return the record so the server can clean up storage. Actually, a cleaner approach: have the service return the storagePath, and let the Hono layer handle file deletion via a tRPC middleware or by wiring the storage cleanup into the service. For simplicity, update the file service's `deleteFileRecord` to accept an `onDelete` callback:

Update `packages/api/src/routers/file.ts`:

```typescript
import { z } from "zod";
import { deleteFileRecord, listFiles } from "../services/file.js";
import { deleteStoredFile } from "../services/storage.js";
import { protectedProcedure, router } from "../trpc.js";

export const fileRouter = router({
  list: protectedProcedure.query(({ ctx }) => {
    return listFiles(ctx.db, ctx.session.user.id);
  }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.$transaction((tx) =>
        deleteFileRecord(tx, ctx.session.user.id, input.id),
      );
      const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
      await deleteStoredFile(uploadDir, file.storagePath);
      return file;
    }),
});
```

- [ ] **Step 6: Write router integration tests**

Create `packages/api/src/__tests__/file.test.ts`:

```typescript
import { db } from "@project/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext } from "../context.js";
import { appRouter } from "../router.js";

const TEST_USER_ID = "test-user-file-router";
const TEST_USER = {
  id: TEST_USER_ID,
  name: "File Router Test User",
  email: "test-file-router@example.com",
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeSession = {
  user: TEST_USER,
  session: {
    id: "test-session-file-router",
    token: "test-token-file-router",
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
  await db.file.deleteMany({ where: { userId: TEST_USER_ID } });
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
  await db.file.deleteMany({ where: { userId: TEST_USER_ID } });
  await db.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  await db.$disconnect();
});

describe("file router (integration)", () => {
  it("rejects unauthenticated calls", async () => {
    const ctx = await createContext({ session: null });
    const caller = appRouter.createCaller(ctx);
    await expect(caller.file.list()).rejects.toThrow("UNAUTHORIZED");
  });

  it("lists files (empty)", async () => {
    const caller = await createCaller();
    const files = await caller.file.list();
    expect(files).toEqual([]);
  });
});
```

- [ ] **Step 7: Run all tests**

```bash
cd packages/api && pnpm vitest run
```

Expected: All tests PASS.

- [ ] **Step 8: Run make lint**

```bash
make lint
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/routers/file.ts packages/api/src/router.ts packages/api/src/index.ts packages/api/src/__tests__/file.test.ts apps/server/src/index.ts packages/env/src/server.ts
git commit -m "feat: add file upload/download/preview endpoints"
```

---

### Task 6: Add Table UI Component

**Files:**
- Create: `packages/ui/src/components/table.tsx`

- [ ] **Step 1: Add shadcn/ui Table component**

```bash
cd packages/ui && pnpm dlx shadcn@latest add table
```

If the CLI doesn't work with this project's shadcn setup, create `packages/ui/src/components/table.tsx` manually:

```typescript
import * as React from "react";
import { cn } from "../lib/utils";

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
```

- [ ] **Step 2: Verify it compiles**

```bash
make lint
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/table.tsx
git commit -m "feat: add shadcn/ui Table component"
```

---

### Task 7: Frontend — File Upload Feature

**Files:**
- Create: `apps/web/src/features/file/types.ts`
- Create: `apps/web/src/features/file/use-files.ts`
- Create: `apps/web/src/features/file/file-upload-form.tsx`
- Create: `apps/web/src/features/file/file-list.tsx`
- Create: `apps/web/src/features/file/file-preview.tsx`
- Create: `apps/web/src/routes/_authenticated/files.tsx`
- Modify: `apps/web/src/widgets/navbar.tsx`

- [ ] **Step 1: Create type definitions**

Create `apps/web/src/features/file/types.ts`:

```typescript
import type { AppRouter, inferRouterOutputs } from "@project/api";

type RouterOutput = inferRouterOutputs<AppRouter>;
export type FileRecord = RouterOutput["file"]["list"][number];

export interface FilePreviewData {
  headers: string[];
  rows: Record<string, string>[];
}
```

- [ ] **Step 2: Create the hook**

Create `apps/web/src/features/file/use-files.ts`:

```typescript
import type { AppRouter } from "@project/api";
import { type QueryClient, useMutation, useQuery } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { FilePreviewData } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export function useFiles(
  trpc: TRPCOptionsProxy<AppRouter>,
  queryClient: QueryClient,
) {
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<FilePreviewData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const files = useQuery(trpc.file.list.queryOptions());

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/api/files/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.file.list.queryFilter());
      toast.success("File uploaded");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFile = useMutation(
    trpc.file.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.file.list.queryFilter());
        setPreviewFileId(null);
        setPreviewData(null);
        toast.success("File deleted");
      },
      onError: () => toast.error("Failed to delete file"),
    }),
  );

  const loadPreview = async (fileId: string) => {
    if (previewFileId === fileId) {
      setPreviewFileId(null);
      setPreviewData(null);
      return;
    }
    setIsPreviewLoading(true);
    setPreviewFileId(fileId);
    try {
      const res = await fetch(`${API_URL}/api/files/${fileId}/preview`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load preview");
      const data: FilePreviewData = await res.json();
      setPreviewData(data);
    } catch {
      toast.error("Failed to load preview");
      setPreviewFileId(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const getDownloadUrl = (fileId: string) =>
    `${API_URL}/api/files/${fileId}/download`;

  return {
    files,
    uploadFile,
    deleteFile,
    previewFileId,
    previewData,
    isPreviewLoading,
    loadPreview,
    getDownloadUrl,
  };
}
```

- [ ] **Step 3: Create the upload form component**

Create `apps/web/src/features/file/file-upload-form.tsx`:

```tsx
import { Button } from "@project/ui/components/button";
import { Input } from "@project/ui/components/input";
import { useRef } from "react";

interface FileUploadFormProps {
  onUpload: (file: File) => void;
  isPending: boolean;
}

export function FileUploadForm({ onUpload, isPending }: FileUploadFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    onUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
      <Input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="flex-1"
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Uploading..." : "Upload"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create the file list component**

Create `apps/web/src/features/file/file-list.tsx`:

```tsx
import { Button } from "@project/ui/components/button";
import type { FileRecord } from "./types";

interface FileListProps {
  files: FileRecord[];
  onPreview: (id: string) => void;
  onDelete: (id: string) => void;
  getDownloadUrl: (id: string) => string;
  activePreviewId: string | null;
}

export function FileList({
  files,
  onPreview,
  onDelete,
  getDownloadUrl,
  activePreviewId,
}: FileListProps) {
  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex items-center justify-between p-3 border rounded-lg"
        >
          <div className="flex flex-col gap-1">
            <span className="font-medium">{file.originalName}</span>
            <span className="text-xs text-muted-foreground">
              {file.status === "processed" ? "Processed" : file.status} ·{" "}
              {file.rowCount != null ? `${file.rowCount} rows · ` : ""}
              {formatBytes(file.size)}
            </span>
          </div>
          <div className="flex gap-2">
            {file.status === "processed" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPreview(file.id)}
                >
                  {activePreviewId === file.id ? "Hide" : "Preview"}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={getDownloadUrl(file.id)}>Download</a>
                </Button>
              </>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(file.id)}
              aria-label={`Delete ${file.originalName}`}
            >
              Delete
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 5: Create the preview component**

Create `apps/web/src/features/file/file-preview.tsx`:

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@project/ui/components/table";
import type { FilePreviewData } from "./types";

interface FilePreviewProps {
  data: FilePreviewData;
  isLoading: boolean;
}

export function FilePreview({ data, isLoading }: FilePreviewProps) {
  if (isLoading) {
    return <p className="text-muted-foreground py-4">Loading preview...</p>;
  }

  return (
    <div className="border rounded-lg mt-4 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {data.headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row, i) => (
            <TableRow key={i}>
              {data.headers.map((header) => (
                <TableCell key={header}>{row[header]}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 6: Create the route page**

Create `apps/web/src/routes/_authenticated/files.tsx`:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileList } from "#/features/file/file-list";
import { FilePreview } from "#/features/file/file-preview";
import { FileUploadForm } from "#/features/file/file-upload-form";
import { useFiles } from "#/features/file/use-files";

export const Route = createFileRoute("/_authenticated/files")({
  component: FilesPage,
});

function FilesPage() {
  const { trpc } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const {
    files,
    uploadFile,
    deleteFile,
    previewFileId,
    previewData,
    isPreviewLoading,
    loadPreview,
    getDownloadUrl,
  } = useFiles(trpc, queryClient);

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <h1 className="text-3xl font-bold mb-6">Files</h1>

      <FileUploadForm
        onUpload={(file) => uploadFile.mutate(file)}
        isPending={uploadFile.isPending}
      />

      {files.isPending ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : files.data?.length === 0 ? (
        <p className="text-muted-foreground">No files uploaded yet</p>
      ) : (
        <>
          <FileList
            files={files.data ?? []}
            onPreview={loadPreview}
            onDelete={(id) => deleteFile.mutate({ id })}
            getDownloadUrl={getDownloadUrl}
            activePreviewId={previewFileId}
          />
          {previewFileId && previewData && (
            <FilePreview
              data={previewData}
              isLoading={isPreviewLoading}
            />
          )}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Add Files link to navbar**

In `apps/web/src/widgets/navbar.tsx`, add to the `navLinks` array:

```typescript
{ to: "/files" as const, label: "Files" },
```

- [ ] **Step 8: Regenerate route tree**

```bash
make routes
```

- [ ] **Step 9: Run make lint**

```bash
make lint
```

Expected: PASS.

- [ ] **Step 10: Start dev server and test manually**

```bash
make dev
```

Test in browser:
1. Navigate to `/files` — should see empty state "No files uploaded yet"
2. Upload a CSV file — should appear in list with "Processed" status
3. Click "Preview" — should show data table
4. Click "Download" — should download the file
5. Click "Delete" — should remove from list

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/features/file/ apps/web/src/routes/_authenticated/files.tsx apps/web/src/widgets/navbar.tsx
git commit -m "feat: add file upload/download/preview UI"
```

---

### Task 8: E2E Step Definitions & BDD Tests

**Files:**
- Create: `e2e/steps/files.ts`

- [ ] **Step 1: Write step definitions**

Create `e2e/steps/files.ts`:

```typescript
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { resolve } from "node:path";

const { Given: given, When: when, Then: then } = createBdd();

given("I have uploaded {string}", async ({ page }, filename: string) => {
  const filePath = resolve(__dirname, `../fixtures/${filename}`);
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(filePath);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText(filename)).toBeVisible({ timeout: 10000 });
});

when("I upload the file {string}", async ({ page }, filename: string) => {
  const filePath = resolve(__dirname, `../fixtures/${filename}`);
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(filePath);
  await page.getByRole("button", { name: "Upload" }).click();
  await page.waitForLoadState("networkidle");
});

when(
  "I click the delete button for {string}",
  async ({ page }, filename: string) => {
    const row = page.locator("li", { hasText: filename });
    await row.getByRole("button", { name: /Delete/i }).click();
    await row.waitFor({ state: "detached", timeout: 5000 });
  },
);

then(
  "I should see a data table with {int} rows",
  async ({ page }, count: number) => {
    // Wait for table body rows (excluding header)
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(count, { timeout: 10000 });
  },
);
```

- [ ] **Step 2: Generate BDD test files**

```bash
cd e2e && pnpm exec bddgen
```

- [ ] **Step 3: Run BDD tests**

```bash
make test
```

Expected: All file scenarios PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/steps/files.ts e2e/.features-gen/
git commit -m "feat: add file upload/download BDD step definitions"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full quality gate**

```bash
make lint
```

Expected: PASS.

- [ ] **Step 2: Run all unit/integration tests**

```bash
make test-unit
```

Expected: All tests PASS.

- [ ] **Step 3: Run all BDD tests**

```bash
make test
```

Expected: All scenarios PASS (including existing auth, todos, mobile-nav, and new files).
