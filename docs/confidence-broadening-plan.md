# Confidence Broadening Plan

Use this in a fresh context after the `0.3.0` native-parity release work is merged or nearly ready.

## Current baseline

- Current-source parity evidence: `.tmp/parity/2026-05-26T06-14-16-360Z/report.md`.
- Current matrix: five scenarios, one run, native Codex `gpt-5.5`, Cursor `composer-2.5`.
- Current result: every normalized native-vs-Cursor pair completed with passing verification, correct artifacts, no workspace `.goal`, zero exit status, and no diff.
- Prior broader repetition evidence: `.tmp/parity/2026-05-25T20-15-47-610Z/report.md` covered the same five scenarios twice for both providers.

## Goal

Broaden confidence that `cursor-goal` matches the native Codex `/goal` operator contract across install, resume, state, verification, and release-package surfaces without adding dependencies, telemetry, or SDK-based agent execution.

## Plan

1. Expand the parity matrix.
   - Add scenarios for pause/resume/clear, edit-after-start, budget-limited goals, verification rejection of premature completion, missing verification command, and legacy `--state-dir .goal`.
   - Run each scenario at least three times for native and Cursor.
   - Keep transcripts and normalized summaries under `.tmp/parity/<timestamp>/`.

2. Prove install and packaging behavior.
   - Run `npm pack --dry-run`.
   - Install the packed tarball into a temp prefix.
   - Verify `cursor-goal`, `cgoal`, and `cursor-goal-install-skill` resolve from the packed artifact.
   - Confirm the packed skill no longer references workspace `.goal` as the default state surface.

3. Exercise state compatibility.
   - Verify default state resolves to `$XDG_STATE_HOME/cursor-goal/...` or `~/.local/state/cursor-goal/...`.
   - Verify `CURSOR_GOAL_STATE_DIR` overrides the default.
   - Verify `CURSOR_GOAL_STATE_SCOPE=workspace` and `--state-dir .goal` preserve legacy workspace-local behavior.
   - Verify `resume` preserves model, tier, timeout, destructive flag, and max-turn settings unless flags are explicit.

4. Harden verification safety checks.
   - Re-run destructive-command rejection tests.
   - Add at least one live CLI smoke that attempts an unsafe verification command without `--allow-destructive` and confirms fail-closed behavior.
   - Confirm no secrets or environment dumps appear in run logs.

5. Validate release surfaces.
   - Run `npm run typecheck`, `npm test`, `npm run build`, `npm pack --dry-run`, and `git diff --check`.
   - Review README, install, publishing, native-parity, smoke-test, security, and issue-template docs for stale `.goal` claims.
   - Verify `package.json` and `package-lock.json` versions match.

6. Publish-readiness review.
   - Draft GitHub release notes from `CHANGELOG.md`.
   - Draft one short X post focused on native Codex `/goal` parity and no SDK/API-key requirement.
   - Confirm generated artifacts remain ignored and unstaged.

## Paste-ready `/goal` for the next context

```text
/goal In /Users/nikolaymohr/cursor-goal-source/cursor-goal, broaden confidence for the cursor-goal 0.3.0 native-parity release by executing docs/confidence-broadening-plan.md end to end. Preserve AGENTS.md rules: keep dependencies minimal, no @cursor/sdk, no telemetry, no secret logging, verification is source of truth, generated files stay out of source, and prefer small testable modules. Start by reading AGENTS.md, docs/native-parity.md, docs/publishing.md, CHANGELOG.md, and docs/confidence-broadening-plan.md. Do not stop after the first green suite; after the last fix, rerun npm run typecheck, npm test, npm run build, npm pack --dry-run, and git diff --check. Report exact evidence paths and any remaining parity gaps.
```
