# Security Policy

`cursor-goal` can run shell verification commands in your workspace and is designed to pair with Cursor Agent chat, which can edit files and run tools. Treat it like a developer tool with real workspace access.

Install and scope: [`docs/install.md`](docs/install.md).

## Reporting issues

For non-sensitive bugs, open a [GitHub issue](https://github.com/ndhotsky/cursor-goal/issues/new). Do not paste secrets, tokens, or private goal run logs.

For sensitive reports, use [GitHub Security Advisories](https://github.com/ndhotsky/cursor-goal/security/advisories/new) (private disclosure).

## Safety defaults

- Destructive verification commands are blocked unless `--allow-destructive` is used.
- Secrets are not intentionally logged.
- Goal state and run logs are local files under the user state directory by default; legacy workspace-local `.goal/` state is opt-in.
- Users should review diffs before committing or deploying agent changes.
