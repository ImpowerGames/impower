# impower-dev build pipeline

Why this package has a `build.ts` instead of a plain `vite build`, and how the
dev server, the production build, workers, and deployment fit together.

## Why not stock `vite build`?

The app needs three things Vite's single-config / static-`index.html` model
doesn't cover:

1. **A multi-target build** — an SSR'd API bundle, browser page bundles, a
   service worker, and several workers built by a *different* bundler (esbuild,
   in sibling packages).
2. **Custom SSG** — render the root Preact component to HTML and inline the
   editor's compiled Tailwind into the page, so it's styled before JS runs.
3. **A Fastify-mounted dev server** — the dev server is the Fastify app with
   Vite attached as middleware, not Vite's own server.

So the Vite-native surface lives in **`vite.config.ts`** (config + plugins) and
**`build.ts`** orchestrates it. `build.ts` is the entry point for both dev
(`--watch`) and prod; `configFile: false` everywhere means Vite never
auto-loads `vite.config.ts` behind our back — `build.ts` imports the pieces it
needs explicitly.

## `vite.config.ts` — the config + plugins

- **`alias` / `dedupe`** — built from the package's `peerDependencies` via
  `resolvePkgDir(name)`, which resolves a dependency's directory in a way that's
  robust to **npm-workspace hoisting** *and* restrictive `exports` maps. (Three
  tiers: resolve `<name>/package.json`; else resolve the entry and slice back to
  `node_modules/<name>`; else walk up the `node_modules` chain. The last tier is
  what makes `@impower/impower-ui` — whose `exports` exposes neither
  `package.json` nor a main — resolvable.) `react`/`react-dom` alias to
  `preact/compat`.
- **`browserEnvDefine`** — Vite `define` entries replacing `import.meta.env.VITE_*`
  / `BROWSER_*` at build time. (Standard Vite; replaced an old per-module
  `var process = {...}` banner.)
- **`viteStaticallyRenderedPagesPlugin`** — the dev SSG middleware *and* dev
  worker hot-reload (below).
- **`viteBannerPlugin`** — prepends the dynamic service-worker env banner
  (`SW_VERSION` / `SW_RESOURCES`).
- **`readEditorGlobalCss()`** — reads `normalize.css` + `theme.css` to inline
  into the SSG `<style>` block.

Asset imports use Vite's **native `?raw`** (e.g. `import css from "./x.css?raw"`);
there is no custom asset-loader plugin.

## `build.ts` — the production targets

`npm run build` runs, in order:

1. **`clean`** — wipe `out/`.
2. **`copyPublic`** — copy `src/public` → `out/public` (fonts, icons, manifest).
3. **`buildApi`** — bundle `src/api/index.ts` → `out/api/index.js` (SSR/ESM).
   This **inlines almost everything**; only `fastify`, `dotenv`, and
   `googleapis` are left external. (Verify with
   `grep -oE "from ['\"][^.][^'\"]+" out/api/index.js | sort -u`.) That's why the
   Docker runtime image needs only those few packages — see *Deployment*.
4. **`buildPages`** — bundle `src/pages/**/*.ts` browser entries → `out/public`.
5. **`expandPageComponents`** (the SSG) — for each page HTML shell: render the
   root Preact component into `<div id="root">`, compile impower-ui's Tailwind
   (via a transient middleware-mode Vite server hitting
   `impowerUiStyleCss?direct`), and inline `normalize + theme + Tailwind` into a
   `<style id="ssg-css">` block. Writes the styled HTML to `out/public`.
6. **`buildWorkers`** — run each sibling package's `esbuild.js` to emit the
   worker bundles + build the service worker (with the `SW_RESOURCES` cache
   manifest).

## The dev server (`serve`, `--watch`)

`npm run dev` (`tsx ./build.ts --watch`) starts the Fastify app with a Vite
server mounted in middleware mode:

- Page requests hit **`viteStaticallyRenderedPagesPlugin`**, which SSGs the page
  on the fly (same render + Tailwind inline as the prod build, via
  `server.transformRequest` and `ssrLoadModule`).
- `optimizeDeps.entries` points the dep scanner at the **page JS**
  (`src/pages/**/*.{js,mjs,ts}`), not the contentless HTML shells — otherwise
  Vite auto-globs the `*.html` and (on Windows) the scan aborts.
- **Worker hot-reload:** the plugin spawns each external worker's
  `esbuild.js --watch` into `out/.dev`; a `chokidar` watcher on those outputs
  sends a Vite `full-reload` when a worker rebuilds, so editing a worker (or its
  transitively-bundled engine/compiler deps) re-instantiates it without a
  dev-server restart. Worker responses are served `Cache-Control: no-store`.

