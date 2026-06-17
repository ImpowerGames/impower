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
