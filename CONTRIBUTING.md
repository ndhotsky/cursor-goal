# Contributing

Thanks for helping make `cursor-goal` less janky and more useful.

## Local setup

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Development loop

```bash
export CURSOR_API_KEY="crsr_..."
npm run dev -- "Inspect this repo and write a short architecture note" --verify "test -f docs/architecture.md" --once
```

## Pull request expectations

- Keep the CLI small and dependency-light.
- Add tests for parser, lifecycle, and safety behavior.
- Do not add telemetry.
- Preserve the Codex-like command surface unless there is a clear reason to diverge.
- Document any divergence from Codex Goal mode in `docs/codex-goal-research.md`.
