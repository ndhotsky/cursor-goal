# Publishing

## Release checklist

Before tagging a release:

```bash
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Optional live smoke (temp directory):

```bash
# See docs/smoke-test.md — full CLI + verification + checkpoint flow
```

## GitHub release

Tag should point at `main` after CI is green:

```bash
gh release create v0.2.1 --title "v0.2.1" --notes-file - <<'EOF'
## Summary

- Cursor Agent chat runs the goal loop; CLI manages `.goal/` state and verification only (no Agent SDK).
- Stricter persisted state validation and fail-closed checkpoint policy.
- CLI version reads from package.json.

## Install

git clone https://github.com/Niko96-dotcom/cursor-goal.git
cd cursor-goal && npm install && npm run build && npm link
npm run install-skill:global
EOF
```

## npm

### First publish (local, one time)

```bash
npm login
npm publish --access public
```

### Automated publishes (recommended)

1. On [npmjs.com](https://www.npmjs.com/) → your account → **Access Tokens** is not required; use **Trusted Publisher**.
2. After the first publish (or when the package exists), open **cursor-goal → Settings → Trusted Publisher** and add:
   - **Provider:** GitHub Actions
   - **Repository:** `Niko96-dotcom/cursor-goal`
   - **Workflow filename:** `publish-npm.yml`
   - **Environment:** (leave empty unless you use one)
3. Future releases: publishing runs automatically when you publish a GitHub release (`release: published`), or run the **Publish npm** workflow manually.

Workflow: `.github/workflows/publish-npm.yml` (OIDC, no `NPM_TOKEN` secret).
