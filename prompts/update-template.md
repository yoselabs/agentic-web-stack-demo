# Update Template: Apply Experiment Findings

Read all `EXPERIMENT*.yaml` files in this repo, especially the latest one. Extract the "new issues" and "suggestions" sections. Apply fixes to the template repo.

## Context

- This repo (`agentic-web-stack-demo`) is a consumer of the template at `yoselabs/agentic-web-stack`
- The template remote is already configured: `git remote template`
- Template fixes should be applied on a branch in the template repo, then merged

## Workflow

### Phase 1: Gather findings

1. Read all `EXPERIMENT*.yaml` files — collect every issue, suggestion, and DX note
2. Read evolution signals: `~/Documents/Knowledge/Evolution/signals/2026-04-12-*` for detailed friction reports
3. Categorize findings:
   - **Template CLAUDE.md improvements** — missing guidance, unclear instructions
   - **Template code fixes** — missing commands, broken patterns
   - **New documentation** — common mistakes, patterns to document
   - **Structural changes** — new files, reorganization

### Phase 2: Clone and branch

```bash
cd ~/Workspaces
git clone https://github.com/yoselabs/agentic-web-stack.git agentic-web-stack-template-fixes
cd agentic-web-stack-template-fixes
git checkout -b fix/experiment-feedback-rN
```

### Phase 3: Apply fixes

For each finding, make the minimal change:

**CLAUDE.md updates** — add to the relevant area's CLAUDE.md:
- New entries in "Common Mistakes" tables
- New guidance sections
- Updated commands or workflows

**Code changes:**
- Add `make routes` command (Makefile + script) for standalone route tree generation
- Fix any patterns that caused subagent confusion

**Design specs** (if substantial):
- Write a spec in `docs/superpowers/specs/` for non-trivial changes
- Use `superpowers:writing-plans` for multi-file changes

### Phase 4: Verify

```bash
make setup && make check && make test
```

### Phase 5: Create PR

```bash
gh pr create --title "fix: apply experiment round N feedback" --body "..."
```

## Priority Order

Fix things that caused the most subagent friction first:
1. Route tree regeneration (add standalone command)
2. Missing CLAUDE.md guidance (common mistakes, patterns)
3. Template code improvements
4. Documentation polish

## What NOT to change

- Don't modify the feature code (retro board) — that's in the demo repo
- Don't change Better-Auth tables
- Don't change the core stack choices (tRPC, TanStack Router, etc.)
- Keep changes minimal and focused — each fix should be one commit
