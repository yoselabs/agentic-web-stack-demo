# Prep Experiment: Template Stress Test

This session ONLY prepares the experiment. You do NOT build the feature here.

## What you do

1. Read `HANDOVER.md` for context and prior round results
2. Pull template updates into main:
   ```bash
   git checkout main
   git fetch template
   git merge template/main
   git push origin main
   ```
3. Run `make setup && make check` — verify clean baseline
4. Review what changed in the template since last round:
   ```bash
   git log --oneline ORIG_HEAD..HEAD  # or compare against prior known commit
   ```
5. Summarize template changes (new CLAUDE.md guidance, new commands, fixes)
6. Check if `prompts/run-experiment.md` known gotchas are still relevant given template changes — update if any are now fixed
7. Update `HANDOVER.md` completed rounds table if needed
8. Commit and push any prompt/handover updates to main

## What you do NOT do

- Do NOT create a feature branch
- Do NOT write a plan
- Do NOT write any feature code
- Do NOT run subagents

## When done

Tell the user:

> Prep complete. Template updated, baseline clean. To run Round N:
>
> 1. Start a new Claude Code session
> 2. Paste the contents of `prompts/handover-next-round.md` (replace N with round number)
>
> The new session will build the feature from scratch with zero context from this prep session.
