# TS Process Scripts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile shell process management with TypeScript scripts that AI agents can read and debug.

**Architecture:** Two standalone scripts (`generate-routes.ts` using `@tanstack/router-generator` API, `kill-ports.ts` using `lsof` + `kill`) called from Makefile targets. No new dependencies.

**Tech Stack:** TypeScript, tsx, @tanstack/router-generator, node:child_process

**Spec:** `docs/superpowers/specs/2026-04-12-ts-process-scripts-design.md`

---

### Task 1: Create `scripts/generate-routes.ts`

**Files:**
- Create: `scripts/generate-routes.ts`

- [ ] **Step 1: Save the current Vite-generated route tree for comparison**

```bash
cp apps/web/src/routeTree.gen.ts apps/web/src/routeTree.gen.ts.bak
```

- [ ] **Step 2: Create the script**

Create `scripts/generate-routes.ts`:

```ts
import { Generator, getConfig } from "@tanstack/router-generator";
import path from "node:path";

const webRoot = path.resolve(import.meta.dirname, "../apps/web");
const config = getConfig({}, webRoot);
const generator = new Generator({ config, root: webRoot });
await generator.run();
console.log("Route tree generated.");
```

- [ ] **Step 3: Run the script and verify output matches Vite**

```bash
pnpm exec tsx scripts/generate-routes.ts
```

Expected: Prints "Route tree generated." and `apps/web/src/routeTree.gen.ts` exists.

Then diff against the Vite-generated version:

```bash
diff apps/web/src/routeTree.gen.ts apps/web/src/routeTree.gen.ts.bak
```

Expected: Identical or cosmetic-only differences (whitespace, trailing newline). If there are structural differences, the `getConfig` call needs additional options — check what the Vite plugin passes by reading `node_modules/.pnpm/@tanstack+router-plugin*/node_modules/@tanstack/router-plugin/dist/esm/index.js` and match those options.

- [ ] **Step 4: Clean up backup and commit**

```bash
rm apps/web/src/routeTree.gen.ts.bak
git add scripts/generate-routes.ts
git commit -m "feat: add TypeScript route generation script

Uses @tanstack/router-generator programmatic API directly.
No Vite dev server, no background process, no port management."
```

---

### Task 2: Create `scripts/kill-ports.ts`

**Files:**
- Create: `scripts/kill-ports.ts`

- [ ] **Step 1: Create the script**

Create `scripts/kill-ports.ts`:

```ts
import { execSync } from "node:child_process";

const ports = process.argv.slice(2);
if (ports.length === 0) {
  console.error("Usage: kill-ports.ts <port> [port...]");
  process.exit(1);
}

for (const port of ports) {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim();
    if (pids) {
      execSync(`kill ${pids}`);
      console.log(`Killed processes on port ${port}: ${pids.replace(/\n/g, ", ")}`);
    }
  } catch {
    // No process on port — that's fine
  }
}
```

- [ ] **Step 2: Test with no processes running**

```bash
pnpm exec tsx scripts/kill-ports.ts 3000 3001
```

Expected: No output, exits 0 (no process found on those ports, catch block handles it silently).

- [ ] **Step 3: Test with a process running**

```bash
node -e "require('net').createServer().listen(19999)" &
sleep 1
pnpm exec tsx scripts/kill-ports.ts 19999
```

Expected: Prints `Killed processes on port 19999: <pid>`. The node process is killed.

Verify:

```bash
lsof -ti :19999
```

Expected: No output (port is free).

- [ ] **Step 4: Commit**

```bash
git add scripts/kill-ports.ts
git commit -m "feat: add TypeScript port cleanup script

Replaces inline lsof | xargs kill shell commands.
Uses SIGTERM, logs what it kills, silent when no process found."
```

---

### Task 3: Simplify Makefile to use TS scripts

**Files:**
- Modify: `Makefile:16-29` (replace `routes` target)
- Modify: `Makefile:32-34` (simplify `dev` target)
- Modify: `Makefile:62-67` (simplify `test` and `test-ui` targets)

- [ ] **Step 1: Replace the `routes` target**

Replace lines 16-29 (the entire routes target with its comments):

```makefile
# Regenerate route tree without full dev server
# Uses port 4173 (not 0) so we can pre-kill stale processes and clean up reliably via lsof
routes:
	@echo "Generating route tree..."
	@lsof -ti :4173 | xargs kill 2>/dev/null || true
	@rm -f apps/web/src/routeTree.gen.ts; \
		pnpm --filter @project/web exec vite dev --port 4173 --strictPort & \
		TRIES=0; \
		while [ ! -f apps/web/src/routeTree.gen.ts ]; do \
			sleep 0.5; TRIES=$$((TRIES+1)); \
			if [ $$TRIES -ge 30 ]; then echo "ERROR: Route tree generation timed out after 15s"; lsof -ti :4173 | xargs kill 2>/dev/null; exit 1; fi; \
		done; \
		sleep 1; \
		lsof -ti :4173 | xargs kill 2>/dev/null || true
```

With:

```makefile
# Regenerate route tree (no dev server needed)
routes:
	@pnpm exec tsx scripts/generate-routes.ts
```

- [ ] **Step 2: Simplify the `dev` target**

Replace:

```makefile
dev:
	@lsof -ti :3000,:3001 | xargs kill 2>/dev/null || true
	pnpm -w run dev
```

With:

```makefile
dev:
	@pnpm exec tsx scripts/kill-ports.ts 3000 3001
	pnpm -w run dev
```

- [ ] **Step 3: Simplify the `test` and `test-ui` targets**

Replace:

```makefile
test:
	@lsof -ti :3100,:3101 | xargs kill 2>/dev/null || true
	cd e2e && pnpm exec bddgen && pnpm exec playwright test
test-ui:
	@lsof -ti :3100,:3101 | xargs kill 2>/dev/null || true
	cd e2e && pnpm exec bddgen && pnpm exec playwright test --ui
```

With:

```makefile
test:
	@pnpm exec tsx scripts/kill-ports.ts 3100 3101
	cd e2e && pnpm exec bddgen && pnpm exec playwright test
test-ui:
	@pnpm exec tsx scripts/kill-ports.ts 3100 3101
	cd e2e && pnpm exec bddgen && pnpm exec playwright test --ui
```

- [ ] **Step 4: Test `make routes`**

```bash
make routes
```

Expected: Prints "Route tree generated." and completes in under 2 seconds (no Vite startup). Verify file exists:

```bash
ls -la apps/web/src/routeTree.gen.ts
```

- [ ] **Step 5: Run `make check`**

```bash
make check
```

Expected: All lint and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add Makefile
git commit -m "refactor: replace shell process management with TS scripts

Routes target now uses @tanstack/router-generator directly (~1s vs ~5s).
Port cleanup uses scripts/kill-ports.ts instead of inline lsof commands."
```
