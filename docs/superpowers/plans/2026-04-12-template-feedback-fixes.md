# Template Feedback Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address 9 template issues found in real-world testing and code review — router split, test port separation, docs, CI, seed idempotency.

**Architecture:** Mostly refactoring and documentation. Router split into `routers/` directory. Test servers use separate ports (3100/3101) from dev (3000/3001). Several CLAUDE.md documentation improvements.

**Tech Stack:** tRPC, Playwright, GitHub Actions, pino, Prisma

---

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/api/src/routers/todo.ts` | Todo sub-router |
| Modify | `packages/api/src/router.ts` | Import from routers/, keep appRouter |
| Modify | `packages/api/src/index.ts` | Re-export from routers if needed |
| Modify | `apps/server/src/index.ts` | Make port configurable via PORT env |
| Modify | `e2e/playwright.config.ts` | Test ports 3100/3101 |
| Modify | `e2e/steps/auth.ts` | Fix hardcoded localhost:3000, fix waitForTimeout |
| Modify | `e2e/steps/mobile-nav.ts` | Fix waitForTimeout |
| Modify | `.github/workflows/ci.yml` | Add Vitest, update ports |
| Modify | `scripts/seed.ts` | Idempotent check |
| Modify | `CLAUDE.md` | Common Mistakes additions |
| Modify | `apps/web/CLAUDE.md` | Route tree docs, optimistic update ref |
| Modify | `packages/api/CLAUDE.md` | Routers/ convention |
| Modify | `e2e/CLAUDE.md` | Test port docs |

---

### Task 1: Split tRPC router into `routers/` directory

**Files:**
- Create: `packages/api/src/routers/todo.ts`
- Modify: `packages/api/src/router.ts`

- [ ] **Step 1: Create `packages/api/src/routers/todo.ts`**

```typescript
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const todoRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.todo.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: [{ completed: "asc" }, { position: "asc" }],
    });
  }),
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
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
```

- [ ] **Step 2: Update `packages/api/src/router.ts` to import from routers/**

Replace entire file with:

```typescript
import { publicProcedure, protectedProcedure, router } from "./trpc.js";
import { todoRouter } from "./routers/todo.js";

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

- [ ] **Step 3: Run integration tests to verify nothing broke**

Run: `pnpm --filter @project/api test`
Expected: all 9 tests PASS

- [ ] **Step 4: Run quality gate**

Run: `make -C /Users/iorlas/Workspaces/agentic-web-stack check`
Expected: 13 passed, 0 failed + typecheck clean

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/ packages/api/src/router.ts
git commit -m "refactor: split tRPC router into routers/ directory"
```

---

### Task 2: Test servers on separate ports + fix hardcoded URLs + fix waitForTimeout

**Files:**
- Modify: `apps/server/src/index.ts` (line 100 — make port configurable)
- Modify: `e2e/playwright.config.ts`
- Modify: `e2e/steps/auth.ts` (lines 120, 125, 142)
- Modify: `e2e/steps/mobile-nav.ts` (line 9)

- [ ] **Step 1: Make server port configurable**

In `apps/server/src/index.ts`, change line 100 from:

```typescript
serve({ fetch: app.fetch, port: 3001 }, (info) => {
```

to:

```typescript
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3001) }, (info) => {
```

- [ ] **Step 2: Update playwright.config.ts test ports**

Replace the `webServer` array and `use.baseURL` in `e2e/playwright.config.ts`:

Change `baseURL` from `"http://localhost:3000"` to `"http://localhost:3100"`.

Replace the webServer array with:

```typescript
  webServer: [
    {
      command: "pnpm --filter @project/server dev",
      port: 3101,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: "3101",
        DATABASE_URL: TEST_DATABASE_URL,
        BETTER_AUTH_SECRET: "test-secret-key-for-e2e-tests-only-32chars",
        BETTER_AUTH_URL: "http://localhost:3101",
        CORS_ORIGIN: "http://localhost:3100",
      },
    },
    {
      command: "pnpm --filter @project/web dev -- --port 3100",
      port: 3100,
      reuseExistingServer: !process.env.CI,
    },
  ],
