# TS Process Scripts — Design Spec

## Summary

Replace fragile shell process management in Makefile with TypeScript scripts. Two scripts:
1. `scripts/generate-routes.ts` — uses `@tanstack/router-generator` programmatic API directly (no Vite, no background process)
2. `scripts/kill-ports.ts` — kills processes on given ports (replaces inline `lsof | xargs kill`)

## Motivation

The shell-based `make routes` target produced 3 bugs in one session: `&;` syntax error, missing `--strictPort`, dead `VIT_PID` variable. Shell process management (background jobs, PID capture, `lsof`, timeout loops) is hostile to AI agents who need to read, modify, and debug these scripts. TypeScript with proper imports and async/await is easier for both humans and agents.

## 1. `scripts/generate-routes.ts`

Uses `@tanstack/router-generator` (already available as transitive dependency of `@tanstack/router-plugin`) to generate `routeTree.gen.ts` directly. No Vite dev server, no background process, no port, no timeout.

```ts
import { Generator, getConfig } from "@tanstack/router-generator";
import path from "node:path";

const webRoot = path.resolve(import.meta.dirname, "../apps/web");
const config = getConfig({}, webRoot);
const generator = new Generator({ config, root: webRoot });
await generator.run();
console.log("Route tree generated.");
```

**Key detail:** `getConfig({}, webRoot)` resolves the router config from the `apps/web` directory. With no `tsr.config.ts` file present, it uses defaults: `routesDirectory: './src/routes'`, `generatedRouteTree: './src/routeTree.gen.ts'`. This matches the Vite plugin's behavior since the plugin also uses `getConfig` internally.

**Verify during implementation:** Run the script and diff the output against the Vite-generated `routeTree.gen.ts`. They should be identical. If not, pass additional config options to match.

## 2. `scripts/kill-ports.ts`

Kills processes listening on the specified ports. Replaces the `lsof -ti :PORT | xargs kill` one-liners.

```ts
// Usage: pnpm exec tsx scripts/kill-ports.ts 3000 3001
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

Uses SIGTERM (default `kill`). Logs what it kills for debuggability. Silent when no process found.

## 3. Makefile changes

Replace the shell-based `routes` target and inline port cleanup:

```makefile
# Regenerate route tree (no dev server needed)
routes:
	@pnpm exec tsx scripts/generate-routes.ts

# Start both web and server
dev:
	@pnpm exec tsx scripts/kill-ports.ts 3000 3001
	pnpm -w run dev

# BDD Tests (uses separate test database on port 5433)
test:
	@pnpm exec tsx scripts/kill-ports.ts 3100 3101
	cd e2e && pnpm exec bddgen && pnpm exec playwright test
test-ui:
	@pnpm exec tsx scripts/kill-ports.ts 3100 3101
	cd e2e && pnpm exec bddgen && pnpm exec playwright test --ui
```

The `setup` target already calls `$(MAKE) routes`, so it benefits automatically.

Remove port 4173 from `.PHONY` comment and any `lsof` references from the `routes` target.

## Files Changed

| File | Action |
|------|--------|
| `scripts/generate-routes.ts` | Create (~10 lines) |
| `scripts/kill-ports.ts` | Create (~15 lines) |
| `Makefile` | Simplify `routes`, `dev`, `test`, `test-ui` targets |

## No New Dependencies

- `tsx` — already a workspace dev dependency
- `@tanstack/router-generator` — already available as transitive dependency of `@tanstack/router-plugin`
- `node:child_process`, `node:path` — Node.js built-ins
