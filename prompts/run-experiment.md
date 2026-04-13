# Run Experiment: Template Stress Test

Autonomous protocol. Read this top-to-bottom, execute each phase in order. Do not ask the user questions — all decisions are made by the agent. The user sees results at the end.

Don't copy code from prior rounds. Don't read prior round branches. Build fresh.

## Inputs

The user provides these before starting:

```
Round: N
Branch: feat/retro-board-rN
Experiment variable: <what's different this round — batching strategy, model selection, etc.>
Setup status: <done or not — template merged, make setup, make check>
Start time: <ISO 8601>
```

If setup is not done, do Phase 1. If done, skip to Phase 2.

## Repo Structure

- `main` = template + experiment scaffolding (HANDOVER, REQUIREMENTS, prompts/)
- `feat/retro-board-rN` = each round's implementation (one branch per round, never deleted)
- Remote `template` = upstream template repo
- Remote `origin` = experiment demo repo

## Phase 1: Setup (skip if user says done)

```bash
git checkout main
git fetch template
git merge template/main
git push origin main
make setup && make check  # must pass 13/13 + typecheck
git checkout -b feat/retro-board-rN
```

Record start time.

## Phase 2: Context Exploration

Dispatch an Explore subagent to read ALL CLAUDE.md files, Makefile, existing patterns (services, routers, hooks, routes, BDD steps), and current Prisma schema. This builds the context needed for design and planning.

Record: exploration subagent tokens + duration.

## Phase 3: Design

Write a design spec. The feature is always the same (retro board from `REQUIREMENTS.md`), so the design focuses on:

1. How the experiment variable changes the approach
2. Data model (copy from REQUIREMENTS.md — Board, Card, Vote)
3. Services layer functions (signatures + behavior)
4. tRPC router procedures (inputs + wiring)
5. Frontend hooks (queries, mutations, optimistic updates)
6. Routes (3 pages, UI structure, HTML elements for BDD locator alignment)
7. BDD scenarios (8 from REQUIREMENTS.md)
8. Execution plan (task decomposition based on experiment variable)

**Decision point — batching strategy:** Choose based on the experiment variable. Prior rounds:
- R1: 10 tasks, R2: 7, R3: 4, R4: 3, R5: 2
- Sweet spot appears to be 3 tasks. Deviate only if the experiment variable demands it.

Save to: `docs/superpowers/specs/YYYY-MM-DD-retro-board-rN-design.md`
Commit.

## Phase 4: Design Review

Dispatch `superpowers:code-reviewer` subagent on the design spec. Brief it:
- Check against REQUIREMENTS.md for completeness
- Check internal consistency (service signatures match router usage, return shapes match frontend types)
- Check for gaps that would trip up implementation subagents

Fix all issues found. Commit fixes.

Record: review subagent tokens + duration + issues found.

## Phase 5: Implementation Plan

Read all CLAUDE.md files (they may have changed since Phase 2). Write a complete implementation plan following `superpowers:writing-plans`:

- Every step has complete code (no placeholders)
- Exact file paths
- Exact commands with expected output
- Task decomposition matches the design's execution plan

**Critical plan requirements:**
- Services accept `DbClient = PrismaClient | Prisma.TransactionClient`
- Routers own transaction boundaries (`$transaction`)
- Hooks receive `trpc: TRPCOptionsProxy<AppRouter>` and `queryClient: QueryClient`
- Optimistic updates use explicit types for `setQueryData` callbacks (tRPC inference breaks)
- BDD step definitions use section-scoped semantic locators
- `make routes` for route tree regeneration (NOT `make dev` + kill)
- Export any Prisma enum types used in services from `packages/db/src/index.ts`

Save to: `docs/superpowers/plans/YYYY-MM-DD-retro-board-rN.md`
Commit.

## Phase 6: Plan Review

Dispatch `superpowers:code-reviewer` subagent on the plan. Brief it:
- Verify plan covers all spec requirements
- Verify no placeholders or incomplete code
- Verify type consistency across tasks (function names, type names, prop interfaces)
- Verify plan includes Prisma enum exports, `make routes`, `bddgen`

Fix all issues found. Commit fixes.

Record: review subagent tokens + duration + issues found.

## Phase 7: Execution

Use `superpowers:subagent-driven-development`:

For each implementation task:

