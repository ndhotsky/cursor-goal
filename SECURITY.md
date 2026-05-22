# Security Policy

`cursor-goal` can run shell commands and autonomous coding agents. Treat it like a developer tool with real workspace access.

## Reporting issues

Please open a GitHub issue for security concerns that do not expose private secrets. For sensitive reports, contact the maintainer privately once a maintainer contact is listed in the published repository.

## Safety defaults

- Destructive verification commands are blocked unless `--allow-destructive` is used.
- Secrets are not intentionally logged.
- Goal state and run logs are local files under `.goal/`.
- Users should review diffs before committing or deploying agent changes.