`.env.development` supplies the cross-origin defaults (player at `:5173`); the
server reads `PORT` (default 8080) and binds `0.0.0.0` only under Cloud Run
(`K_SERVICE`).

## Workers

The three external workers — `sparkdown-language-server`, `opfs-workspace`,
`sparkdown-screenplay-pdf` — live in sibling packages and are bundled by their
own `esbuild.js` (with esbuild's `--watch` for dev). The app loads them as
`new Worker("/<name>.js")`. They're a separate bundler from Vite on purpose:
they're reusable packages with their own build, also consumed by the VS Code
extension.

## Sharing UI with the VS Code webviews

`@impower/sparkdown-document-views` (the CodeMirror editor + screenplay
preview) is consumed by **both** this app (Vite, via `@preact/preset-vite`) and
**vscode-sparkdown's webviews** (plain esbuild). When a shared component imports
`@impower/impower-ui`, the webview's esbuild has to reproduce four things Vite's
preset does for free — see `vscode-sparkdown/webviews/screenplay-webview/esbuild.js`:

1. **Resolve to source.** `conditions: ["development"]` so the package's
   `development` export condition points at TS source. Otherwise esbuild falls
   through to the `import` condition's built `dist/impower-ui.js`, which is
   gitignored and never produced by this chain.
2. **Preact JSX, build-wide.** `jsx: "automatic"` + `jsxImportSource: "preact"`.
   impower-ui `.tsx` use the automatic runtime with no `React`/`h` import; without
   this esbuild emits classic `React.createElement` and the component throws
   `ReferenceError: React is not defined` at render. Set it at the build level —
   esbuild's per-file tsconfig discovery is unreliable for this.
3. **Import via a subpath, not the barrel.** Use a per-component export
   (`@impower/impower-ui/loading-bar`), not `@impower/impower-ui/components`.
   esbuild can't tree-shake the barrel's Radix-based re-exports (its
   `sideEffects` honoring is node_modules-only, and the workspace package
   resolves to its real path under `packages/`), so the barrel would drag all of
   Radix — and its `react` imports — into the bundle.
4. **Inject scoped, preflight-free CSS.** The webview has no global Tailwind
   stylesheet. Do **not** inject `dist/impower-ui.css` — it includes Tailwind
   preflight (a global reset) that fights the CodeMirror preview's styling. A
   `?tw` esbuild loader compiles a tiny entry (`impower-ui-utilities.css` — only
   `tailwindcss/theme` + `tailwindcss/utilities`, no preflight, `@source`ing the
   rendered components) via `@tailwindcss/node`, and the webview entry injects
   the result into `<head>`.

Worker delivery in vscode-sparkdown has a related workspace gotcha: its esbuild
copy plugin must read worker/codicons dists from `../packages/<pkg>/dist` and
`../node_modules/@vscode/...` (the npm-workspaces migration hoists those deps to
the monorepo root, so the old local `./node_modules/...` paths copy nothing).

## Deployment (Cloud Run)

A **multi-stage `Dockerfile`** built from the **monorepo root** (so `npm ci`
uses the single root lockfile):

1. *builder* — `npm ci` the workspace, `npm run build --workspace=impower-dev`.
2. *runtime* — a slim `node:20-slim` with only the API bundle's external
   closure installed (`collect-runtime-deps.mjs` derives it from
   `out/api/index.js`), plus `out/`. Entry: `node out/api/index.js`.

`impower-dev.cloudbuild.yaml` builds that image, pushes to Artifact Registry,
and deploys to Cloud Run. The build-time public config (`VITE_SPARKDOWN_PLAYER_ORIGIN`,
the public `BROWSER_GOOGLE_*` keys) is passed as `--build-arg`s; the player app
deploys the same way (static `dist/` served by nginx).

> **Traffic must serve "latest".** The deploy step is `gcloud run services
> update --image=…`, which creates a new revision but only migrates traffic if
> the service is set to serve the latest revision. If traffic is ever *pinned*
> to a specific revision (`spec.traffic[].revisionName` instead of
> `latestRevision: true`), new deploys build and report "deployed" but sit at
> **0% traffic** with no "Routing traffic" phase in the log — the old revision
> keeps serving. Fix and prevent recurrence with a one-time
> `gcloud run services update-traffic <service> --to-latest --region=us-central1`
> (sets `latestRevision: true`). Diagnose with
> `gcloud run services describe <service> --format="json(spec.traffic,status.latestReadyRevisionName)"`.
