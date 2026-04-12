# Run Experiment: Template Stress Test

Read `HANDOVER.md` — it has full context. This is Round N of a template stress-test experiment.

The template repo (`agentic-eng/agentic-web-stack`) may have been updated with fixes from prior rounds. Pull those updates into `main`, then build the retro board feature from scratch using `REQUIREMENTS.md`. Measure everything — tokens, cost, time, issues — and compare against prior rounds.

Don't copy code from prior rounds. Let subagents build fresh. That's the whole point.

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

Even though the requirements are identical across rounds, the brainstorming validates approach changes (batching strategy, model selection, etc.) and catches spec drift.

### Phase 3: Planning

1. Load `@tanstack/intent` skills if available: `pnpm exec @tanstack/intent list`
2. Read all CLAUDE.md files in the project (they may have been updated)
3. Use `superpowers:writing-plans` to write a fresh plan with **complete code in every step**
4. Save plan to `docs/superpowers/plans/YYYY-MM-DD-retro-board-rN.md`
5. Plan self-review: spec coverage, placeholder scan, type consistency
6. Get user approval before execution

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

**Core metrics:**
- Subagent dispatches (count, model, tokens, duration per dispatch)
- Total tokens (subagent + orchestrator estimate)
- Wall-clock duration
- Estimated cost (subagent + orchestrator)
- Commits, files changed, lines added
- Test results (make check, make test)
- Template gaps found

**Comparison metrics (vs prior rounds):**
- Were prior round issues fixed?
- Did subagents need fewer retries/corrections?
- New issues not seen before?
- Number of spec reviewer issues found
- Number of code quality reviewer issues found

**DX qualitative notes:**
- Did updated CLAUDE.md guidance help subagents?
- Which tasks were easier/harder?
- New friction points?

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
