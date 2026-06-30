# Install

`cursor-goal` has three parts:

1. **CLI** (`cursor-goal` / `cgoal`) — local state, verification, checkpoints
2. **Cursor skill** — enables `/goal` in Agent chat
3. **Stop hook** (optional, recommended for hard enforcement) — blocks agent stop until verification passes

Parts 1 and 2 are required for the basic experience. Part 3 adds harness-level enforcement in **local Cursor Agent chat** (stop hooks are not wired in Cloud Agents today).

## Quick start (npm, recommended)

```bash
npm install -g cursor-goal
cursor-goal-install-skill --global
cursor-goal-install-hook --global
```

Confirm:

```bash
cursor-goal --version
ls ~/.cursor/skills/goal/SKILL.md
node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.HOME+"/.cursor/hooks.json","utf8")).hooks.stop[0].command)'
```

In any project workspace, open Cursor Agent chat and run:

```text
/goal <your objective>
```

## From source (contributors)

```bash
git clone https://github.com/Niko96-dotcom/cursor-goal.git
cd cursor-goal
npm install
npm run build
npm link
npm run install-skill:global
npm run install-hook:global
```

Project-local skill only (this repo):

```bash
npm run install-skill
```

## Hook install options

| Method | Command | Installs to |
|--------|---------|-------------|
| Global (all workspaces) | `cursor-goal-install-hook --global` | `~/.cursor/hooks.json` |
| Project | `cursor-goal-install-hook` | `./.cursor/hooks.json` |
| From clone | `npm run install-hook:global` | same as global |

The installer merges into an existing `hooks.json` when present: it prepends the cursor-goal `stop` entry (with `loop_limit: null`) and removes prior `evaluate-goal` entries. Other hooks are preserved.

**Local IDE only:** Cursor `stop` hooks run in local Agent chat, not in Cloud Agent VMs. Cloud sessions still get skill + CLI behavior, but without the hard stop gate.

Link goals to chats when setting or resuming:

```bash
cursor-goal "Fix auth tests" --verify "npm test" \
  --conversation-id "<cursor-chat-id>" \
  --workspace-root "$PWD"
```

When `--conversation-id` is omitted, the stop hook no-ops (`{}`) because it cannot find linked state.

## Skill install options

| Method | Command | Installs to |
|--------|---------|-------------|
| Global (all workspaces) | `cursor-goal-install-skill --global` | `~/.cursor/skills/goal/` |
| Project | `cursor-goal-install-skill` | `./.cursor/skills/goal/` |
| From clone | `npm run install-skill:global` | same as global |
| Manual copy | see below | your choice |

Manual copy after a global npm install:

```bash
PKG="$(npm root -g)/cursor-goal"
mkdir -p ~/.cursor/skills
rm -rf ~/.cursor/skills/goal
cp -R "$PKG/.cursor/skills/goal" ~/.cursor/skills/goal
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

State is stored outside the workspace by default for native Codex parity:

```text
$XDG_STATE_HOME/cursor-goal/workspaces/<workspace-hash>/
```

If `XDG_STATE_HOME` is unset, `~/.local/state` is used. For legacy workspace-local state, run commands with `--state-dir .goal` or set:

```bash
export CURSOR_GOAL_STATE_SCOPE=workspace
```

## Uninstall

```bash
npm uninstall -g cursor-goal
rm -rf ~/.cursor/skills/goal
```

Remove the stop hook entry from `~/.cursor/hooks.json`, or delete the file if cursor-goal was the only consumer.

Remove per-project skill/hook files with `rm -rf .cursor/skills/goal` and edit `.cursor/hooks.json` if you installed locally.

## Troubleshooting

**`/goal` does nothing or is unknown**

- Install the skill: `cursor-goal-install-skill --global`
- Restart Cursor or open a new Agent chat
- Confirm `~/.cursor/skills/goal/SKILL.md` exists

**`cursor-goal: command not found`**

- Reinstall: `npm install -g cursor-goal`
- Check PATH includes your global npm bin directory (`npm bin -g`)

**`cursor-goal-install-skill: cd: .../.cursor/skills/goal: No such file`**

- You likely have `0.2.2` or older; upgrade: `npm install -g cursor-goal@latest`
- Then run `cursor-goal-install-skill --global` again

**Skill works but checkpoints fail**

- Run `cursor-goal` from the project root so it resolves the same workspace state
- Pass `--verify` with a safe, repo-specific command when setting the goal

**Stop hook keeps looping or never completes**

- Confirm the goal was set with `--conversation-id` matching the active chat
- Run verification manually: `cursor-goal` should show the configured command
- Check `~/.cursor/hooks.json` points at `evaluate-goal.sh` from your installed package
- Remember: stop hooks do not run in Cloud Agents — test in local Agent chat

For a full manual stop-hook acceptance script, see [Smoke verification](smoke-test.md#stop-hook-manual-test-local-ide).
