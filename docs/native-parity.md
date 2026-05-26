# Native Codex `/goal` parity

This repository tracks parity against the native interactive Codex `/goal` command, not `codex exec "/goal ..."`.

## Harness

Run the parity harness from a source checkout repo root:

```bash
npm run parity -- --runs 2
```

Useful narrower runs:

```bash
npm run parity -- --scenario single-file --runs 1
npm run parity -- --provider native --scenario single-file --runs 1
npm run parity -- --provider cursor --scenario single-file --runs 1
```

The harness writes generated evidence under `.tmp/parity/<timestamp>/`:

- `report.md` - concise native-vs-Cursor comparison table plus raw JSON.
- `results.json` - machine-readable normalized observations.
- `transcripts/*.log` - native Codex TUI and Cursor `agent --print` transcripts.
- `workspaces/*` - isolated workspaces used for each run.

Native runs use a Python stdlib PTY driver around:

```bash
codex --no-alt-screen --dangerously-bypass-approvals-and-sandbox -C <workspace> -m gpt-5.5
```

The driver accepts the trust prompt when present and submits `/goal ...` inside the interactive TUI. Cursor runs use:

```bash
agent --print --trust --force --sandbox disabled --workspace <workspace> --model composer-2.5 "/goal ..."
```

For Cursor, the harness copies this repo's project skill into the isolated workspace and prepends a temporary `cursor-goal` wrapper to `PATH`, so it exercises the current source tree rather than a globally installed package.

## Scenarios

The harness currently defines:

1. `single-file` - create one file with exact content and verify it.
2. `multi-file` - create multiple exact-content files and verify all of them.
3. `fail-then-resume` - leave a failing checkpoint, then continue via `/goal resume`.
4. `already-complete` - verify an already-correct workspace without changing the target file.
5. `fresh-process-resume` - resume steady state from a fresh process.

For native Codex, `fresh-process-resume` exits the first TUI after an intermediate checkpoint, captures the `codex resume <id>` handoff when available, starts a new Codex process with `codex resume`, and submits `/goal resume` there.

The native PTY driver uses bracketed paste when submitting slash commands. This avoids an intermittent TUI race where `/goal` could be interpreted before the objective text was inserted.

## Contract Surface

The comparison intentionally ignores ordinary model prose and focuses on durable/operator-visible behavior:

- objective accepted by `/goal`;
- verification command identified and executed;
- lifecycle status visible to the operator;
- completion/blocking behavior;
- checkpoint/turn count where the runner exposes it;
- validation result records;
- run log behavior;
- handoff/resume behavior;
- workspace state, including `.goal` presence or absence.

## Current Observation

The latest full evidence run for the current `0.3.0` source tree was:

```bash
npm run parity -- --runs 1
```

Report:

```text
.tmp/parity/2026-05-26T06-14-16-360Z/report.md
```

That run covered all five scenarios once for both providers against the current source tree. Every native-vs-Cursor pair completed with passing verification, correct artifacts, no workspace `.goal`, zero exit status, and no diff in the normalized comparison table.

| Scenario | Run | Native status | Native verify | Native `.goal` | Cursor status | Cursor verify | Cursor `.goal` | Cursor state | Diff |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| already-complete | 1 | complete | yes | no | complete | yes | no | yes | none |
| fail-then-resume | 1 | complete | yes | no | complete | yes | no | yes | none |
| fresh-process-resume | 1 | complete | yes | no | complete | yes | no | yes | none |
| multi-file | 1 | complete | yes | no | complete | yes | no | yes | none |
| single-file | 1 | complete | yes | no | complete | yes | no | yes | none |

| Surface | Native Codex | Cursor goal |
| --- | --- | --- |
| Final status | `complete` | `complete` |
| Verification | passed | passed |
| Target artifact | correct | correct |
| Workspace `.goal` | absent | absent by default; present only with legacy `--state-dir .goal` or `CURSOR_GOAL_STATE_SCOPE=workspace` |
| Fresh-process resume | `codex resume` handoff | external durable state plus `/goal resume` |

Cursor still keeps durable CLI bookkeeping outside the workspace under the user state directory. This is a compatibility adapter: native Codex keeps goal state in the Codex session, while `cursor-goal` needs local checkpoint and validation records for the Cursor skill loop.
