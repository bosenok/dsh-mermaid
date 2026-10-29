# dsh-mermaid

Render mermaid fenced code blocks as diagrams in DSH markdown.

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin,
packaged as a DSH bundle: `package.json` declares `dsh.bundle.patch`, and
`cordis.patch.yml` inserts the `mermaid` row into the active profile.
The client half is served from `lib/client.js` (`dsh.client.platform: web`).

## Where it renders

The harness markdown renderer exposes no custom-code-block seam, so the client half
post-processes the rendered DOM: it finds fenced code that is a mermaid diagram, renders it
with mermaid and swaps the code view for the diagram. Because the sweep observes
`document.body`, every surface that renders markdown through the shared renderer is covered:

- chat messages and the code cards they contain (including streaming and re-renders);
- the **right Sidebar document preview** for `.md`/`.markdown` files — the diagram keeps the
  card header with its copy button and gains the plugin's zoom/fit toolbar;
- theme switches re-render every diagram with the other palette.

Deliberately left as code: the plain-text source view of the preview
(`[data-textpreview-plain]`), diff views, and blocks whose source only starts with a diagram
keyword (a list of keywords, prose that mentions `graph TD`).

## Install

- Desktop app: **Plugins** → install `github:bosenok/dsh-mermaid` (private repository:
  give the machine git access), then enable the bundle.
- CLI: `dsh plugin --profile <profile> add github:bosenok/dsh-mermaid`.
- Local checkout: `dsh plugin --profile <profile> add file:/path/to/dsh-mermaid`.

Enabling the bundle mounts the plugin; HMR applies it to a running app, and a
restart makes sure the client half is rebuilt.

> Note for the app-managed `desktop` profile: `dsh plugin --profile desktop add`
> only installs the dependency and copies the package; unlike a regular profile
> it does not enable the bundle. Enable it by adding the package name to
> `dsh.profile.bundles` in `~/.dsh/profiles/desktop/package.json` (or through the
> Plugins page). Other profiles enable the installed bundle automatically.


## Versioning

This project follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).
Releases are tagged in git (`v0.1.0` and later `v0.1.x` tags), announced
as GitHub releases and documented in [CHANGELOG.md](./CHANGELOG.md).

`engines.dsh` in `package.json` pins the compatible DSH range.

Bump policy: **patch** — fixes; **minor** — new features without breaking the
configuration; **major** — breaking changes to the configuration, the session
format or the supported DSH range.

`CHANGELOG.md` is generated with [git-cliff](https://git-cliff.org/) from
[Conventional Commits](https://www.conventionalcommits.org/) (`cliff.toml`):

```sh
./scripts/changelog.sh                 # print unreleased notes
./scripts/changelog.sh v0.2.0          # add the next release section
git cliff -o CHANGELOG.md              # full regeneration (curated history is kept otherwise)
```

To install a specific release instead of a moving branch, pin the tag:

```sh
dsh plugin --profile desktop add "git+ssh://git@github.com/bosenok/dsh-mermaid.git#v0.1.0"
```

Tags are created on `master` by Git Flow; integration builds live on `develop`
(install with `#develop` if you want the latest unreleased code).

## Development

`lib/` is built and committed; the sources live in `src/`. Rebuild the client with
the repository's Vite config (`npx vite build` → `dist/`, then the wrapper in
`build/wrapper.js` produces `lib/client.js`).

## License

MIT — see [LICENSE](LICENSE). Third-party code bundled into `lib/` and its
licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
