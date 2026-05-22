# Publishing to GitHub

This repository is prepared as an open-source GitHub project. To publish it:

```bash
cd cursor-goal
git init
git add .
git commit -m "Initial open-source release"
gh repo create Niko96-dotcom/cursor-goal --public --source=. --remote=origin --push
```

Or without GitHub CLI:

```bash
git remote add origin git@github.com:Niko96-dotcom/cursor-goal.git
git branch -M main
git push -u origin main
```

Before publishing, confirm:

- `Niko` in `LICENSE` is the copyright holder you want
- `.env` stays gitignored if you add local overrides
- README disclaimer and SECURITY contact are up to date

After the repo is public:

```bash
gh repo edit Niko96-dotcom/cursor-goal --visibility public --accept-visibility-change-consequences
gh release create v0.2.0 --title "v0.2.0" --notes "Initial public release: Codex-style /goal for Cursor Agent chat."
```

Recommended first release checklist:

```bash
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run
```
