# Template Feedback Fixes — Design Spec

## Summary

Address 9 issues: 6 from real-world testing (Team Retrospective Board project) + 3 from code review. Mix of structural improvements, bug fixes, and documentation updates.

## 1. Split tRPC router into `routers/` directory

Move the todo sub-router from inline in `packages/api/src/router.ts` into `packages/api/src/routers/todo.ts`. Create `packages/api/src/routers/index.ts` that merges sub-routers. Update `router.ts` to import from `routers/`.

This demonstrates the pattern for scaling to multiple sub-routers. In `packages/api/CLAUDE.md`:
- **Replace** the existing inline sub-router example with the new `routers/` convention
- Update the "File Structure" section to list `src/routers/` instead of showing all routes inline in `router.ts`
- Add a "Adding a new router" section showing the pattern

## 2. Test servers on separate ports

Use ports 3100 (web) / 3101 (server) for BDD tests, so dev and test never collide.

Changes needed:
- `playwright.config.ts` — webServer commands pass port env vars: `--port 3101` for server, `--port 3100` for web
- `playwright.config.ts` — webServer `port` config set to 3100/3101, `baseURL` to `http://localhost:3100`
- `playwright.config.ts` — server env `BETTER_AUTH_URL` → `http://localhost:3101`, `CORS_ORIGIN` → `http://localhost:3100`
- `e2e/steps/auth.ts` — fix hardcoded `http://localhost:3000` URLs (lines ~120, ~125). Replace with relative URL patterns: `toHaveURL(/^\/$/)` and `waitForURL(/\/(login)?$/)` instead of embedding the port
- `e2e/CLAUDE.md` — update test infrastructure section to document separate test ports (3100/3101 vs dev 3000/3001)

## 3. Route tree regeneration docs

The existing apps/web/CLAUDE.md already says "The route tree regenerates automatically on `vite dev`." Add the offline-editing nuance only: "After adding/removing route files without the dev server running, start `make dev` to trigger regeneration. There is no standalone generation command."

## 4. Incremental Link type cast pattern

Add to root CLAUDE.md Common Mistakes table:

| `Link to` rejects not-yet-created routes | TanStack Router types routes from `routeTree.gen.ts` | Use `to={"/path" as string}` temporarily, remove once route files exist and `make dev` regenerates the tree |

## 5. Optimistic update reference

The DnD reorder handler in `apps/web/src/routes/_authenticated/todos.tsx` demonstrates the `queryClient.setQueryData` optimistic pattern. Add a reference in apps/web/CLAUDE.md under "Using tRPC Data":

```
For optimistic updates (instant UI feedback before server confirms), see the drag-and-drop
reorder handler in `src/routes/_authenticated/todos.tsx` — it uses `queryClient.setQueryData`
to update the cache immediately, with `onError` invalidation as fallback.
```

## 6. JSX `//` lint gotcha

Add to root CLAUDE.md Common Mistakes table with concrete example:

| `//` in JSX text content | Biome `noCommentText` flags it as a comment | Wrap in expression: `<p>{"https://example.com"}</p>` instead of `<p>https://example.com</p>` |

## 7. Add Vitest integration tests to CI pipeline

The CI workflow (`.github/workflows/ci.yml`) runs lint, typecheck, and BDD tests but skips the Vitest integration tests. Add `pnpm --filter @project/api test` to the `test` job before the BDD tests. The Postgres service is already available.

## 8. Replace `waitForTimeout(400)` with proper sheet waiter

`e2e/steps/mobile-nav.ts:9` and `e2e/steps/auth.ts:~142` use `waitForTimeout(400)` to wait for the Sheet animation. Replace with:
```typescript
await page.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 3000 });
```
More reliable on slow CI runners, no wasted time on fast machines.

## 9. Make seed script idempotent

`scripts/seed.ts` fails on second run because `demo@example.com` already exists. Check if the user exists first — if so, log "Already seeded, skipping" and exit 0. This makes `make db-seed` safely re-runnable.
