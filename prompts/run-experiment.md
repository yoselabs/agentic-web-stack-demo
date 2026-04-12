# Run Experiment: Template Stress Test

Read `HANDOVER.md` — it has full context. This is Round N of a template stress-test experiment.

The template repo (`agentic-eng/agentic-web-stack`) may have been updated with fixes from prior rounds. Pull those updates into `main`, then build the retro board feature from scratch using `REQUIREMENTS.md`. Measure everything — tokens, cost, time, issues — and compare against prior rounds.

Don't copy code from prior rounds. Let subagents build fresh. That's the whole point.

## Workflow

### Phase 1: Setup

1. Read `HANDOVER.md` and `REQUIREMENTS.md`
2. Read prior `EXPERIMENT*.yaml` files for baseline numbers
3. Pull template updates:
   ```bash
   git fetch template
   # If merge is clean:
   git merge template/main --allow-unrelated-histories
   # If merge is messy, reset main to template:
   git reset --hard template/main
   # Then restore experiment files from prior branches
   ```
4. Run `make setup && make check` — verify clean baseline
5. Create feature branch: `feat/retro-board-rN`
6. Record start time

### Phase 2: Planning

1. Load `@tanstack/intent` skills: `pnpm exec @tanstack/intent list` — read relevant SKILL.md files BEFORE writing the plan
2. Read all CLAUDE.md files in the project (they may have been updated)
3. Use `superpowers:writing-plans` to write a fresh plan (don't copy prior plans)
4. Save plan to `docs/superpowers/plans/YYYY-MM-DD-retro-board-rN.md`

### Phase 3: Execution

1. Use `superpowers:subagent-driven-development` to execute the plan
2. Model strategy: sonnet for implementation, sonnet for reviews, opus for orchestration
3. Batch independent tasks where possible (e.g., tRPC routers that share router.ts → one subagent)
4. After creating route files, regenerate the route tree (`make dev` briefly then kill)
5. Clean up temporary `as string` casts once all routes exist in the tree
6. Run `make check` after each task group
7. Run `make test` after all code is written — fix any BDD test issues

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
