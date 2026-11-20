# RevPortfolioClaritysEditor

A local-only CMS for the maintained static portfolio repository. The editor keeps no editorial database: the configured production Git repository is the content source of truth.

This checkout is wired to the `Claritys11` forks that serve <https://claritys.web.id>. It runs on any machine — PC or laptop — and is never deployed; only the portfolio repository is published.

## Setup on a new machine

Clone the editor and the portfolio as siblings so the defaults resolve without configuration:

```sh
mkdir -p ~/portfolio && cd ~/portfolio
git clone https://github.com/Claritys11/RevPortfolioClaritysEditor.git
git clone https://github.com/Claritys11/RevPortfolioClaritys.git
cd RevPortfolioClaritysEditor
pnpm install
pnpm dev
```

Requires Node.js 22+ and pnpm 11+. The app binds to `127.0.0.1:4317`. Do not expose it through LAN, a tunnel or a public reverse proxy.

Git pushes use the machine's own GitHub credentials (`gh auth login` or a credential helper). Nothing secret lives in this repository; `.env.local` is gitignored and optional.

Start with [docs/editor-guide.md](docs/editor-guide.md) for the CRUD workflow and [docs/git-and-publish.md](docs/git-and-publish.md) for review, Commit, Push and deployment verification.

## Two-repository model

| Repository | Role | Editor access |
| --- | --- | --- |
| `Claritys11/RevPortfolioClaritysEditor` | Local CMS, forms, import adapters and Git actions | Application source; loopback-only runtime |
| `Claritys11/RevPortfolioClaritys` | Production website source, content/assets, static build, and GitHub Pages deployment | Read/write; only editor commit/push target |

The editor defaults to the sibling checkout `../RevPortfolioClaritys`. No template repository is required. Configure overrides in a local `.env.local` (see `.env.example`):

- `PORTFOLIO_REPO_PATH`: the only repository the editor may write, commit and push.
- `EXPECTED_PORTFOLIO_REMOTE`: exact production `origin` URL accepted by the Push guard; defaults to `https://github.com/Claritys11/RevPortfolioClaritys`.
- `EDITOR_AUTO_FETCH`: fast-forward a clean production branch once at server boot; defaults to `false`.

A manifest with `role: template` is rejected as a write target, so an upstream template checkout can never be committed to by accident.

## Features

- Writeup CRUD with Markdown/frontmatter, import tools and draft/published state.
- Project and achievement CRUD.
- Profile, SEO and appearance editor.
- Central site deployment settings: canonical origin, base path (`/` by default), fixed static output `dist`, trailing-slash policy, and metadata.
- Explicit GitHub Pages custom-domain synchronization with a browser confirmation; existing workflow publishing mode/source are preserved.
- Public asset manager.
- Production Git status, managed-path diff, validation, startup remote fetch, manual fetch, explicit commit and guarded push.
- Content health: writeup/project/certificate inventory, draft counts, broken asset references and unreferenced uploads, computed locally from the production working tree.
- Migration Tools workbench with the legacy schema map and future adapter pipeline.

## Legacy migration

See [docs/migration-runbook.md](docs/migration-runbook.md) and [docs/migration-adapters.md](docs/migration-adapters.md). The old backend used Prisma/PostgreSQL. Database exports are the preferred source for a complete migration; public endpoint scraping is only a lower-fidelity fallback. The Migration Tools panel is currently a read-only architecture/workflow scaffold: no importer writes production data yet.

## Safety

- API mutation endpoints require the local Host and matching Origin.
- The server binds to loopback only.
- Repository path traversal and symlink escape are rejected.
- A marked template repository cannot be configured as the write target.
- Asset files are checked by size, extension, MIME and signature.
- Content saves use SHA-256 optimistic concurrency; stale files are rejected.
- Commit runs content validation and Git diff checks first.
- Commit stages only `content/` and `public/assets/`.
- Push verifies `origin` against `EXPECTED_PORTFOLIO_REMOTE`.
- Startup/manual fetch only fast-forwards a clean branch tracking `origin/*`; dirty or diverged branches are left untouched.
- Diagnostics never reset, clean, rebase or repair Git state.

The source production repository remains the only source of content truth. The public static site is built from that repository's `dist/` artifact; there is no separate active `RevisionedPortfolioSite` Git repository. The editor's GitHub Pages action changes only the repository custom-domain setting. DNS records and TLS activation are separate infrastructure operations. Migration imports require a future dry-run/approval workflow before production writes.

## Documentation

- [Editor guide: CRUD, profile, appearance and assets](docs/editor-guide.md)
- [Git and publishing: diff, Commit, Push and GitHub Actions](docs/git-and-publish.md)
- [Migration runbook](docs/migration-runbook.md)
- [Legacy schema and adapter mapping](docs/migration-adapters.md)
- Workspace operations: see the homelab workspace guide on the originating machine (not part of this repository)
