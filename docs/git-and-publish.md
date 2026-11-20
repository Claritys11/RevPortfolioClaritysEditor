# Editor Git and publishing guide

## 1. Understand the four stages

| Stage | Operation | Result |
| --- | --- | --- |
| Save | Editor form action | Changes files in the local production checkout |
| Commit | Repository health action | Creates a local Git commit |
| Fetch | Editor startup or Repository health action | Fetches `origin`; fast-forwards only a clean branch that is behind its `origin/*` upstream |
| Push | Repository health action | Sends existing local commits to `origin` |
| Build | GitHub Actions in `RevPortfolioClaritys` | Runs validation and creates the `dist/` static export |
| Publish | Deploy job in the same workflow | Uploads `dist/` with `actions/upload-pages-artifact` and deploys via `actions/deploy-pages` |
| Pages | GitHub-native Pages (`build_type=workflow`) | Serves the deployed artifact at `https://claritys.web.id` |

The editor never commits or pushes automatically. Startup fetch is disabled by default (`EDITOR_AUTO_FETCH=false`); when enabled it never overwrites dirty or diverged work.

## 2. Check repository identity first

Open **Repository health**. Confirm:
- Production root is the expected `RevPortfolioClaritys` checkout.
- Production remote is `https://github.com/Claritys11/RevPortfolioClaritys`.
- Current branch is `main`, not detached HEAD.
- Content health reports no broken asset references.

Commit and Push buttons target only the production repository. Content health is read-only and never deletes files.

## 3. Review changes

1. Save your edits in the relevant editor pages.
2. Open Repository health.
3. Check the working-tree listing.
4. Select **Show diff**.
5. Review the stat and patch. New text files are shown as additions; binary assets are listed with file size.
6. Check asset paths and ensure no accidental files or secrets are being published.

If you changed website source code, workflow files or docs directly in the production repository, review those changes in a terminal. The editor's managed commit is intentionally limited to `content/` and `public/assets/`.

## 3a. Fetch from another device

The Next.js Node server fetches `origin` once when it boots. To check for changes without restarting, open **Repository health** and select **Fetch remote**. Both paths use the same guarded behavior:

- `origin` must match `EXPECTED_PORTFOLIO_REMOTE`;
- the current branch must have an upstream under `origin/*`;
- a clean branch behind its upstream is updated with `git merge --ff-only`;
- uncommitted changes, local-only commits or diverged history are reported without rewriting local files or commits.

For more than one editing device, give each device a separate clone of the production repository, use the same branch/upstream, and fetch before starting a new editing session. Commit and Push remain explicit. If a device reports divergence, reconcile it manually in Git before continuing; do not use reset to force one device over another.

Set `EDITOR_AUTO_FETCH=false` in `.env.local` to disable the startup fetch. The manual action remains enabled.

## 4. Run repository health

Select **Run health check**. The current doctor checks:
- repository root and expected remote;
- `git fsck --full --strict` object integrity;
- content validation;
- static-output validation against the current `dist/` build;
- remote reachability;
- `git diff --check`;
- working-tree state.

The doctor is diagnostic, not a repair tool. It never resets, cleans, rebases, prunes or repairs Git. If it detects corruption, stop and preserve a copy before attempting recovery.

## 5. Commit

Before committing, run the full production checks in a terminal when feasible:

```sh
cd ../RevPortfolioClaritys
pnpm check
pnpm verify:content
pnpm verify:output
pnpm e2e
```

Then return to **Repository health**:
1. Enter a one-line commit message (1–160 characters).
2. Select **Commit content + assets**.
3. The editor re-runs content validation and whitespace checks.
4. It stages only `content/` and `public/assets/`; unrelated staged files are not included.
5. Verify the new commit and status.

For website source changes (for example `next.config.ts`, scripts, workflows or documentation), use Git from the production repo terminal instead. Do not expect the editor's scoped commit to include them.

## 6. Push

The editor Push action executes `git push` for the current branch after checking:
- `origin` equals `EXPECTED_PORTFOLIO_REMOTE`;
- branch is not detached.

Default expected remote:
`https://github.com/Claritys11/RevPortfolioClaritys`

For a different production remote, set `EXPECTED_PORTFOLIO_REMOTE` in `RevisionedPortfolioEditor/.env.local`, restart the editor and verify the expected/actual remote in Repository health. Do not disable the guard to force a push.

After pushing, verify with:

```sh
cd ../RevPortfolioClaritys
git status --short --branch
git log -1 --oneline
git ls-remote origin refs/heads/main
```

## 7. Deployment verification

Every push to `main` triggers `.github/workflows/pages.yml`. Follow both jobs:

```sh
gh run list --repo Claritys11/RevPortfolioClaritys --workflow pages.yml --limit 5
gh run watch <run-id> --repo Claritys11/RevPortfolioClaritys
```

Both `build` and `deploy` must succeed. The published site is <https://claritys.web.id>. Verify the homepage, one nested writeup, one image and `sitemap.xml`.

Deployment is GitHub-native: the workflow builds `dist/` and publishes it with `actions/upload-pages-artifact` + `actions/deploy-pages` using the repository's own `GITHUB_TOKEN`. There is no separate static-site repository, no deploy PAT and no server. Pages must be set to **Source: GitHub Actions** (`build_type=workflow`) in the production repository's Settings → Pages.

The custom domain lives in the repository's `CNAME` file (`claritys.web.id`) and in the Pages `cname` setting. DNS for the apex and `www` points at `claritys11.github.io`. Changing the domain means updating all three: `CNAME`, the Pages setting, and the DNS records.

## 8. Common failures

- **Push blocked: remote mismatch:** inspect `git remote -v` and `EXPECTED_PORTFOLIO_REMOTE`. Do not push to an unfamiliar remote.
- **Detached HEAD:** switch to the intended branch through normal Git operations after checking current state.
- **Content validation failed:** fix invalid JSON/frontmatter, duplicate slugs, date format or missing assets.
- **Static output check failed:** rebuild using `pnpm build`, then rerun `pnpm verify:output`.
- **Git conflict / stale form:** refresh repository data, reopen the file and reconcile the external edit.
- **Build succeeds but deploy fails:** confirm Settings → Pages source is GitHub Actions, not a branch. A branch source rejects the artifact deployment.
- **Deploy succeeds but the domain 404s or serves a stale certificate:** check that `CNAME`, the Pages `cname` setting and the DNS records agree, then re-check `gh api repos/Claritys11/RevPortfolioClaritys/pages --jq '.status,.cname,.https_enforced'`.
- **Pages workflow failed:** inspect the failed Actions step; do not assume a successful source Git push means a successful publication.