```

- [ ] **Step 3: Fix hardcoded localhost:3000 in auth steps**

In `e2e/steps/auth.ts`, replace:

```typescript
then("I should be on the home page", async ({ page }) => {
  await expect(page).toHaveURL("http://localhost:3000/", { timeout: 5000 });
});
```

with:

```typescript
then("I should be on the home page", async ({ page }) => {
  await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
});
```

And replace:

```typescript
then("I should be signed out", async ({ page }) => {
  // After sign-out, user lands on either / or /login (race between explicit nav and auth guard)
  await page.waitForURL(/^\http:\/\/localhost:3000\/(login)?$/, {
    timeout: 5000,
  });
```

with:

```typescript
then("I should be signed out", async ({ page }) => {
  // After sign-out, user lands on either / or /login (race between explicit nav and auth guard)
  await page.waitForURL(/\/(login)?$/, {
    timeout: 5000,
  });
```

- [ ] **Step 4: Fix waitForTimeout(400) in auth.ts**

In `e2e/steps/auth.ts`, inside the "I should see" step, replace:

```typescript
      await page.waitForTimeout(400);
```

with:

```typescript
      await page.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 3000 });
```

- [ ] **Step 5: Fix waitForTimeout(400) in mobile-nav.ts**

In `e2e/steps/mobile-nav.ts`, replace:

```typescript
when("I open the mobile menu", async ({ page }) => {
  await page.getByRole("button", { name: "Toggle menu" }).click();
  // Wait for the sheet animation to complete
  await page.waitForTimeout(400);
});
```

with:

```typescript
when("I open the mobile menu", async ({ page }) => {
  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 3000 });
});
```

- [ ] **Step 6: Run quality gate**

Run: `make -C /Users/iorlas/Workspaces/agentic-web-stack fix && make -C /Users/iorlas/Workspaces/agentic-web-stack check`

- [ ] **Step 7: Kill stale servers and run BDD tests**

```bash
lsof -i :3000 -i :3001 -i :3100 -i :3101 2>/dev/null | grep LISTEN | awk '{print $2}' | sort -u | xargs kill 2>/dev/null
docker ps -q --filter "name=agentic-postgres-test" | xargs docker rm -f 2>/dev/null
make -C /Users/iorlas/Workspaces/agentic-web-stack test
```

Expected: 25 passed

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/index.ts e2e/playwright.config.ts e2e/steps/auth.ts e2e/steps/mobile-nav.ts
git commit -m "fix: use separate test ports (3100/3101), fix hardcoded URLs and waitForTimeout"
```

---

### Task 3: Add Vitest to CI pipeline + update CI ports

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update CI workflow**

Replace the `test` job with:

```yaml
  test:
    name: Integration & BDD Tests
    runs-on: ubuntu-latest
    needs: check
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_DB: agentic_web_stack_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5433/agentic_web_stack_test
      BETTER_AUTH_SECRET: test-secret-key-for-ci-tests-only-32chars
      BETTER_AUTH_URL: http://localhost:3101
      CORS_ORIGIN: http://localhost:3100
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @project/db push
      - run: pnpm --filter @project/api test
      - run: pnpm exec playwright install chromium --with-deps
      - run: cd e2e && pnpm exec bddgen && pnpm exec playwright test
```

- [ ] **Step 2: Run quality gate**

Run: `make -C /Users/iorlas/Workspaces/agentic-web-stack check`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add Vitest integration tests, update test ports to 3100/3101"
```

---

### Task 4: Make seed script idempotent

**Files:**
- Modify: `scripts/seed.ts`

- [ ] **Step 1: Update seed script with existence check**

Replace `scripts/seed.ts` with:

```typescript
import { auth } from "@project/auth";
import { db } from "@project/db";