1. **Dispatch implementer** (sonnet model) with full task text + context
2. **Dispatch spec compliance reviewer** — verify code matches plan
3. **Dispatch code quality reviewer** (`superpowers:code-reviewer`) — verify code quality
4. **Orchestrator fixes** any issues found by reviewers
5. **Verify:** `make check` (13/13 + `tsc -b` must BOTH pass — agent-harness alone is not sufficient)

Between tasks, orchestrator handles:
- `make routes` if route files were created
- `as string` cast cleanup once all routes exist
- `make db-push` if schema changed
- Component installation (`pnpm dlx shadcn@latest add badge`)
- Port cleanup before tests: `lsof -ti :3000,:3001,:3100,:3101 | xargs kill -9 2>/dev/null`

After all tasks:
- Run `make test` — all BDD scenarios must pass
- If tests fail, debug and fix (dispatch fix subagent if needed)
- Dispatch final `superpowers:code-reviewer` on entire implementation

Record per subagent: model, tokens, duration, status, issues found.

## Phase 8: Experiment Report

Create `EXPERIMENT-RN.yaml` with this exact schema:

```yaml
round: N
branch: feat/retro-board-rN
date: "YYYY-MM-DD"
start_time: "ISO 8601"
end_time: "ISO 8601"
wall_clock_minutes: N

experiment_variable: "description of what's different this round"

subagent_dispatches:
  total: N
  implementation: N
  spec_review: N
  code_quality_review: N
  exploration: N
  details:
    - name: "descriptive name"
      type: exploration|implementation|spec_review|code_quality_review
      model: opus|sonnet|haiku
      tokens: N
      duration_seconds: N
      status: done|pass|issues_found|blocked
      issues: []  # list of strings, omit if empty
      notes: ""   # omit if empty

tokens:
  subagent_total: N
  orchestrator_estimate: N
  total_estimate: N

estimated_cost:
  subagent_low: N
  subagent_high: N
  orchestrator_low: N
  orchestrator_high: N
  total_low: N
  total_high: N

results:
  make_check: "13/13 + typecheck clean"
  make_test: "N/N (breakdown)"
  commits: N
  files_changed_code: N
  lines_added_code: N
  template_gaps: N

template_gaps:
  - name: "short name"
    severity: low|medium|high
    description: "what happened"
    fix: "how to fix"

orchestrator_fixes:
  - description: "what was fixed"
    category: template_gap|typecheck|code_quality|test_fix
    tokens_cost: minimal|moderate|significant

comparison_vs_prior_rounds:
  metrics:
    # R1, R2, ..., RN
    impl_dispatches: [N, ...]
    total_dispatches: [N, ...]
    subagent_tokens: [N, ...]
    wall_time_min: [N, ...]
    bdd_tests: [N, ...]
    cost_low: [N, ...]
    cost_high: [N, ...]
  prior_round_issues_status:
    - issue: "name"
      status: resolved|open|wontfix
      notes: ""
  new_issues:
    - issue: "name"
      severity: low|medium|high
      notes: ""

dx_notes:
  what_helped: []
  what_was_harder: []
  template_improvement_suggestions: []
  batching_strategy_assessment: "paragraph"
```

Update HANDOVER.md completed rounds table with new row.
Commit.

## Phase 9: Reflection

Run `/reflect` with a signal capturing:
- The batching strategy outcome (was the experiment variable worth testing?)
- Template gaps found
- Key decision and its rationale

## Phase 10: Report to User

Present to the user:
1. Completed rounds comparison table (from HANDOVER.md)
2. Key findings (3-5 bullets)
3. Template gaps found
4. Recommendation for next round's experiment variable

This is the ONLY point where the user is engaged. Everything before this is autonomous.

## Known Patterns (from 5 rounds)

These are proven solutions. Don't reinvent them:

- `make routes` for route tree regeneration (not dev server dance)
- `as string` cast for Link to not-yet-created routes, remove after `make routes`
- Explicit `CardItem`/`BoardCard` types for `setQueryData` callbacks
- `waitFor({ state: "detached" })` for optimistic delete assertions (not `not.toBeVisible`)
- Section-scoped BDD locators: `page.locator("section", { has: heading })`
- `signUpOrSignIn` helper for BDD auth steps
- Export Prisma enum types from `packages/db/src/index.ts`
- `<Button asChild><Link>` pattern (not `<Link><Button>`)
- Unique email per BDD scenario
- `pnpm exec bddgen` from `e2e/` directory (not root)
- Agent-harness lint may pass while `tsc -b` fails — always verify both
