# cursor-goal

Persistent `/goal` loops for **Cursor Agent chat** — with optional **harness enforcement** so the agent cannot stop until verification passes.

Inspired by Codex Goal mode and Claude Code’s `/goal`, extended for Cursor with durable local state, a global skill, and a `stop` hook hard gate.

**Repo:** https://github.com/ndhotsky/cursor-goal

---

## What this is

Most “keep working until done” setups rely on the model obeying prompts. That fails the moment the agent decides it is finished.

`cursor-goal` splits the problem into three layers:

| Layer | What it does |
|-------|----------------|
| **CLI** (`cursor-goal`) | Goal lifecycle, shell verification, checkpoints, audit logs |
| **Skill** (`/goal`) | Command UX in Agent chat |
| **Stop hook** | Runs at every turn end in local Agent chat; returns `followup_message` until the goal passes verification |

Without the stop hook, you get Codex-style cooperative checkpoints (skill + CLI). **With the stop hook**, completion is decided by the harness — closer to Claude Code `/goal`.

```text
/goal in chat  →  agent works a turn
              →  stop hook: load goal by conversation_id
              →  run verify command
              →  fail? auto-continue with evidence
              →  pass? mark complete, allow stop
```

**Local IDE only for enforcement:** Cursor `stop` hooks run in local Agent chat today, not in Cloud Agent VMs. Cloud sessions still get skill + CLI behavior without the hard gate.

---

## Install (from source)

Requires **Node.js 22+** and **Cursor Agent chat**.

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
test -f ~/.cursor/skills/goal/SKILL.md
test -f ~/.cursor/hooks.json
```

Project-local skill/hook instead of global:

```bash
npm run install-skill
npm run install-hook
```

Full options, env vars, uninstall, troubleshooting: [`docs/install.md`](docs/install.md).

---

## Quick start in Cursor

1. Open Agent chat in a project (local IDE).
2. Run something like:

```text
/goal Make the auth test suite pass without changing public API behavior. Verify with npm test -- auth.
```

3. The skill sets durable state and works the goal in the current chat.
4. If the stop hook is installed and the goal is linked to this chat (see below), the agent **cannot stop** while verification still fails.

### Linking a goal to the active chat (for the stop hook)

The hook resolves goals via `conversation_id`. When setting or resuming from the CLI:

```bash
cursor-goal "Fix auth tests" --verify "npm test" \
  --conversation-id "<cursor-chat-id>" \
  --workspace-root "$PWD"
```

Pass `--conversation-id` when available (e.g. `CURSOR_CONVERSATION_ID` in the environment). Without it, the hook no-ops on turn end — normal chats are unaffected.

---

## Commands

### In chat

| Command | Action |
|---------|--------|
| `/goal <objective>` | Set/replace goal and work toward it |
| `/goal` | Show status |
| `/goal pause` / `resume` / `clear` / `edit` | Lifecycle |

### CLI

```bash
cursor-goal                                         # status
cursor-goal "<objective>" --verify "npm test"       # set goal
cursor-goal pause | resume | clear | edit "<obj>"   # lifecycle
cursor-goal prompt                                  # continuation contract
cursor-goal checkpoint --tool-calls 3 <<'EOF'       # record checkpoint (audit)
...
GOAL_STATUS: CONTINUE
GOAL_REASON: two tests still failing
EOF
```

With stop hook installed, **`checkpoint` is for audit**; turn-end verification in the hook is the hard gate.

Install helpers:

```bash
cursor-goal-install-skill --global
cursor-goal-install-hook --global
```

Alias: `cgoal`.

---

## Goal pattern

```text
/goal <desired end state>, verified by <specific command or artifact>, while preserving <constraints>. Use <allowed files/tools>. If blocked, stop with the blocker and the input needed.
```

More examples: [`examples/goal-prompts.md`](examples/goal-prompts.md).

---

## State and privacy

- **No network calls.** No telemetry. Verification runs local shell commands you configure.
- **State lives outside the repo** by default: `~/.local/state/cursor-goal/workspaces/<hash>/` (or `$XDG_STATE_HOME/...`).
- **Conversation index** (for the stop hook): `~/.local/state/cursor-goal/conversations/`.
- Legacy workspace-local state: `--state-dir .goal` or `CURSOR_GOAL_STATE_SCOPE=workspace`.

Treat `--verify` like `bash -c` — only commands you would run yourself.

---

## Architecture

Implementation plan and phases: [`.cursor/plans/cursor-goal-stop-hook.plan.md`](.cursor/plans/cursor-goal-stop-hook.plan.md).

| Component | Role |
|-----------|------|
| `src/state.ts`, `src/checkpoint.ts` | Goal state machine, checkpoint accounting |
| `src/conversationIndex.ts` | Map `conversation_id` → workspace state |
| `src/stopEvaluate.ts` | Stop hook evaluator (`cursor-goal stop-evaluate`) |
| `scripts/evaluate-goal.sh` | Wrapper invoked from `~/.cursor/hooks.json` |
| `.cursor/skills/goal/SKILL.md` | `/goal` skill surface |

---

## Verify it works

```bash
npm test
```

Manual stop-hook acceptance (local IDE): [`docs/smoke-test.md`](docs/smoke-test.md#stop-hook-manual-test-local-ide).

---

## Docs

| Doc | Purpose |
|-----|---------|
| [`docs/install.md`](docs/install.md) | Install, hooks, uninstall, troubleshooting |
| [`docs/smoke-test.md`](docs/smoke-test.md) | Automated and manual verification |
| [`docs/codex-goal-research.md`](docs/codex-goal-research.md) | Codex Goal-mode alignment notes |
| [`docs/native-parity.md`](docs/native-parity.md) | Native Codex vs Cursor parity harness |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history |

---

## Lineage

Forked and extended from [Niko96-dotcom/cursor-goal](https://github.com/Niko96-dotcom/cursor-goal) (Codex-style skill + CLI). This repo adds conversation-linked state and Cursor `stop` hook enforcement.

Unofficial project — not affiliated with OpenAI (Codex) or Cursor.

## License

MIT (see [`LICENSE`](LICENSE)).
