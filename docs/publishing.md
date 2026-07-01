# Publishing

This fork is distributed **from source** (`git clone` + `npm link`). See [`install.md`](install.md).

Use this doc when cutting tagged GitHub releases for `ndhotsky/cursor-goal`.

## Release checklist

Before tagging a release:

```bash
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Confirm the tarball includes:

- `dist/`, `scripts/install-skill.sh`, `scripts/install-hook.sh`, `scripts/evaluate-goal.sh`
- `.cursor/skills/goal/SKILL.md`
- `cursor-goal`, `cursor-goal-install-skill`, and `cursor-goal-install-hook` under `bin` in `package.json`

Optional live smoke: see [`smoke-test.md`](smoke-test.md).

## Version bump

1. Update `package.json` `version`.
2. Add a section to [`CHANGELOG.md`](../CHANGELOG.md).
3. Merge to `main` with green CI.
4. Tag and publish a GitHub release (below).

## GitHub release

Tag should point at `main` after CI is green:

````bash
gh release create v0.4.0 --title "v0.4.0" --notes-file - <<'EOF'
## Summary

- Stop hook enforcement layer (conversation index, stop-evaluate, hook installer).
- See [CHANGELOG.md](https://github.com/ndhotsky/cursor-goal/blob/main/CHANGELOG.md) for full notes.

## Install

```bash
git clone https://github.com/ndhotsky/cursor-goal.git
cd cursor-goal
npm install && npm run build && npm link
npm run install-skill:global
npm run install-hook:global
```

Then in local Cursor Agent chat: `/goal <objective>`

Docs: https://github.com/ndhotsky/cursor-goal/blob/main/docs/install.md
EOF
````

## Optional npm publish

The upstream project publishes to npm as `cursor-goal`; **this fork does not rely on that package**. If you choose to publish this fork under a new npm name or scope, configure Trusted Publisher on npm and use [`.github/workflows/publish-npm.yml`](../.github/workflows/publish-npm.yml) with your repository settings.

Until then, ignore the publish workflow or disable it in GitHub Actions settings.
