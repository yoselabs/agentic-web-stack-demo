# R2 Template Friction Fixes — Design Spec

## Summary

Address friction from Round 2 demo (Retro Board) that blocks or slows AI agents. Two signals:
- `retro-board-r2-template-friction.yaml` — route regen, type inference, BDD locators
- `agent-process-management-gaps.yaml` — port conflicts, process lifecycle

6 changes: 3 Makefile improvements (process management), 3 documentation additions (patterns + gotchas).

## 1. `make routes` — standalone route tree generation

**Problem:** Route tree (`routeTree.gen.ts`) only regenerates when Vite dev server runs. Subagents must start-wait-kill Vite manually. Task 5 agent got stuck entirely.

**Solution:** Extract the Vite start-wait-kill pattern already in `make setup` (lines 13–15) into a standalone `make routes` target. Have `make setup` call `make routes`.

```makefile
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

Approach: delete the gen file first, then wait for existence (simpler than mtime comparison). 15-second timeout prevents infinite hangs if Vite fails to start or a route has a syntax error. The `sleep 1` after detection gives Vite time to finish writing.

Add `routes` to the `.PHONY` declaration at line 1 of the Makefile.

Update `make setup` to call `$(MAKE) routes` instead of inlining the Vite start-wait-kill logic (lines 12–15).

**CLAUDE.md updates:**
- `apps/web/CLAUDE.md` line 35: Replace "There is no standalone generation command" with "Run `make routes` to regenerate without starting the full dev server."
- `apps/web/CLAUDE.md` "Adding a New Page" section: Add "When adding multiple routes, create all route files first, then run `make routes` once."
- Root `CLAUDE.md` Commands section: Add `make routes`.

## 2. Self-cleaning `make dev` and `make test`

**Problem:** Agents hit port-in-use errors when stale dev servers are running. They don't think to kill ports before starting. `make test` fails silently or connects to the wrong server.

**Solution:** Each command kills its own ports before starting. No separate cleanup command needed — process management is invisible to agents.

```makefile
dev:
	@lsof -ti :3000,:3001 | xargs kill 2>/dev/null || true
	pnpm -w run dev

test:
	@lsof -ti :3100,:3101 | xargs kill 2>/dev/null || true
	cd e2e && pnpm exec bddgen && pnpm exec playwright test
```

Uses SIGTERM (default `kill`) instead of SIGKILL (`-9`) for graceful shutdown. If a process doesn't die, the subsequent port-in-use error is clear enough.

Same for `test-ui`. No documentation needed — agents never see the problem.

## 3. Button `asChild` navigation pattern

**Problem:** Agent used `<Link><Button>` (nested `<a><button>`), violating HTML spec. BDD `getByRole("button")` click didn't trigger navigation.

**Solution:** Document in two places agents look:

**Root `CLAUDE.md` Common Mistakes table — add row:**

| `<Link>` wrapping `<Button>` | Nested `<a><button>` breaks accessibility and BDD click handlers | Use `<Button asChild><Link to="...">Text</Link></Button>` — renders single `<a>` element |

**`e2e/CLAUDE.md` — add "Known Test Failure Patterns" section:**

```markdown
## Known Test Failure Patterns

| Symptom | Cause | Fix |
|---------|-------|-----|
| `getByRole("button")` click doesn't navigate | `<Link>` wrapping `<Button>` creates nested `<a><button>` | Use `<Button asChild><Link>` instead (single element) |
```

## 4. `setQueryData` explicit types for optimistic updates

**Problem:** `queryClient.getQueryData(queryOptions.queryKey)` returns `TData | undefined`. In `setQueryData` callbacks with tRPC, TypeScript can't infer nested properties. Agent had to discover this through trial and error.

**Solution:** Two additions:

**Root `CLAUDE.md` Common Mistakes table — add row:**

| `setQueryData` callback type errors with tRPC | tRPC's `queryKey` type inference breaks on `onMutate` callback parameter | Define explicit types for query data shape (see optimistic updates guide in `apps/web/CLAUDE.md`) |

**`apps/web/CLAUDE.md` Optimistic Updates section — expand with example:**

```markdown
### Optimistic Updates

For instant UI feedback before the server confirms, see the drag-and-drop reorder handler
in `src/routes/_authenticated/todos.tsx`.

When using `onMutate` callbacks with tRPC, define explicit types for the data shape —
tRPC's type inference breaks on the callback parameter:

\`\`\`tsx
// Define explicit types matching your router's return shape
type TodoItem = { id: string; title: string; position: number };
type TodoList = TodoItem[];

const previous = queryClient.getQueryData<TodoList>(trpc.todo.list.queryOptions().queryKey);
queryClient.setQueryData<TodoList>(trpc.todo.list.queryOptions().queryKey, (old) => {
  if (!old) return old;
  // TypeScript now knows old is TodoList, not unknown
  return old.map((item) => (item.id === targetId ? { ...item, position: newPos } : item));
});
\`\`\`
```

## 5. BDD locator scoping guidance

**Problem:** `page.locator("div", { has: heading })` matched nested divs containing all three board columns. Agent picked the wrong scoping strategy.

**Solution:** Add "Locator Scoping" section to `e2e/CLAUDE.md`:

```markdown
## Locator Scoping

When multiple identical elements exist in different sections (e.g., "Add" buttons in
each column), scope to the nearest **semantic** container — not `div`:

\`\`\`typescript
// BAD: div matches nested containers too broadly
const column = page.locator("div", { has: page.getByRole("heading", { name: "To Do" }) });
column.getByRole("button", { name: "Add" }); // finds buttons in ALL columns

// GOOD: scope to semantic element (form, section, nav, [role="region"])
const form = page.locator("form", { has: page.getByPlaceholder("Add a card") });
form.getByRole("button", { name: "Add" }); // finds only this form's button
\`\`\`

If no semantic container exists, add `data-testid` to the section wrapper.
Prefer `form`, `section`, `nav`, `article`, `[role="region"]` over generic `div`.
```

## 6. Carry Round 2 batching insight to dev cycle handover

**Already done:** Added "Observations from Round 2" section to `docs/superpowers/specs/2026-04-12-development-cycle-handover.md` capturing that batching tRPC routers (Tasks 2–4) into one subagent was 3x more efficient. This informs the vertical slicing process design in a future session.

## Files Changed

| File | Changes |
|------|---------|
| `Makefile` | Add `routes` to `.PHONY`, add `routes` target, port cleanup in `dev`/`test`/`test-ui`, `setup` calls `$(MAKE) routes` |
| `CLAUDE.md` (root) | Add `make routes` to Commands, 2 new Common Mistakes rows |
| `apps/web/CLAUDE.md` | Update route regen docs, add "create all routes first" tip, expand optimistic updates section |
| `e2e/CLAUDE.md` | Add "Known Test Failure Patterns" and "Locator Scoping" sections |