async function main() {
  console.log("Seeding database...");

  // Check if already seeded
  const existing = await db.user.findFirst({
    where: { email: "demo@example.com" },
  });

  if (existing) {
    console.log("Already seeded (demo@example.com exists), skipping.");
    return;
  }

  // Create demo user via Better-Auth (handles password hashing)
  const { user } = await auth.api.signUpEmail({
    body: {
      email: "demo@example.com",
      password: "password123",
      name: "Demo User",
    },
  });

  console.log(`Created user: ${user.email}`);

  // Create sample todos
  await db.todo.createMany({
    data: [
      {
        title: "Set up the project",
        completed: true,
        position: 0,
        userId: user.id,
      },
      {
        title: "Add authentication",
        completed: true,
        position: 1,
        userId: user.id,
      },
      {
        title: "Build the dashboard",
        completed: false,
        position: 0,
        userId: user.id,
      },
      {
        title: "Write BDD tests",
        completed: false,
        position: 1,
        userId: user.id,
      },
      {
        title: "Deploy to production",
        completed: false,
        position: 2,
        userId: user.id,
      },
    ],
  });

  console.log("Created 5 sample todos");
  console.log("\nDemo credentials:");
  console.log("  Email:    demo@example.com");
  console.log("  Password: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
```

- [ ] **Step 2: Run quality gate**

Run: `make -C /Users/iorlas/Workspaces/agentic-web-stack check`

- [ ] **Step 3: Commit**

```bash
git add scripts/seed.ts
git commit -m "fix: make seed script idempotent (skip if already seeded)"
```

---

### Task 5: Update all documentation

**Files:**
- Modify: `CLAUDE.md` (root)
- Modify: `apps/web/CLAUDE.md`
- Modify: `packages/api/CLAUDE.md`
- Modify: `e2e/CLAUDE.md`

- [ ] **Step 1: Add Common Mistakes entries to root CLAUDE.md**

Read `CLAUDE.md`. Find the Common Mistakes table. Add two new rows at the end of the table:

```markdown
| `Link to` rejects not-yet-created routes | TanStack Router types from `routeTree.gen.ts` | Use `to={"/path" as string}` temporarily, remove once route exists and `make dev` regenerates |
| `//` in JSX text content | Biome `noCommentText` flags as comment | Wrap in expression: `<p>{"https://example.com"}</p>` |
```

- [ ] **Step 2: Update apps/web/CLAUDE.md — route tree + optimistic updates**

Read `apps/web/CLAUDE.md`. Find the "Adding a New Page" section step 3 that says "The route tree regenerates automatically on `vite dev`". After that line, add:

```markdown
If the dev server isn't running when you add/remove route files, start `make dev` to regenerate. There is no standalone generation command.
```

Then find the "Using tRPC Data" section. After the existing code example, add:

```markdown
### Optimistic Updates

For instant UI feedback before the server confirms, see the drag-and-drop reorder handler in `src/routes/_authenticated/todos.tsx` — it uses `queryClient.setQueryData` to update the cache immediately, with `onError` invalidation as fallback.
```

- [ ] **Step 3: Update packages/api/CLAUDE.md — routers/ convention**

Read `packages/api/CLAUDE.md`. Replace the "## Adding a New Route" section and "## File Structure" section with:

```markdown
## Adding a New Router

1. Create a file in `src/routers/<name>.ts` with a sub-router
2. Import and mount it in `src/router.ts`
3. Use `publicProcedure` for unauthenticated routes, `protectedProcedure` for authenticated
4. Add input validation with Zod
5. Run `make check` — types propagate to apps/web automatically

### Example: Add a posts router

Create `src/routers/post.ts`:

```typescript
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

export const postRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.post.findMany({
      where: { userId: ctx.session.user.id },
    });
  }),
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.post.create({
        data: { title: input.title, userId: ctx.session.user.id },
      });
    }),
});
```

Then mount in `src/router.ts`:

```typescript
import { postRouter } from "./routers/post.js";

export const appRouter = router({
  // ... existing routes
  post: postRouter,
});
```

## File Structure

- `src/trpc.ts` — single `initTRPC.create()`, exports `router`, `publicProcedure`, `protectedProcedure`
- `src/context.ts` — `createContext()` receives session from Hono, exports `Context` type
- `src/router.ts` — `appRouter` merging sub-routers, exports `AppRouter` type
- `src/routers/` — one file per domain sub-router (e.g., `todo.ts`, `post.ts`)
- `src/index.ts` — re-exports everything
```

- [ ] **Step 4: Update e2e/CLAUDE.md — test ports**

Read `e2e/CLAUDE.md`. Find the "## Test Infrastructure" section. Replace it with:

```markdown
## Test Infrastructure

- `docker-compose.test.yml` — Postgres on dynamic port (derived from directory hash), tmpfs (in-memory)
- `test-env.ts` — derives unique DB port and container name from project directory hash (worktree-safe)
- `global-setup.ts` — reuses healthy container or creates fresh; pushes schema
- `playwright.config.ts` — starts web (port 3100) and server (port 3101) with test env vars
- Test ports (3100/3101) are separate from dev ports (3000/3001) — both can run simultaneously
- Fully parallel execution (7 workers), desktop then mobile with DB reset between
```

- [ ] **Step 5: Run quality gate**

Run: `make -C /Users/iorlas/Workspaces/agentic-web-stack check`

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md apps/web/CLAUDE.md packages/api/CLAUDE.md e2e/CLAUDE.md
git commit -m "docs: router convention, test ports, route tree regen, optimistic updates, lint gotchas"
```
