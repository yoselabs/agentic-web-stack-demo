# Experiment Handover: Round 2

## Context

Round 1 of the agentic-web-stack stress test is complete. A Team Retrospective Board was built on top of the template. All results are on the `feat/retro-board` branch. The template (`yoselabs/agentic-web-stack`) has since been updated to address feedback from Round 1.

## Your Mission

Re-run the same experiment on the updated template. Build the exact same feature (retro board) using the same requirements, then compare results against Round 1.

## Setup

```bash
cd ~/Workspaces/agentic-web-stack-demo
git checkout main

# Pull updated template
git fetch template
git merge template/main --allow-unrelated-histories
# Resolve any conflicts (template main replaces our initial commit)

# Or if merge is messy, reset main to template:
# git reset --hard template/main

make setup
make check  # verify clean baseline
```

## Requirements

Use `REQUIREMENTS.md` in this repo — it has the full feature spec. Key points:

- **3 Prisma models:** Board, Card, Vote (with relations, cascades, @@unique)
- **7 tRPC procedures:** board.list/create/get/close, card.create/delete, vote.toggle
- **3 routes:** /boards, /boards/new, /boards/$boardId
- **Optimistic updates** on card create, card delete, vote toggle
- **8 BDD scenarios** covering CRUD, voting, close, user isolation, direct URL access
- **Auth-gated everything**, NOT_FOUND error pattern for authorization

Full design spec: `docs/superpowers/specs/2026-04-12-retro-board-design.md` (on `feat/retro-board` branch)

## What to Measure

Create a new `EXPERIMENT-R2.yaml` with:

### Same metrics as Round 1
- Subagent dispatches (count)
- Total tokens (per subagent + orchestrator estimate)
- Wall-clock duration per subagent
- Total estimated cost
- Commits, files changed, lines added
- Test results (make check, make test)
- Template gaps found

### Comparison metrics (Round 2 vs Round 1)
- Were any Round 1 issues fixed? (stale dev server warning, route tree docs, routers/ convention, etc.)
- Did subagents need fewer retries/corrections?
- Were there new issues not seen in Round 1?
- Time to first passing `make check` after each task
- Number of spec reviewer issues found
- Number of code quality reviewer issues found

### DX / AI-experience qualitative notes
- Did the updated CLAUDE.md guidance help subagents land correctly?
- Which tasks were easier/harder than Round 1?
- Any new friction points?

## Round 1 Baseline (from EXPERIMENT.yaml)

| Metric | Round 1 |
|--------|---------|
| Subagent dispatches | 12 |
| Subagent total tokens | ~317K |
| Subagent wall time | ~22 min |
| Estimated total cost | ~$15-23 |
| Files changed | 14 |
| Lines added | 2,304 |
| BDD tests | 18/18 |
| Quality gates | 13/13 |
| Template gaps | 0 |

### Round 1 issues that should be fixed in updated template
1. **Stale dev server warning** — `e2e/CLAUDE.md` should warn to kill `make dev` before `make test`
2. **Route tree regeneration docs** — `apps/web/CLAUDE.md` should clarify `npx tsr generate`
3. **Sub-router directory convention** — `packages/api/CLAUDE.md` should mention `routers/` dir pattern
4. **Incremental Link type cast pattern** — note about `as string` casts for not-yet-created routes
5. **Optimistic update example** — reference pattern in `apps/web/CLAUDE.md`
6. **JSX `//` lint gotcha** — note about `noCommentText` rule

## Workflow — Full Superpowers Process

Follow the superpowers skill chain exactly. Each step is mandatory:

1. **`superpowers:brainstorming`** — Explore context, ask clarifying questions, propose 2-3 approaches, present design, write spec doc, get spec review + user approval
2. **`superpowers:requesting-code-review`** — Review the spec before planning
3. **`superpowers:writing-plans`** — Write a fresh plan with complete code in every step (don't copy prior plans — the template may have changed)
4. **`superpowers:subagent-driven-development`** — Execute plan: fresh subagent per task, spec compliance review after each, code quality review after each
5. **`superpowers:finishing-a-development-branch`** — Final review, decide integration strategy
6. Compare results against all prior rounds

## Branch Strategy

- Work on a new branch: `feat/retro-board-r2`
- Keep `feat/retro-board` (Round 1) intact for comparison
- `main` should be the updated template baseline

## Files on feat/retro-board for Reference

```
EXPERIMENT.yaml                          — Round 1 metrics
REQUIREMENTS.md                          — Feature requirements (USE THIS)
docs/superpowers/specs/2026-04-12-*      — Design spec
docs/superpowers/plans/2026-04-12-*      — Implementation plan
apps/web/src/routes/_authenticated/boards/ — UI (3 pages)
packages/api/src/routers/                — tRPC routers (3 files)
packages/db/prisma/schema.prisma         — Schema with Board/Card/Vote
e2e/features/boards.feature              — BDD scenarios
e2e/steps/boards.ts                      — Step definitions
```

Do NOT copy code from prior rounds. Let the subagents build fresh — that's the point of the comparison.

## Reusable Prompts

- `prompts/run-experiment.md` — Full experiment workflow. Paste into a new session to run the next round.
- `prompts/update-template.md` — Apply experiment findings back to the template repo.

## Completed Rounds

| Round | Branch | Tests | Impl Dispatches | Total Dispatches | Tokens | Cost | Wall Time |
|-------|--------|-------|-----------------|------------------|--------|------|-----------|
| 1 | `feat/retro-board` | 18/18 | 10 | 12 | ~317K | ~$15-23 | 22 min |
| 2 | `feat/retro-board-r2` | 41/41 | 7 | 8 | ~182K | ~$11-17 | 10 min |
| 3 | `feat/retro-board-r3` | 41/41 | 4 | 9 | ~236K | ~$14-21 | 8 min |
| 4 | `feat/retro-board-r4` | 41/41 | 3 | 8 | ~301K | ~$14-21 | 8 min |
