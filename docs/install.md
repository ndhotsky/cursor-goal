# Install

`cursor-goal` has three parts:

1. **CLI** (`cursor-goal` / `cgoal`) — local state, verification, checkpoints
2. **Cursor skill** — enables `/goal` in Agent chat
3. **Stop hook** (recommended for hard enforcement) — blocks agent stop until verification passes

Parts 1 and 2 are required for the basic experience. Part 3 adds harness-level enforcement in **local Cursor Agent chat** (stop hooks are not wired in Cloud Agents today).

## Quick start

Clone this repo, build, link the CLI, and install the skill + stop hook globally:

```bash
git clone https://github.com/ndhotsky/cursor-goal.git
cd cursor-goal
npm install
npm run build
npm link
npm run install-skill:global
npm run install-hook:global
```

Confirm:

```bash
cursor-goal --version
test -f dist/index.js
test -f ~/.cursor/skills/goal/SKILL.md
test -f ~/.cursor/hooks.json
```

In any project workspace, open **local** Cursor Agent chat and run:

```text
/goal <your objective>
```

## Project-local install

Skill and hook under the current directory instead of `~/.cursor/`:

```bash
npm run build
npm run install-skill
npm run install-hook
```

Run `npm link` from the clone first so `cursor-goal` and the install scripts are on PATH. Source installs must be built because the hook wrapper executes `dist/index.js`.

## Hook install options

| Method | Command | Installs to |
|--------|---------|-------------|
| Global (all workspaces) | `cursor-goal-install-hook --global` | `~/.cursor/hooks.json` |
| Project | `cursor-goal-install-hook` | `./.cursor/hooks.json` |
| From clone | `npm run install-hook:global` | same as global |

The installer merges into an existing `hooks.json` when present: it prepends the cursor-goal `stop` entry and removes prior `evaluate-goal` entries. Other hooks are preserved. The installed entry uses `type: "command"`, `loop_limit: null`, and `timeout: 120`.

Global installs write an absolute command path. Project installs write a project-root-relative command only when `scripts/evaluate-goal.sh` is inside that project root; otherwise the absolute path remains.

**Local IDE only:** Cursor `stop` hooks run in local Agent chat, not in Cloud Agent VMs. Cloud sessions still get skill + CLI behavior, but without the hard stop gate.

Link goals to chats when setting or resuming:

```bash
cursor-goal "Fix auth tests" --verify "npm test" \
  --conversation-id "<cursor-chat-id>" \
  --workspace-root "$PWD"
```

Pass the active Cursor chat id. `CURSOR_CONVERSATION_ID` may be available in some hook/agent environments; if it is not, pass or link the active chat id explicitly. When `--conversation-id` is omitted or does not match the active chat, the stop hook no-ops (`{}`) because it cannot find linked state.

## Skill install options

| Method | Command | Installs to |
|--------|---------|-------------|
| Global (all workspaces) | `cursor-goal-install-skill --global` | `~/.cursor/skills/goal/` |
| Project | `cursor-goal-install-skill` | `./.cursor/skills/goal/` |
| From clone | `npm run install-skill:global` | same as global |

Manual copy from a clone:

```bash
git clone https://github.com/ndhotsky/cursor-goal.git
mkdir -p ~/.cursor/skills
rm -rf ~/.cursor/skills/goal
cp -R cursor-goal/.cursor/skills/goal ~/.cursor/skills/goal
```

## Requirements

- **Node.js 22+** — for the CLI
- **Cursor Agent chat** — the agent loop runs in chat on your subscription

Optional env (see `.env.example`):

```bash
export CURSOR_GOAL_MODEL=composer-2.5
export CURSOR_GOAL_STATE_DIR=/path/to/state
```

`CURSOR_GOAL_MODEL` is recorded in newly created goal state for audit only; the model you select in Cursor chat is what runs.

State is stored outside the workspace by default:

```text
~/.local/state/cursor-goal/workspaces/<workspace-hash>/
~/.local/state/cursor-goal/conversations/     # stop hook chat index
```

If `XDG_STATE_HOME` is set, that path is used instead of `~/.local/state`. For legacy workspace-local state, run commands with `--state-dir .goal` or set:

```bash
export CURSOR_GOAL_STATE_SCOPE=workspace
```

Stop-hook run logs record safe provenance only: `conversation_id`, `generation_id`, and whether a transcript path was present (with `$HOME` redacted). The hook never reads transcript contents, but treat paths as potentially sensitive when sharing logs.

## Uninstall

```bash
npm unlink -g cursor-goal    # if you used npm link
rm -rf ~/.cursor/skills/goal
```

Remove the stop hook entry from `~/.cursor/hooks.json`, or delete the file if cursor-goal was the only consumer.

Remove per-project skill/hook files with `rm -rf .cursor/skills/goal` and edit `.cursor/hooks.json` if you installed locally.

## Troubleshooting

**`/goal` does nothing or is unknown**

- Install the skill: `npm run install-skill:global` from your clone (or `cursor-goal-install-skill --global` after `npm link`)
- Restart Cursor or open a new Agent chat
- Confirm `~/.cursor/skills/goal/SKILL.md` exists

**`cursor-goal: command not found`**

- From the clone: `npm run build && npm link`
- Confirm the build output exists: `test -f dist/index.js`
- Confirm `which cursor-goal` resolves to your linked binary

**`cursor-goal-install-skill` or `cursor-goal-install-hook` cannot find package files**

- Run from a built clone (`npm run build`)
- Re-link: `npm link` from the repo root

**Skill works but checkpoints fail**

- Run `cursor-goal` from the project root so it resolves the same workspace state
- Pass `--verify` with a safe, repo-specific command when setting the goal

**Stop hook keeps looping or never completes**

- Confirm the goal was set with `--conversation-id` matching the active chat
- Run verification manually: `cursor-goal` should show the configured command
- Check `~/.cursor/hooks.json` points at `evaluate-goal.sh` from your built clone or linked package
- Remember: stop hooks do not run in Cloud Agents — test in local Agent chat

For a full manual stop-hook acceptance script, see [Smoke verification](smoke-test.md#stop-hook-manual-test-local-ide).
