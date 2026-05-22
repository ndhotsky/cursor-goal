# Agent guidance for cursor-goal

This repository builds a small TypeScript CLI around `@cursor/sdk`.

Rules:

- Keep dependencies minimal.
- Preserve the Codex-style command surface.
- Do not add telemetry.
- Do not log secrets.
- Treat verification as the source of truth when provided.
- Keep generated files out of source unless they are part of a release process.
- Prefer small, testable modules.
