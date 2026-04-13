# Run Experiment: Template Stress Test

Read `HANDOVER.md` — it has full context. This is Round N of a template stress-test experiment.

The template repo (`agentic-eng/agentic-web-stack`) may have been updated with fixes from prior rounds. Pull those updates into `main`, then build the retro board feature from scratch using `REQUIREMENTS.md`. Measure everything — tokens, cost, time, issues — and compare against prior rounds.

## What This Measures

The template (`agentic-eng/agentic-web-stack`) evolves between rounds with fixes from prior experiment findings. The feature built is always identical (retro board from `REQUIREMENTS.md`). The workflow is always identical. The only variable is the template itself. Comparing rounds reveals whether template improvements actually help AI agents succeed more easily — fewer errors, less debugging, lower cost.

## Inputs

The user provides these before starting:

```
Round: N
Setup status: <done or not — template merged, make setup, make check>
Start time: <ISO 8601>
```

Branch is always `feat/retro-board-rN`. If setup is not done, do Phase 1. If done, skip to Phase 2.

## Repo Structure

- `main` = template (`agentic-eng/agentic-web-stack`) + experiment scaffolding (HANDOVER, REQUIREMENTS, prompts/)
- `feat/retro-board-rN` = each round's implementation (one branch per round, never deleted)
- Remote `template` points to `agentic-eng/agentic-web-stack`
- Remote `origin` points to `agentic-eng/agentic-web-stack-demo`

Main stays in sync with the template. Scaffolding files (HANDOVER.md, REQUIREMENTS.md, prompts/) don't exist in the template, so merges are clean.

## Workflow

### Phase 1: Setup

1. Read `HANDOVER.md` and `REQUIREMENTS.md`
2. Read prior `EXPERIMENT*.yaml` files (on prior round branches) for baseline numbers
3. Pull template updates into main:
   ```bash
   git checkout main
   git fetch template
   git merge template/main
   # Scaffolding files don't conflict — they only exist in our repo
   # If somehow messy: git reset --hard template/main, then cherry-pick scaffolding commits
   ```
4. Push updated main: `git push origin main`
5. Run `make setup && make check` — verify clean baseline
6. Create feature branch: `git checkout -b feat/retro-board-rN`
7. Record start time

### Phase 2: Brainstorming & Design

Follow the full `superpowers:brainstorming` process:

1. Explore project context (read CLAUDE.md files, existing patterns, recent commits)
2. Ask clarifying questions (one at a time, multiple choice preferred)
3. Propose 2-3 approaches with trade-offs and recommendation
4. Present design section-by-section, get user approval after each
5. Write design doc to `docs/superpowers/specs/YYYY-MM-DD-retro-board-rN-design.md`, commit
6. Run spec self-review (placeholders, contradictions, ambiguity, scope)
7. Request code review on the spec via `superpowers:requesting-code-review`
8. Fix any issues found, get user sign-off on final spec

Write a design spec for the retro board feature from `REQUIREMENTS.md`. Sections:

1. Data model (Board, Card, Vote — enums, relations, cascades)
2. Services layer functions (signatures + behavior + return shapes)
3. tRPC router procedures (inputs + wiring)
4. Frontend hooks (queries, mutations, optimistic updates with explicit types)
5. Routes (3 pages, UI structure, HTML elements for BDD locator alignment)
6. BDD scenarios (8 from REQUIREMENTS.md)
7. Execution plan — 3 implementation tasks:
   - Task 1: Schema + Services + Routers (backend)
   - Task 2: Hooks + Routes + Navbar (frontend UI)
   - Task 3: BDD feature file + step definitions + tests

### Phase 4: Execution

Use `superpowers:subagent-driven-development` to execute the plan:

1. Create feature branch: `git checkout -b feat/retro-board-rN`
2. Fresh subagent per task (sonnet for implementation, opus for orchestration)
3. After each implementation task:
   - Dispatch spec compliance reviewer (verify code matches plan)
   - Dispatch code quality reviewer (verify code is well-built)
   - Fix any issues found before moving to next task
4. Orchestrator handles between-task work:
   - Route tree regeneration (`make dev` briefly then kill)
   - `as string` cast cleanup once all routes exist
   - `make check` after each task group
   - Badge/component installation if missing from template
5. After all tasks: run `make test`, fix BDD locator issues if needed
6. Use `superpowers:finishing-a-development-branch` for final review

### Phase 4: Measurement

Create `EXPERIMENT-RN.yaml` with:

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
```

Update HANDOVER.md completed rounds table with new row.
Commit.

## Phase 9: Reflection

Run `/reflect` with a signal capturing:
- Template gaps found this round
- What the template improvements fixed vs what's still broken
- Comparison trend (are rounds getting cheaper/faster or not?)

**Comparison metrics (vs prior rounds):**
- Were prior round issues fixed?
- Did subagents need fewer retries/corrections?
- New issues not seen before?
- Number of spec reviewer issues found
- Number of code quality reviewer issues found

Present to the user:
1. Completed rounds comparison table (from HANDOVER.md)
2. Key findings (3-5 bullets)
3. Template gaps found (with fix suggestions)
4. Trend assessment: is the template getting better? What's the next highest-value fix?

### Phase 5: Reflection

Run `/reflect` with observations about:
- Template friction points (what tripped up subagents)
- Tech quirks (type inference, locator issues, route tree regen)
- Suggestions for template improvements
- What went well and should be preserved

## Known Gotchas (from prior rounds)

- **Route tree regen:** No standalone CLI command. Must start `make dev` briefly, wait ~3-5s, kill it. Subagents struggle with this — orchestrator may need to do it manually.
- **Sequential route creation:** `Link to="/not-yet-created-route"` fails typecheck. Use `as string` cast temporarily, clean up after all routes exist and tree regenerates.
- **setQueryData types:** `(old: typeof previous) => ...` loses type inference when previous includes undefined. Define explicit types for the callback parameter.
- **Column-scoped BDD locators:** `page.locator("div", { has: heading })` matches nested divs. Use `page.locator("form", { has: input })` or placeholder-anchored locators.
- **Link-wrapped Button:** `<Link><Button>text</Button></Link>` — the button is clickable but navigation may not trigger. Use direct `page.goto()` in BDD or use `<Link>` with className.
- **Kill dev servers before tests:** `lsof -ti :3000,:3001,:3100,:3101 | xargs kill -9` before `make test`
