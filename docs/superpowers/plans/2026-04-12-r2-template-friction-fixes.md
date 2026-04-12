# R2 Template Friction Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the template self-managing for AI agents — eliminate process plumbing friction and document patterns that caused Round 2 demo failures.

**Architecture:** All changes target the Makefile (process management) and CLAUDE.md files (agent guidance). No application code changes. The Makefile gains a `routes` target and self-cleaning port management. Three CLAUDE.md files get new entries for patterns agents got wrong.

**Tech Stack:** Make, lsof, Vite (for route generation), Playwright (locator guidance)

**Spec:** `docs/superpowers/specs/2026-04-12-r2-template-friction-design.md`

---

### Task 1: Add `make routes` target

**Files:**
- Modify: `Makefile:1` (`.PHONY` line)
- Modify: `Makefile:12-16` (extract from `setup`, add `routes` target)

- [ ] **Step 1: Add `routes` to `.PHONY` declaration**

In `Makefile` line 1, add `routes` to the `.PHONY` list:

```makefile
.PHONY: setup dev db db-push db-generate db-studio db-seed check typecheck lint fix test test-ui test-unit clean routes
```

- [ ] **Step 2: Add the `routes` target**

Add this target after the `setup` target (after line 17) and before the `dev` target:

```makefile
# Regenerate route tree without full dev server
routes:
	@echo "Generating route tree..."
	@cd apps/web && rm -f src/routeTree.gen.ts && \
		pnpm exec vite dev --port 0 & VIT_PID=$$!; \
		TRIES=0; \
		while [ ! -f src/routeTree.gen.ts ]; do \
			sleep 0.5; TRIES=$$((TRIES+1)); \
			if [ $$TRIES -ge 30 ]; then echo "ERROR: Route tree generation timed out after 15s"; kill $$VIT_PID 2>/dev/null; exit 1; fi; \
		done; \
		sleep 1; \
		kill $$VIT_PID 2>/dev/null; wait $$VIT_PID 2>/dev/null; true
```

- [ ] **Step 3: Update `setup` to call `routes`**

Replace the inline route generation in the `setup` target (lines 12-15):

```makefile
	@echo "Generating route tree..."
	@cd apps/web && pnpm exec vite dev --port 0 & VIT_PID=$$!; \
		while [ ! -f src/routeTree.gen.ts ]; do sleep 0.5; done; \
		kill $$VIT_PID 2>/dev/null; wait $$VIT_PID 2>/dev/null; true
```

With:

```makefile
	$(MAKE) routes
```

- [ ] **Step 4: Test `make routes`**

Run: `make routes`

Expected: Prints "Generating route tree...", regenerates `apps/web/src/routeTree.gen.ts`, exits cleanly within ~5 seconds. Verify the file exists and has recent mtime:

```bash
ls -la apps/web/src/routeTree.gen.ts
```

- [ ] **Step 5: Commit**

```bash
git add Makefile
git commit -m "feat: add make routes for standalone route tree generation

Extracts the Vite start-wait-kill pattern from make setup into a
standalone target. Includes 15s timeout to prevent infinite hangs.
Subagents call this after creating/deleting route files."
```

---

### Task 2: Add self-cleaning port management to `make dev`, `make test`, `make test-ui`

**Files:**
- Modify: `Makefile:20-21` (`dev` target)
- Modify: `Makefile:49-50` (`test` target)
- Modify: `Makefile:51-52` (`test-ui` target)

- [ ] **Step 1: Add port cleanup to `dev` target**

Change the `dev` target from:

```makefile
dev:
	pnpm -w run dev
```

To:

```makefile
dev:
	@lsof -ti :3000,:3001 | xargs kill 2>/dev/null || true
	pnpm -w run dev
```

- [ ] **Step 2: Add port cleanup to `test` target**

Change the `test` target from:

```makefile
test:
	cd e2e && pnpm exec bddgen && pnpm exec playwright test
```

To:

```makefile
test:
	@lsof -ti :3100,:3101 | xargs kill 2>/dev/null || true
	cd e2e && pnpm exec bddgen && pnpm exec playwright test
```

- [ ] **Step 3: Add port cleanup to `test-ui` target**

Change the `test-ui` target from:

```makefile
test-ui:
	cd e2e && pnpm exec bddgen && pnpm exec playwright test --ui
```

To:

```makefile
test-ui:
	@lsof -ti :3100,:3101 | xargs kill 2>/dev/null || true
	cd e2e && pnpm exec bddgen && pnpm exec playwright test --ui
```

- [ ] **Step 4: Verify port cleanup works**

Start a dummy server on port 3000, then run `make dev` to confirm it gets killed:

```bash
node -e "require('net').createServer().listen(3000)" &
sleep 1
lsof -ti :3000  # should show a PID
make dev &
sleep 2
# dev server should start without port-in-use error
kill %1 %2 2>/dev/null || true
```

- [ ] **Step 5: Commit**

```bash
git add Makefile
git commit -m "feat: self-cleaning ports in make dev/test/test-ui

Each target kills stale processes on its ports before starting.
Dev cleans 3000/3001, test cleans 3100/3101. Uses SIGTERM for
graceful shutdown. Agents never need to think about port conflicts."
```

---

### Task 3: Update root CLAUDE.md — Commands and Common Mistakes

**Files:**
- Modify: `CLAUDE.md:20-27` (Commands section)
- Modify: `CLAUDE.md:65-76` (Common Mistakes table)

- [ ] **Step 1: Add `make routes` to Commands section**

In `CLAUDE.md`, after line 24 (`- `make test` — BDD tests...`), add:

```markdown
- `make routes` — regenerate TanStack Router route tree without starting dev server
```

- [ ] **Step 2: Add Button `asChild` row to Common Mistakes table**

In `CLAUDE.md`, after the last row of the Common Mistakes table (line 76, the `//` in JSX row), add:

```markdown
| `<Link>` wrapping `<Button>` | Nested `<a><button>` breaks accessibility and BDD click handlers | Use `<Button asChild><Link to="...">Text</Link></Button>` — renders single `<a>` element |
```

- [ ] **Step 3: Add `setQueryData` row to Common Mistakes table**

After the row just added, add:

```markdown
| `setQueryData` callback type errors with tRPC | tRPC's `queryKey` type inference breaks on `onMutate` callback parameter | Define explicit types for query data shape (see optimistic updates guide in `apps/web/CLAUDE.md`) |
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add make routes command and 2 common mistakes entries

Adds route generation command reference, documents Button asChild
pattern and setQueryData type inference gotcha."
```

---

### Task 4: Update `apps/web/CLAUDE.md` — route regen docs and optimistic updates

**Files:**
- Modify: `apps/web/CLAUDE.md:33-35` (Adding a New Page section)
- Modify: `apps/web/CLAUDE.md:93-95` (Optimistic Updates section)

- [ ] **Step 1: Update route regeneration guidance**

In `apps/web/CLAUDE.md`, replace lines 33-35:

```markdown
3. The route tree regenerates automatically on `vite dev`
   If the dev server isn't running when you add/remove route files, start `make dev` to regenerate. There is no standalone generation command.
```

With:

```markdown
3. The route tree regenerates automatically on `vite dev`
   If the dev server isn't running, run `make routes` to regenerate without starting the full dev server.
   When adding multiple routes, create all route files first, then run `make routes` once.
```

- [ ] **Step 2: Expand Optimistic Updates section**

In `apps/web/CLAUDE.md`, replace lines 93-95:

```markdown
### Optimistic Updates

For instant UI feedback before the server confirms, see the drag-and-drop reorder handler in `src/routes/_authenticated/todos.tsx` — it uses `queryClient.setQueryData` to update the cache immediately, with `onError` invalidation as fallback.
```

With:

```markdown
### Optimistic Updates

For instant UI feedback before the server confirms, see the drag-and-drop reorder handler in `src/routes/_authenticated/todos.tsx` — it uses `queryClient.setQueryData` to update the cache immediately, with `onError` invalidation as fallback.

When using `onMutate` callbacks with tRPC, define explicit types for the data shape — tRPC's type inference breaks on the callback parameter:

```tsx
// Define explicit types matching your router's return shape
type TodoItem = { id: string; title: string; position: number };
type TodoList = TodoItem[];

const previous = queryClient.getQueryData<TodoList>(trpc.todo.list.queryOptions().queryKey);
queryClient.setQueryData<TodoList>(trpc.todo.list.queryOptions().queryKey, (old) => {
  if (!old) return old;
  // TypeScript now knows old is TodoList, not unknown
  return old.map((item) => (item.id === targetId ? { ...item, position: newPos } : item));
});
```
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/CLAUDE.md
git commit -m "docs: update route regen guidance and optimistic update types

Replaces 'no standalone generation command' with make routes reference.
Adds 'create all routes first' tip. Documents explicit type pattern
for setQueryData callbacks with tRPC."
```

---

### Task 5: Update `e2e/CLAUDE.md` — test failure patterns and locator scoping

**Files:**
- Modify: `e2e/CLAUDE.md` (add two new sections before "Do Not" section)

- [ ] **Step 1: Add "Known Test Failure Patterns" section**

In `e2e/CLAUDE.md`, before the "## Do Not" section (line 78), add:

```markdown
## Known Test Failure Patterns

| Symptom | Cause | Fix |
|---------|-------|-----|
| `getByRole("button")` click doesn't navigate | `<Link>` wrapping `<Button>` creates nested `<a><button>` | Use `<Button asChild><Link>` instead (single element) |

```

- [ ] **Step 2: Add "Locator Scoping" section**

After the "Known Test Failure Patterns" section just added, add:

```markdown
## Locator Scoping

When multiple identical elements exist in different sections (e.g., "Add" buttons in
each column), scope to the nearest **semantic** container — not `div`:

```typescript
// BAD: div matches nested containers too broadly
const column = page.locator("div", { has: page.getByRole("heading", { name: "To Do" }) });
column.getByRole("button", { name: "Add" }); // finds buttons in ALL columns

// GOOD: scope to semantic element (form, section, nav, [role="region"])
const form = page.locator("form", { has: page.getByPlaceholder("Add a card") });
form.getByRole("button", { name: "Add" }); // finds only this form's button
```

If no semantic container exists, add `data-testid` to the section wrapper.
Prefer `form`, `section`, `nav`, `article`, `[role="region"]` over generic `div`.

```

- [ ] **Step 3: Commit**

```bash
git add e2e/CLAUDE.md
git commit -m "docs: add BDD test failure patterns and locator scoping guide

Documents Link/Button nesting as known failure pattern. Adds locator
scoping guidance with bad/good examples to prevent broad div matching."
```

---

### Task 6: Verify all changes together

- [ ] **Step 1: Run `make routes` to verify route generation**

```bash
make routes
```

Expected: Completes within ~5 seconds, prints "Generating route tree...", `apps/web/src/routeTree.gen.ts` exists with recent timestamp.

- [ ] **Step 2: Run `make check` to verify no lint/type issues**

```bash
make check
```

Expected: All lint and typecheck pass. No changes should affect application code.

- [ ] **Step 3: Verify CLAUDE.md files are well-formed**

Skim each modified file to confirm markdown tables render correctly and no formatting issues:

```bash
head -80 CLAUDE.md | tail -20        # Common Mistakes table
head -100 apps/web/CLAUDE.md | tail -15  # Optimistic Updates
head -95 e2e/CLAUDE.md | tail -25    # New sections
```

- [ ] **Step 4: Final commit (if any fixups needed)**

Only if previous verification steps required fixes. Otherwise skip.
