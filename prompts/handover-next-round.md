Read HANDOVER.md — it has full context for this template stress-test experiment.

Determine your round number: list branches matching `feat/retro-board-r*`, find the highest N, yours is N+1.

The template repo (`yoselabs/agentic-web-stack`) may have been updated with fixes from prior round feedback. Pull those updates into main, then re-build the same retro board feature from scratch using REQUIREMENTS.md. Measure everything — tokens, cost, time, issues.

Read `prompts/run-experiment.md` for the full workflow and known gotchas from prior rounds. Revise it critically before following — some advice may be outdated if the template was updated. Use your own judgment.

## Mandatory: Full Superpowers Workflow

Follow the superpowers skill chain — every step is required:

1. **`superpowers:brainstorming`** — design spec with user approval
2. **`superpowers:requesting-code-review`** — review the spec
3. **`superpowers:writing-plans`** — implementation plan with complete code
4. **`superpowers:subagent-driven-development`** — execute with per-task spec + quality reviews
5. **`superpowers:finishing-a-development-branch`** — final review + integration

Do NOT skip brainstorming ("requirements are already defined" is not a reason to skip — approach changes need validation). Do NOT skip per-task reviews.

Don't copy code from prior rounds. Don't read prior round feature code. Let subagents build fresh. That's the whole point.

At the end, read `EXPERIMENT*.yaml` from ALL prior round branches and compare your results against them. Branch: `feat/retro-board-rN`. Write results to `EXPERIMENT-RN.yaml`. Run `/reflect` at the end.
