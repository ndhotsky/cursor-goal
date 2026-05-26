# Release 0.3.0

## GitHub release notes

````markdown
## Summary

- Native Codex `/goal` parity: default state now lives outside the workspace, so `cursor-goal` no longer creates workspace `.goal/` files by default.
- Added a native-vs-Cursor parity harness covering single-file, multi-file, fail-then-resume, already-complete, and fresh-process resume flows.
- `/goal resume` now preserves existing goal settings unless override flags are explicitly supplied.
- Documentation updated for install, smoke testing, parity, publishing, security, and issue reporting.

## Verification

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm pack --dry-run`
- `git diff --check`
- Current-source parity evidence: `.tmp/parity/2026-05-26T06-14-16-360Z/report.md`

## Install

```bash
npm install -g cursor-goal
cursor-goal-install-skill --global
```

Then in Cursor Agent chat:

```text
/goal <objective>
```
````

## X post draft

```text
Shipping cursor-goal 0.3.0:

Codex-style /goal loops in Cursor Agent chat, no @cursor/sdk, no API key, no telemetry.

This release moves state out of the workspace by default and adds a native Codex vs Cursor parity harness.

npm install -g cursor-goal
cursor-goal-install-skill --global
```
