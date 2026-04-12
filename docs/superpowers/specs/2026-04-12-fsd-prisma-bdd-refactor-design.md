# FSD Enforcement + Prisma Schema Split + BDD Organization — Design Spec

## Summary

Refactor to enforce medium-scale patterns the template demonstrates: extract todo feature from route into FSD `features/todo/`, split Prisma schema into per-domain files, merge BDD feature files by domain area, and document all patterns so future work follows them.

## 1. Extract `features/todo/` from route file

The route at `apps/web/src/routes/_authenticated/todos.tsx` currently contains the `Todo` interface, `SortableTodoItem` component, completed todo rendering, and all business logic. Extract into FSD feature:

```
apps/web/src/features/todo/
  types.ts                 # Todo interface
  sortable-todo-item.tsx   # SortableTodoItem component (active, draggable)
  completed-todo-item.tsx  # Completed todo list item (static, muted)
```

The route file becomes a thin shell: DnD context setup, mutation hooks, form, layout, and composing the feature components. This follows the established FSD layer rules from `apps/web/CLAUDE.md`.

## 2. Split Prisma schema into per-domain files

Enable `prismaSchemaFolder` preview feature. Replace single `packages/db/prisma/schema.prisma` with:

```
packages/db/prisma/schema/
  base.prisma      # generator client + datasource config
  auth.prisma      # User, Session, Account, Verification (Better-Auth owned)
  todo.prisma      # Todo model (application owned)
```

Each domain gets its own file. New models go in the appropriate domain file, or a new file if they represent a new domain. The `base.prisma` file never contains models.

## 3. Merge BDD feature files by domain area

Move the reorder scenario from `e2e/features/todos-reorder.feature` into `e2e/features/todos.feature`. Delete the separate file. Delete `e2e/steps/todos-reorder.ts` and move its step definitions into `e2e/steps/todos.ts`.

Rule: feature files map to domain areas (auth, todos, navigation), not individual capabilities. All todo scenarios (CRUD, reorder, filtering, etc.) belong in `todos.feature`. Split into sub-files only when a feature exceeds ~15-20 scenarios.

## 4. Enforce patterns in documentation

### CLAUDE.md (root)

Add to existing rules: FSD layer rules are mandatory. New UI features must go in `features/<name>/`, not inline in routes.

### apps/web/CLAUDE.md

Already documents FSD layers. Add: "Routes must be thin shells. Extract components and business logic into `features/` or `widgets/`."

### packages/db/CLAUDE.md

Update to document multi-file schema: one `.prisma` file per domain. New models go in the appropriate domain file.

### e2e/CLAUDE.md

Add: "Feature files map to domain areas, not capabilities. One file per domain (auth, todos, navigation). Split at ~15-20 scenarios."

## Not In Scope

- Lint rules to enforce FSD imports (CLAUDE.md documentation is sufficient for agent-driven development)
- Extracting mutation hooks into a separate file (they're thin wrappers, route-level is fine)
- Splitting step definition files further (they map 1:1 to feature files)
