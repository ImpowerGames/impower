All facts confirmed: monorepo root with its own `package.json`, baseline at `../impower/impower-dev`, no existing Playwright config. I have everything needed to write the spec.

# Visual-Parity Test Harness — Engineering Spec

**Status:** Draft for implementation
**Owner:** spark-editor / impower-dev port
**Scope:** Pixel + computed-style parity between the Preact port (`impower-preact-port/impower-dev`, served on `:8081`) and the web-component baseline (`impower/impower-dev` on `main`, served on `:8080`).
**Decision basis:** Playwright runner parameterized over two running stacks; live in-memory A/B diffing via `pixelmatch`; computed-style diffing via `page.evaluate`; intentional-difference allowlist; golden-snapshot mode as a CI variant.

---

## 1. Goal & non-goals

### Goal

Guarantee that the Preact port renders **visually and stylistically equivalent** to the web-component baseline across all editor chrome and interaction flows, so that regressions introduced during the port surface automatically rather than via manual screenshot review.

"Parity" here is defined by **two independent assertions per checkpoint**:

1. **Pixel parity** — the rendered raster of a region matches within a small per-checkpoint threshold (`pixelmatch` mismatch ratio ≤ threshold), after deterministic neutralization and masking of known-volatile regions.
2. **Computed-style parity** — for an enumerated set of semantic elements, a fixed list of CSS properties (read via `getComputedStyle`) match exactly (with a small numeric tolerance for sub-pixel layout values).

A checkpoint **passes** only when *both* layers pass (or the delta is covered by an allowlist entry — see §9). The two layers are complementary: pixel diff catches color/spacing/shadow/icon drift that computed-style enumeration might miss; computed-style diff catches semantically-meaningful drift (wrong token, wrong font weight, wrong flex direction) that anti-aliasing tolerance in the pixel layer might mask, and produces a human-readable "what changed" table.

### What parity means concretely

- The two apps share a **byte-for-byte-identical load contract** (same `WorkspaceConstants`, OPFS worker protocol, `localStorage` keys — see infra investigation "seed-state"). The only intended divergences are visual: the port re-implements chrome in Preact + full-Tailwind, intentionally restyling some elements. The harness treats *layout, color, typography, spacing, and interaction-state styling* as the contract; the **DOM structure is expected to differ completely** (shadow-DOM `s-button` vs light-DOM `<button>`), so the harness never asserts on DOM shape — only on rendered output and computed style of semantically-matched elements.

### Non-goals (explicit caveats)

- **The live game canvas is never pixel-matched.** `PreviewGame.tsx` mounts a cross-origin (`SPARKDOWN_PLAYER_ORIGIN`) `<iframe>` running a PIXI/WebGL game loop driven by `requestAnimationFrame`. Its pixels change every frame and injected CSS cannot reach inside it. The iframe region (`#iframe`, `.pg-iframe-wrap`, `div#preview`) is **always masked**. We assert on the surrounding toolbar chrome only.
- **CodeMirror content interiors are never pixel-matched.** `<sparkdown-script-editor>` and `<sparkdown-screenplay-preview>` virtualize their viewport, blink a caret, async-apply syntax highlighting + LSP diagnostics, and measure glyph metrics. The `.cm-content` / `.cm-scroller` interior, `.cm-cursor`, `.cm-selectionLayer`, `.cm-activeLine(Gutter)`, and inline diagnostic decorations are **masked**. We assert on editor chrome (back/rename header, sub-tabs + settled underline, FAB, gutter line-number text, and diagnostic-derived *color classes* once diagnostics settle).
- **Intentional Tailwind drift is not a failure.** The port deliberately restyled some elements (e.g. padding/scale/icon-size deltas noted in memory: bottom-nav padding 8→16, font 12→14, scale 0.9→0.8, icon 20→21). Those known deltas are recorded in an **allowlist** (§9) that suppresses exactly the scoped diff and forces only real, unexpected regressions to fail. The allowlist is the mechanism that lets us run COMPREHENSIVE coverage without drowning in expected noise.
- **Not a functional/E2E correctness suite.** The harness asserts appearance, not behavior beyond what's needed to reach a visual checkpoint. (It does drive interactions, but a passing harness does not certify that, e.g., a rename actually wrote to OPFS — only that the rename UI looks the same.)
- **No accessibility/perf auditing.** Out of scope.

---

## 2. Architecture overview

```
                                e2e-visual-parity/ (Playwright project)
                                ┌──────────────────────────────────────────────────────────┐
                                │                                                            │
  ┌───────────────┐  build+serve│   global-setup.ts                                          │
  │ BASELINE repo │◄────────────┤   - build both stacks (prod) OR start dev                  │
  │ ../impower/   │   :8080      │   - health-check GET / on :8080 and :8081 (200 + opacity) │
  │  impower-dev  │             │   - optional: build+serve player :5173 (game scenarios)   │
  └───────────────┘             │                                                            │
         ▲                       │   parity.fixture.ts (per scenario):                        │
         │ Playwright            │   ┌─────────────────────────────────────────────────────┐ │
         │ context A (:8080)     │   │ 1. open 2 contexts (A=baseline, B=port), identical    │ │
         │                       │   │    viewport / DPR / colorScheme / locale / tz         │ │
  ┌───────────────┐ context B    │   │ 2. seed BOTH: clear localStorage+OPFS, write fixture  │ │
  │ PORT repo     │◄────(:8081)──┤   │    files, set project="local", (no sign-in)           │ │
  │ impower-      │             │   │ 3. addInitScript: freeze Date/Math.random/rAF         │ │
  │ preact-port/  │             │   │ 4. navigate both; await stability gate                │ │
  │  impower-dev  │             │   │ 5. addStyleTag(FREEZE_CSS); finish WAAPI animations   │ │
  └───────────────┘             │   │ 6. run scenario steps in lockstep on A and B          │ │
                                │   │ 7. at each checkpoint:                                 │ │
                                │   │      ┌──────────────────────┐  ┌────────────────────┐ │ │
                                │   │      │ Layer A: PIXEL DIFF   │  │ Layer B: STYLE DIFF │ │ │
                                │   │      │ screenshot A & B      │  │ getComputedStyle on │ │ │
                                │   │      │ (masks) → pixelmatch  │  │ matched elements    │ │ │
                                │   │      │ → mismatch ratio      │  │ → prop-by-prop diff │ │ │
                                │   │      └──────────┬───────────┘  └─────────┬──────────┘ │ │
                                │   │                 └──────────┬──────────────┘            │ │
                                │   │                            ▼                           │ │
                                │   │              ALLOWLIST FILTER (allowlist.yaml)         │ │
                                │   │              - suppress scoped known-intentional deltas│ │
                                │   └────────────────────────────┬──────────────────────────┘ │
                                │                                 ▼                            │
                                │   REPORT: per-checkpoint baseline.png / port.png / diff.png  │
                                │           computed-style diff tables, HTML summary index     │
                                └──────────────────────────────────────────────────────────┘
```

Two assertion layers feed one allowlist filter; surviving deltas fail the test and are written to the report artifacts.

---

## 3. Dual-stack runtime

Both stacks are launched and health-checked by Playwright's `globalSetup` + `webServer` entries. **Recommendation: production build + static serve** for determinism (per infra investigation "dual-stack-launch": dev mode does per-request SSG rendering, lazy worker compilation, and HMR churn — all nondeterministic). Provide a `dev`-mode toggle for fast local iteration.

### Ports & env vars

| Stack | Repo (cwd) | Build env (build-time) | Serve cmd | Port |
|---|---|---|---|---|
| Baseline | `../impower/impower-dev` | `VITE_SPARKDOWN_PLAYER_ORIGIN=` (empty) | `npm run start` | `PORT=8080` |
| Port | `./impower-dev` (this repo) | `VITE_SPARKDOWN_PLAYER_ORIGIN=` (empty) | `npm run start` | `PORT=8081` |

**Critical cross-origin gotcha (from infra investigation):** `VITE_SPARKDOWN_PLAYER_ORIGIN` is a **build-time** variable baked into the bundle (`build.ts` `BROWSER_VARIABLES_ENV`). A reload will not pick up a change. For all scenarios except live-game ones, build **both** stacks with `VITE_SPARKDOWN_PLAYER_ORIGIN=` (empty). With it empty:
- `PreviewGame.tsx` resolves `SPARKDOWN_PLAYER_ORIGIN` to `""`, so the iframe `src` becomes just `/` (loads the editor's own empty route, no cross-origin handshake attempt), eliminating the black-preview hang and console noise.
- The game pane still mounts the iframe (mounting is unconditional and the pane stays in the DOM even when collapsed — `MainWindow.tsx`), so it is **always masked** regardless.

**Worker processes:** Each stack is a *single* node process. `npm run start` = `node ./out/api/index.js` serves pre-rendered `out/public/*.html` + static assets via Fastify on `PORT`. The four "workers" (`sparkdown-language-server.js`, `sparkdown-screenplay-pdf.js`, `opfs-workspace.js`, service worker `sw.js`) are static bundles in `out/public/` loaded as Web/Service Workers **inside the browser**, not separate node processes. The production build (`npm run build`) produces all of them; nothing extra to launch.

**Player (`:5173`) sharing:** Do **not** start the player for the default suite. Only the live-game scenarios (`SHELL-09`, `PREVIEW-04`..`PREVIEW-08`) need it. A single player at `:5173` is built with `VITE_SPARKDOWN_EDITOR_ORIGIN=http://localhost:8080`, so its postMessage replies only reach the `:8080` editor — **it cannot be shared by both stacks simultaneously**. Consequence: live-game pixel scenarios are baseline-only-meaningful and are marked `priority: low` and gated behind a `--with-player` flag; the port's preview in those scenarios stays black and is masked. (We never pixel-match the canvas anyway, so this only affects whether the *toolbar around* a *running* game can be compared with a real running game underneath. The toolbar state can instead be driven directly via the workspace store — see §10 PREVIEW notes.)

### `playwright.config.ts` webServer entries

```ts
// e2e-visual-parity/playwright.config.ts
import { defineConfig } from "@playwright/test";

const PROD = !process.env.PW_DEV; // default prod; PW_DEV=1 for dev-mode iteration
const baselineCwd = "../impower/impower-dev";       // adjust relative to config dir
const portCwd     = "../impower-dev";

const buildEnv = { VITE_SPARKDOWN_PLAYER_ORIGIN: "" };

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,            // serial: two heavy stacks; flakiness control
  workers: 1,
  reporter: [["html", { outputFolder: "report/playwright" }], ["list"]],
  timeout: 90_000,
  use: {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
    ignoreHTTPSErrors: true,
  },
  webServer: [
    {
      command: PROD
        ? `cross-env ${envStr(buildEnv)} npm run build && cross-env PORT=8080 npm run start`
        : `cross-env ${envStr({ ...buildEnv, PORT: "8080" })} npm run dev`,
      cwd: baselineCwd,
      url: "http://localhost:8080/",
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    {
      command: PROD
        ? `cross-env ${envStr(buildEnv)} npm run build && cross-env PORT=8081 npm run start`
        : `cross-env ${envStr({ ...buildEnv, PORT: "8081" })} npm run dev`,
      cwd: portCwd,
      url: "http://localhost:8081/",
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
```

> `envStr` is a tiny helper that formats `KEY=val` pairs cross-platform; `cross-env` is already a common dep. On Windows the `&&` chaining works under `cross-env`/`npm`; if not, split build into `globalSetup` (preferred — see below).

### `global-setup.ts` responsibilities

1. If `PROD` and not `reuseExistingServer`, run the two `npm run build`s (with `VITE_SPARKDOWN_PLAYER_ORIGIN=`) sequentially before `webServer` boots them — this is more reliable cross-platform than chaining in the `command`. (Move the build out of `command` and leave only `npm run start` there.)
2. Health-check loop: poll `GET http://localhost:8080/` and `:8081/` until both return `200`. Then open a throwaway page on each and wait for `document.documentElement.style.opacity === "1"` (the reveal gate from `pages/index.ts`) to confirm the app actually boots, not just that Fastify is up.
3. If `process.env.PW_WITH_PLAYER`, additionally build+serve the player on `:5173` (cwd `../sparkdown-player-app`, `VITE_SPARKDOWN_EDITOR_ORIGIN=http://localhost:8080`) and health-check it.
4. Write a `report/run-meta.json` (git SHAs of both repos, timestamp, mode prod/dev, viewport).

---

## 4. Deterministic seed state

Both apps load project content from **OPFS**, keyed by `projectId` read from `localStorage["project"]` (default `"local"`). Account state is a server cookie (`/api/auth/account`) — unauthenticated returns `null` (deterministic with no sign-in). There is **no random ID generation that affects visible UI**. (All from infra investigation "seed-state".)

### The single seeding routine (works for BOTH apps)

Implemented as `seedProject(page, fixture)` in `helpers/seed.ts`, called **after `context.addInitScript` but before `page.goto`** for the OPFS/localStorage writes that must precede app boot — except OPFS access requires a document, so the actual sequence is: navigate to a blank same-origin page first (or `about:blank` won't have OPFS; use `page.goto(origin + "/")` then reset+seed then `page.reload()`). Concretely:

```ts
async function seedProject(page, origin, fixture) {
  await page.goto(origin + "/");            // get a same-origin document for OPFS access
  await page.evaluate(async (fx) => {
    // 1. RESET: clear localStorage + OPFS root
    localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const name of root.keys()) {
      await root.removeEntry(name, { recursive: true }).catch(() => {});
    }
    // 2. pin deterministic local project (offline 'cached' branch, no network)
    localStorage.setItem("project", "local");

    // 3. seed OPFS under directory "local"
    const dir = await root.getDirectoryHandle("local", { create: true });
    async function write(name, bytes) {
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(bytes); await w.close();
    }
    const enc = new TextEncoder();
    await write(".name", enc.encode(fx.projectName));     // avoids "Untitled Game" default
    await write("main.sd", enc.encode(fx.mainSd));
    for (const f of fx.files) await write(f.name, f.bytes ?? enc.encode(f.text ?? ""));

    // 4. pin pane/panel/open-file layout so both apps start on the identical view
    if (fx.workspaceState) {
      localStorage.setItem("workspace/local", JSON.stringify(fx.workspaceState));
    }
  }, fixture);
  await page.reload();                       // boot the app against the seeded OPFS
}
```

### What must be stubbed / forced

- **Account/auth:** Do **not** sign in → `/api/auth/account` returns `null` → identical unauthenticated Account layout in both apps, zero stubbing. For the *authenticated* layout scenarios (`HEADER/ACCOUNT-09`, `-11`, `-12`), intercept `**/api/auth/account` on **both** contexts identically with `page.route` returning a fixed payload `{uid:"u_fixture", displayName:"Fixture User", email:"fixture@example.com", consented:true}`.
- **Sync/remote:** Stay on `projectId="local"` → `_loadProject` hard-sets `sync.status="cached"` (caption "Saved in cache"), no network. To drive non-cached sync states (`HEADER/SYNC-*`), do **not** seed a remote id (that hits the network nondeterministically). Instead drive `workspace.signals.syncStatus` / store state directly via an exposed test hook (see §5 "Drive state, don't race it").
- **Dates/relative times:** No relative-time rendering exists in editor chrome, and `getCacheableState` strips `sync` from persisted state. **No clock stubbing is required for correctness** — but we still freeze `Date`/`Math.random`/`rAF` defensively via `addInitScript` (§6) to neutralize the PDF `uuid()` token, the asset `?v=Date.now()` cache-buster, and the scrub rAF loop.
- **localStorage workspace cache:** Always cleared in step 1; optionally re-pinned in step 4 so prior-session pane/scroll/open-file does not leak.

### Async settling gate (await before every first capture)

`awaitStable(page)` in `helpers/stability.ts` must satisfy ALL of:

1. `documentElement.style.opacity === "1"` — the reveal gate (`pages/index.ts` sets it on the rAF after `SparkEditor.init()`).
2. `await page.evaluate(() => document.fonts.ready)` — Courier Prime + system fonts (text metrics; otherwise header title/caption widths shift).
3. `loadProject()` resolved → header sheen gone. Assert by waiting for the title `input[aria-label="Project Name"]` to exist (replaces skeleton) **and** the caption text to be a settled value (`getByText("Saved in cache")` for local).
4. First `CompiledProgramMessage` received (LSP first compile) — needed before diagnostics/preview are stable. Poll `Workspace.ls.getProgram()` truthy via a test hook, or `waitForEvent`-style poll.
5. `Workspace.fs.getFiles("local")` resolved — the Logic/Assets lists render from this. Poll a test hook or wait for the file-list scroller to contain the expected rows / empty-state.

`awaitStable` is called once after navigation and again after any step that triggers an async reload (project switch, file create/delete, preview mode flip).

---

## 5. Cross-app selector strategy

The DOMs share **almost nothing structurally** (from infra investigation "dom-and-selectors"): the baseline is pervasively open-shadow-DOM (`s-button#loadProjectButton` with slotted text), the port is light-DOM Preact with Tailwind classes and no ids. `id`, class, and component-tag selectors are **dead on arrival cross-app**. What both DOMs share is **ARIA role + accessible name + visible text**, and Playwright's `getByRole`/accessible-name computation crosses shadow + slot boundaries.

### Recommended approach (in priority order)

1. **`getByRole(role, { name })`** — primary. Visible button strings ("Load Remote Project", "Import Project", "Export Project", "Sign Out", "Sync With Google Drive", "Publish Online", "New Script", "No Scripts") are byte-identical across `account.html`/`Account.tsx` etc. Both expose a real `<button>` (baseline: shadow `<button class="root">`; port: native).
2. **`getByLabel` / `getByRole("dialog"|"menu"|"menuitem")`** — for the controls that already carry ARIA in the port. Note the baseline often lacks these (see "add shared handles" below).
3. **`getByText(filename)`** — file rows; filename `<span>{name}</span>` identical in both.
4. **External custom-element tags by tag selector** — these are the *same* element in both apps: `sparkdown-script-editor`, `sparkdown-screenplay-preview`, and the game `iframe` (drive via `frameLocator`). No selector work needed.
5. **Shared `data-testid`** — last resort, only at icon-only / duplicated / role-less hotspots. Added to **both apps in the same change**. For the baseline, put the testid on the spec-component **host** (light DOM, directly queryable) or in the `.html` template (renders in shadow, still pierceable by Playwright).

A `helpers/handles.ts` exposes one function per logical element returning a `Locator` from a `Page` (or `FrameLocator`), so a scenario refers to `h.menuButton(page)` and the cross-app resolution lives in one place. Each handle prefers role/text, falling back to the shared testid.

### Concrete shared `data-testid` to add to BOTH apps

These are the role/text-ambiguous or role-less hotspots. Adding them is **prerequisite work for the comprehensive suite** (smoke can run on role/text alone). Each row lists the testid and the port + baseline insertion point.

| testid | Why role/text insufficient | Port file | Baseline file |
|---|---|---|---|
| `editor-host` | host sizing/bg checkpoint | `main/SparkEditor.tsx` (host) | host `spark-editor` (baseline equivalent) |
| `header-bar` | layout/divider checkpoint, no role | `header-navigation/HeaderNavigation.tsx` | `header-navigation/*` |
| `menu-button` | icon-only; baseline lacks `aria-label` | `header-menu-button/HeaderMenuButton.tsx` | `header-menu-button/*.html` |
| `account-drawer` | baseline drawer is `s-drawer` (no `role=dialog`) | `header-menu-button/HeaderMenuButton.tsx` | `header-menu-button/*.html` |
| `bottom-nav` | tablist not uniquely role-named | `main-window/MainWindow.tsx` | main-window baseline |
| `tab-logic` / `tab-assets` / `tab-share` | icon+label tab, cross-app underline/scale checks | `main-window/MainWindow.tsx` | main-window baseline |
| `split-panel-start` / `split-panel-end` / `split-divider` | `[data-panel]`/`[data-separator]` are port-only (react-resizable-panels) | `packages/impower-ui/.../SplitPane.tsx` | baseline split component |
| `preview-pane` | fullscreen target, no role | `preview/Preview.tsx` end-panel wrapper | preview baseline |
| `preview-mode-root` | mode switch root, no DOM | `preview/Preview.tsx` | preview baseline |
| `run-toggle-slot` | PLAY/STOP/spinner slot | `preview-game-toolbar/PreviewGameToolbar.tsx` | baseline |
| `file-list` | virtualization differs; presence assert | `file-list/FileList.tsx` | `file-list/file-list.html` |
| `file-item` (+ `data-filename`) | nested shadow vs div; multiple rows | `file-list/FileItem.tsx` | `file-item/_file-item.ts` (host) |
| `file-options-button` | icon-only, per-row (also has `aria-label="Options"` in port) | `file-list/FileOptionsButton.tsx` | `file-options-button/*` |
| `file-rename-input` | bare input, no label | `file-list/FileItem.tsx` | `_file-item.ts` |
| `file-add-button` / `file-upload-button` / `assets-fab` | icon-only FABs | `file-list/FileAddButton.tsx`, `FileUploadButton.tsx`, `assets/Assets.tsx` | respective baseline |
| `dropzone-overlay` | overlay, no role | `file-dropzone/FileDropzone.tsx` | baseline |
| `sync-caption` | text varies, no role | `header-title-caption/HeaderTitleCaption.tsx` | baseline |
| `share-target-row` (+ `data-target`) | per-row, no aria | `share-game/ShareGame.tsx` | baseline |
| `export-progress-bar` | progress bar, no role | `preview-screenplay-toolbar/*`, `share-screenplay/*` | baseline |
| `conflict-confirm` / `conflict-cancel` | text-only dialog buttons | `header-sync-conflict-toolbar/*` | baseline |

> Controls that already have good cross-app ARIA and need **no** testid: `aria-label="Open Menu"`/`"Close Menu"` (port only — add `menu-button` testid for baseline), `Project Name` input, `Sync`, `Push to remote`, `Pull from remote`, `Back`, `Settings`, `Play Game`/`Stop Game`, `Step/Fast Backward/Forward`, `Play`/`Pause`, `Preview Screenplay`/`Preview Game`, `Download PDF`, `Toggle Preview`, the conflict `role=dialog` + `#dlg-title`, Share `role=tab`. Prefer these.

---

## 6. Determinism & masking

The copy-pasteable neutralization, drawn directly from infra investigation "determinism-masking". Three mechanisms, applied in order: (1) Playwright context knobs + `addInitScript` *before* navigation; (2) `FREEZE_CSS` injected *after* navigation; (3) `getAnimations().finish()` + screenshot-time `mask`/`caret`/`animations`.

### 6.1 Context knobs (in `use:` — see §3 config) + `addInitScript` (before any app JS)

```ts
await context.addInitScript(() => {
  const FIXED = 1718409600000; // 2024-06-15T00:00:00Z
  const _D = Date;
  // @ts-ignore
  globalThis.Date = class extends _D {
    constructor(...a){ super(...(a.length ? a : [FIXED])); }
    static now(){ return FIXED; }
  };
  let seed = 42;
  Math.random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
});
```

Context options (fixed viewport `1280×800`, `deviceScaleFactor:1`, `colorScheme:"dark"`, `reducedMotion:"reduce"`, `forcedColors:"none"`, `locale:"en-US"`, `timezoneId:"UTC"`) live in `use:`. Responsive scenarios override viewport per-test via `page.setViewportSize`.

### 6.2 `FREEZE_CSS` (inject via `page.addStyleTag` after navigation, re-inject after any reload)

```css
*, *::before, *::after {
  transition: none !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
  animation: none !important;
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  animation-play-state: paused !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
/* SMIL <animate> is NOT stopped by CSS animation:none — hide it */
svg animate, svg animateTransform, svg animateMotion { display: none !important; }
/* defensive: opt out of View Transitions if ever added (none today) */
::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
```

- This lands `s-sheen` skeletons and `impower-loading-sweep` at their static 0% frame and stops `animate-spin`. **Preferred over freezing: drive the app to the loaded state so skeletons unmount** (§4 gate); freeze is the fallback for residual.
- **SMIL** (bouncing-dot `Spinner` in `PreviewGameToolbar`) is hidden via the `svg animate{display:none}` rule.

### 6.3 Finish WAAPI + screenshot-time options

```ts
// CSS animation:none does NOT touch element.animate() (Router.tsx, Ripple.tsx)
await page.evaluate(() => document.getAnimations().forEach(a => a.finish()));
```

Every `page.screenshot` (and the diff capture) uses:

```ts
{
  animations: "disabled",   // freezes CSS anims to last frame + finishes finite WAAPI
  caret: "hide",            // hides text-input caret
  maskColor: "#1e1e1e",     // neutral box instead of magenta
  mask: [ ...scenarioMasks ],
}
```

### 6.4 Standing mask set (always applied)

```ts
const ALWAYS_MASK = (scope) => [
  scope.locator("#iframe"),
  scope.locator(".pg-iframe-wrap"),
  scope.locator("#preview"),
  scope.locator(".cm-cursor, .cm-cursorLayer"),
  scope.locator(".cm-selectionLayer, .cm-selectionBackground"),
  scope.locator(".cm-activeLine, .cm-activeLineGutter"),
];
```

Per-scenario masks (e.g. `.cm-content` interior, `export-progress-bar` mid-export, skeleton pills if state not settled) are appended from the scenario catalog (§10).

---

## 7. Assertion layer A: pixel diff

### Capture

Each checkpoint captures **two PNG buffers in memory** (not against a stored golden — live A/B):

```ts
const aBuf = await targetA.screenshot({ animations:"disabled", caret:"hide", maskColor:"#1e1e1e", mask });
const bBuf = await targetB.screenshot({ animations:"disabled", caret:"hide", maskColor:"#1e1e1e", mask });
```

- `target` is a `Locator` (element clip) for region checkpoints (e.g. `h.headerBar(page)`) or `page` for full-viewport. **Prefer element clips** — they isolate the region under test and avoid unrelated drift. The mask `Locator`s must be relative to the same scope.
- Because both contexts share viewport + DPR + fonts, the two PNGs are the same dimensions. If they differ (a real layout-size regression), that itself is a failure — report the size delta and skip pixelmatch.

### Diff

`pngjs` decodes both buffers; `pixelmatch` compares:

```ts
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const a = PNG.sync.read(aBuf), b = PNG.sync.read(bBuf);
if (a.width !== b.width || a.height !== b.height) return sizeMismatchFailure(a, b);
const diff = new PNG({ width: a.width, height: a.height });
const mismatch = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
  threshold: 0.1,          // per-pixel color sensitivity (0..1); 0.1 = ignore AA noise
  includeAA: false,        // ignore anti-aliasing differences
  alpha: 0.4,
  diffColor: [255, 0, 0],
});
const ratio = mismatch / (a.width * a.height);
```

### Thresholds

- **Per-pixel sensitivity** (`pixelmatch.threshold`): `0.1` default (tolerates AA/sub-pixel font rendering between the two builds).
- **Per-checkpoint mismatch ratio gate:** default **`maxDiffRatio = 0.005`** (0.5% of unmasked pixels). Tighter for flat chrome (`0.002` for header bar, dividers), looser for icon-heavy regions (`0.01`). Declared per checkpoint in the catalog; a global default lives in `parity.config.ts`.
- A checkpoint **fails layer A** if `ratio > maxDiffRatio` after the allowlist region-suppression (§9) is applied to the diff buffer (allowlisted regions are zeroed in the diff before recomputing the ratio).

### Masks

The standing mask set (§6.4) plus scenario masks. Masked pixels are painted `#1e1e1e` in *both* screenshots so they are identical and contribute zero to the diff.

### Per-checkpoint artifacts

On any pixel checkpoint, write to `report/artifacts/<scenarioId>/<checkpointId>/`:
- `baseline.png`, `port.png`, `diff.png` (always, even on pass, when `--keep-all`; on fail always).
- `meta.json`: `{ ratio, maxDiffRatio, mismatchPixels, width, height, masks: [...], allowlistApplied: [...] }`.

---

## 8. Assertion layer B: computed-style diff

### Which elements

A curated **style-probe list per checkpoint** (declared in the catalog). Each probe is `{ name, locatorA, locatorB, props }`. Default probes always include the checkpoint's primary element plus any element whose styling is the *point* of the checkpoint (active vs inactive tab, hover/rest state, sync-color state, etc.). Probes resolve via the §5 handles so the same logical element is read in both apps despite DOM divergence.

### Which CSS properties

A **base property set** read for every probe, plus a **per-probe extension**:

```ts
const BASE_PROPS = [
  "display", "position", "boxSizing",
  "width", "height", "minWidth", "minHeight",
  "marginTop","marginRight","marginBottom","marginLeft",
  "paddingTop","paddingRight","paddingBottom","paddingLeft",
  "flexDirection","flexBasis","flexGrow","flexShrink","alignItems","justifyContent","gap",
  "color","backgroundColor","opacity",
  "fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","textAlign","textTransform",
  "borderTopWidth","borderColor","borderStyle","borderRadius",
  "boxShadow","transform","zIndex","overflow",
];
// per-probe extensions, e.g. for tab labels: ["transform"] (scale), for icons: ["fill","stroke","strokeWidth","width","height"]
```

> `transform` captures the tab label `scale-80`/`scale-90` and the underline `translateX`; `strokeWidth` captures the empty-state icon stroke-width=1; `boxShadow`/`backgroundColor` capture fab elevation and hover overlays.

### How snapshots are taken across both DOMs

```ts
async function readComputed(locator, props) {
  return locator.evaluate((el, props) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of props) out[p] = cs.getPropertyValue(cssName(p)) || cs[p];
    // also resolve CSS custom props the chrome relies on:
    out["--theme-color-panel"] = cs.getPropertyValue("--theme-color-panel").trim();
    return out;
    function cssName(p){ return p.replace(/[A-Z]/g, m => "-" + m.toLowerCase()); }
  }, props);
}
```

Because the baseline target may be inside a shadow root, the `Locator` must resolve to the **element that actually carries the visual style** — for `s-button` that is the inner `<button class="root">`, reachable because `getByRole` lands on it. The handle layer (§5) is responsible for returning the style-bearing element, not the wrapper host.

### Diff & tolerance

```ts
function diffStyles(a, b, tol = { px: 1.0 }) {
  const deltas = [];
  for (const k of Object.keys(a)) {
    const av = a[k], bv = b[k];
    if (av === bv) continue;
    // numeric (px) tolerance
    const an = parseFloat(av), bn = parseFloat(bv);
    if (Number.isFinite(an) && Number.isFinite(bn) && /px$/.test(av) && /px$/.test(bv)) {
      if (Math.abs(an - bn) <= tol.px) continue;
    }
    // normalize color formats (rgb vs rgba vs hex) before compare
    if (normColor(av) === normColor(bv)) continue;
    deltas.push({ prop: k, baseline: av, port: bv });
  }
  return deltas;
}
```

- **Tolerance:** colors must match exactly after format normalization (`rgb(x,y,z)` ⇄ `rgba(x,y,z,1)` ⇄ hex); lengths within **±1px** (sub-pixel layout rounding between builds); `transform` matrices within **±0.01** per component; `opacity` within **±0.01**. Everything else exact.
- A probe **fails layer B** if it has any non-allowlisted delta after suppression. The full delta list (including suppressed) is written to the report as a table.

---

## 9. Intentional-diff allowlist

A single source of truth, `allowlist.yaml`, that suppresses **known-intentional** deltas so only real regressions fail. The allowlist scopes a suppression by **scenario + checkpoint + selector + property (style layer) or region (pixel layer)**, and carries metadata that prevents it from quietly hiding new drift.

### File format (YAML)

```yaml
# allowlist.yaml
version: 1
entries:
  - id: bottomnav-padding-restyle
    reason: "Port intentionally restyles bottom-nav padding 8px -> 16px (full-Tailwind direction)."
    owner: lovelle
    created: 2026-06-15
    expires: 2026-09-15          # hard expiry; entry is INVALID after this date (test fails closed)
    review_pr: "https://github.com/.../pull/123"   # required: links the change that justified it
    scope:
      scenario: shell-hydrated-default-logic
      checkpoint: bottom-nav-tabs          # omit to apply to all checkpoints in scenario
      layer: computed-style                # "computed-style" | "pixel" | "both"
      selector: "[data-testid=tab-logic]"  # required for style; for pixel optional (else region)
      property: paddingLeft                # style layer: exact property name
      # exact expected delta — suppression ONLY applies if the observed delta matches:
      expect:
        baseline: "8px"
        port: "16px"

  - id: tab-label-scale-restyle
    reason: "Active label scale 0.9 -> 0.8 intentional."
    owner: lovelle
    created: 2026-06-15
    expires: 2026-09-15
    review_pr: "..."
    scope:
      scenario: shell-hydrated-default-logic
      checkpoint: bottom-nav-tabs
      layer: computed-style
      selector: "[data-testid=tab-logic] .label"
      property: transform
      expect:
        baseline: "matrix(0.9, 0, 0, 0.9, 0, 0)"
        port: "matrix(0.8, 0, 0, 0.8, 0, 0)"

  - id: assets-fab-icon-size
    reason: "Icon size 20 -> 21 intentional in port FAB."
    owner: lovelle
    created: 2026-06-15
    expires: 2026-09-15
    review_pr: "..."
    scope:
      scenario: add-file-fab-script
      checkpoint: fab-enabled
      layer: pixel
      # pixel suppression: rectangle in the SCREENSHOT coordinate space of the captured target,
      # OR a selector whose bounding box (in target coords) is zeroed in the diff buffer:
      region_selector: "[data-testid=file-add-button] svg"
      # region: { x: 12, y: 8, width: 24, height: 24 }   # alternative explicit rect
      max_region_ratio: 0.02   # cap: suppression invalid if the masked region exceeds 2% of target
```

### How an entry scopes a suppression

- **Style layer:** during `diffStyles`, before a delta is reported, the harness checks for an entry matching `scenario + checkpoint + selector + property`. The entry suppresses the delta **only if `observed.baseline === expect.baseline && observed.port === expect.port`** (exact-match required). If the property's delta changed (e.g. baseline now `8px`, port now `20px` not `16px`), the entry does **not** match → the delta fails. This is the core guardrail: an allowlist entry pins the *exact* intentional delta, so any drift *on top of* the intentional one resurfaces.
- **Pixel layer:** the entry's `region_selector` bounding box (resolved in the captured target's coordinate space) or explicit `region` rect is zeroed in the `diff.data` buffer before the mismatch ratio is recomputed. `max_region_ratio` caps how much of the target a single pixel suppression may cover, so an over-broad region can't hide a whole panel.

### Accept-a-diff workflow

1. Run the suite; a checkpoint fails with a reported delta (style table or `diff.png`).
2. Engineer confirms the delta is intentional.
3. Run `npm run parity:accept -- --scenario <id> --checkpoint <id> --layer <style|pixel> --selector "<sel>" [--property <p>]`. This reads the *observed* delta from the last run's `report/.../meta.json` and appends a fully-populated entry (with the exact `expect` values) to `allowlist.yaml`, leaving `reason`/`review_pr`/`expires` as `TODO` placeholders.
4. The engineer fills `reason` + `review_pr` and commits. CI rejects any entry with a `TODO` placeholder or missing required field (see guardrails).

### Guardrails (so the allowlist can't hide real drift)

- **Exact-match required** (above): suppression applies only when the observed delta equals the recorded `expect`. Drift on top of an intentional delta fails.
- **Hard expiry:** `expires` is mandatory. After that date the entry is treated as invalid and the suppression does **not** apply → the test fails, forcing re-review (fail-closed). A nightly job warns 14 days before expiry.
- **Required metadata:** `reason`, `owner`, `created`, `expires`, `review_pr` are all mandatory. A schema validator (`scripts/validate-allowlist.ts`, run in CI and as a Playwright `globalSetup` assertion) fails the run if any entry is missing a field or contains `TODO`.
- **Review required:** any change to `allowlist.yaml` requires PR review (enforce via `CODEOWNERS` on the file). The `review_pr` link makes the justification auditable.
- **Caps:** pixel `max_region_ratio` caps suppression area; the validator rejects entries above a global ceiling (default 5%).
- **Usage report:** every run records which entries were *actually applied*. Entries not applied for N runs are flagged as stale/removable in the report (a no-longer-needed suppression is itself drift to clean up).
- **No wildcards on property:** style suppressions must name an exact `property` (no `property: "*"`), so an entry can't blanket-suppress a whole probe.

---

## 10. Comprehensive scenario catalog

All scenarios from the inventory, deduped and grouped. IDs are reused from the inventory where present. Cross-area duplicates are resolved: the FileList/FileItem/Logic-scripts widgets appear in both "File Management" and "Logic" inventories — they are catalogued **once** under FILE/ASSETS and referenced from LOGIC. The `shell-game-fullscreen` and `game-fullscreen-enter-exit` duplicates are merged. Notation: **CP** = checkpoint; masks beyond the §6.4 standing set are listed.

> Legend — priority: `critical` / `high` / `medium` / `low`. Every checkpoint runs **both** assertion layers unless marked `(pixel-only)` or `(style-only)`.

### Area A — Editor Shell + Navigation

**SHELL-01 `shell-initial-load-ssr-chrome`** — SSR chrome before hydration. *(priority: critical)*
- Steps: navigate cold; capture the first SSR paint **before** hydration (block the page's module script via `page.route` abort of `/index.js` for the pre-hydration capture, then unblock + reload for steady-state — or capture in the window before `opacity===1`). Note MainWindow skips `<SplitPane>` during SSR.
- CP: `ssr-fullviewport` (full viewport; middle region empty between header and bottom-nav); `host-style` (style-only: `editor-host` → display:flex, flex-direction:column, height:100vh, min-height:0, background `var(--theme-color-panel)`); `header-geometry` (header h-14/56px); `bottomnav-geometry` (60px); `tabs-no-active` (all tabs inactive, value pinned `__none__`).
- Masks: skeleton pills (state not yet settled).

**SHELL-02 `shell-hydrated-default-logic`** — hydrated steady state, Logic active. *(critical)*
- CP: `hydrated-fullshell` (header + split[Logic|Preview] + bottom-nav); `bottom-nav-tabs` (style: active Logic vs inactive Assets/Share — icon crossfade opacity, label `scale-90` vs `scale-80`, `text-tab-foreground` vs `text-engine-500`); `split-divider-default` (50/50, divider position); `dividers` (1px bottom-nav top divider white/6%, 1px header bottom divider foreground/6%).
- Masks: `#preview` (standing), `.cm-content`.

**SHELL-03 `shell-switch-to-assets`** — Logic → Assets. *(critical)*
- Steps: click `tab-assets`; **wait for `data-state` stable** (don't capture mid-crossfade); `getAnimations().finish()`.
- CP: `assets-settled` (Assets pane + active Assets tab); `tab-states` (style: Assets `data-state=active`, others inactive). Drop the inventory's "mid-transition" pixel CP — non-deterministic; replaced by settled-only.
- Masks: standing; Router fade neutralized via `finish()`.

**SHELL-04 `shell-switch-to-share`** — Assets → Share. *(high)*
- CP: `share-settled`; `share-tab-active` (style; underline indicator NOT shown — MainWindow `indicator='none'`); `others-inactive`.

**SHELL-05 `shell-switch-back-to-logic`** — Share → Logic round-trip. *(high)*
- CP: `logic-list-settled` (Logic **list** view default); `roundtrip-parity` (Logic-active tab styling identical to SHELL-02).

**SHELL-06 `shell-split-pane-drag-resize`** — divider drag (≥960px). *(high)*
- Steps: viewport 1280; hover divider (capture rest + fully-hovered settled, not mid-fade); drag to a **fixed pixel target** via `mouse.move` so layout is deterministic; capture at 320px min-clamp.
- CP: `divider-rest` (style: 8px hit area, ::before 1px white/6%, ::after opacity 0); `divider-hover` (::after opacity ~1, primary color — capture after settle); `divider-min-clamp` (panel at 320px); `panel-basis` (style: flex-basis % before/after — **drag to fixed target** so deterministic).
- Masks: standing.

**SHELL-07 `shell-responsive-collapse-mobile`** — collapse <960px. *(critical)*
- Steps: `page.setViewportSize({width:720,height:800})`.
- CP: `collapsed-single-pane` (single editor pane full width, no divider, `PreviewToggleButton` visible); `collapse-style` (style: `split-divider` display:none, `split-panel-start` flex `1 1 100%`, `split-panel-end` display:none); `preview-toggle-view` (label 'VIEW', aria-pressed=false, eye icon); `bottomnav-unchanged`.

**SHELL-08 `shell-preview-toggle-mobile`** — VIEW→EDIT expand. *(critical)*
- Steps: at 720px, click `Toggle Preview`; drive via store hook if click is racy.
- CP: `preview-expanded` (full-width black Preview pane — **masked**, assert toolbar chrome only; button 'EDIT' + pencil, aria-pressed=true); `expanded-style` (`split-panel-end` flex `1 1 100%`, `split-panel-start` display:none); `collapse-back` (editor again, button 'VIEW').
- Masks: `#preview`, `#iframe`.

**SHELL-09 (merge of `shell-desktop-toggle-hidden`)** — desktop toggle hidden. *(high)*
- Steps: viewport 1280.
- CP: `both-panes-visible` (editor + Preview + divider); `toggle-hidden` (style: `PreviewToggleButton` wrapper display:none at ≥960px).

**SHELL-10 (merge `shell-game-fullscreen` + `game-fullscreen-enter-exit`)** — game-initiated fullscreen. *(low; gated `--with-player`)*
- Steps: requires running game; trigger via player message. Baseline-only meaningful (player origin pin).
- CP: `fullscreen-entered` (`#preview` fills viewport — masked; assert `document.fullscreenElement` set, not pixels); `fullscreen-exited` (shell restored).
- Masks: entire `#preview`. **Note:** mostly a state/geometry assertion, not pixel — canvas always masked.

**SHELL-11 `shell-deep-link-pane-restore`** — reload restores persisted pane. *(medium)*
- Steps: seed `workspace/local` with `pane:"assets"`; reload; capture pre-restore (`__none__`) and settled.
- CP: `pre-restore` (workspaceReady=false, all tabs inactive); `restored-settled` (persisted pane active, correct Router child); assert no flash of Logic-active.

### Area B — File Management + Assets

**FILE-01 `assets-list-files-loaded`** — list renders after load. *(critical)*
- Steps: seed fixture with ≥3 asset files; navigate Assets > Files; stub via fixed OPFS fixture so `getFiles` resolves to a fixed set (no async-null window).
- CP: `files-loaded` (FileItem rows, sorted by ext then name); `file-row-style` (style: row h-14/56px, px-5, pl-8 inner, text-base, `text-foreground/80`).

**FILE-02 `assets-empty-state-files`** — empty state. *(high)*
- CP: `empty-files` (`fl-empty-border`, mx-6 mt-4, border, opacity-70; Files icon size-12 + 'No Files'); `empty-icon-stroke` (style: stroke-width=1 via injected style); `fab-anchored` (FAB over empty state).

**FILE-03 `assets-empty-state-urls`** — URLs empty state. *(high)*
- CP: `urls-empty` (Link icon + 'No URLs'); `fab-add-url` (FAB label 'Add URL' + Plus). Capture after slide settled.

**FILE-04 `assets-switch-subtabs`** — Files ⇄ URLs. *(high)*
- Steps: click URLs tab; `finish()`; drop the "mid-transition" CP (non-deterministic).
- CP: `files-active` (indicator under Files); `urls-active` (indicator under URLs, FAB 'Add URL'); `fab-shell-opacity` (style: FAB shell opacity 1 throughout, only inner spans cross-fade).

**FILE-05 `open-file-click-row`** — open file by row click. *(critical)*
- CP: `row-rest` (ghost variant); `row-hover` (hover bg — `page.hover` then capture); `editor-open` (editor opens — assert chrome; mask `.cm-content`).

**FILE-06 `add-file-fab-script`** — Logic>Scripts New Script FAB. *(critical)*
- Steps: navigate Logic > Scripts; wait FAB fade-in (delay-150); click FAB.
- CP: `fab-enabled` (variant=fab size=fab, Plus + 'New Script'); `fab-disabled-sync` (style: drive `syncStatus=syncing` via hook → disabled/opacity); `new-row-present` (after create); `auto-open` (single .sd auto-opens — chrome only).

**FILE-07 `add-url-fab`** — Add URL. *(high)*
- CP: `fab-add-url`; `url-row-present` (sorted); `fab-disabled-sync`.

**FILE-08 `upload-file-fab`** — upload via hidden input (fixture injection, NEVER native picker). *(critical)*
- Steps: do **not** click the FAB (opens native picker — freezes renderer, per memory). Inject a `FileList` onto the hidden `input[type=file]` and dispatch `change` via `page.evaluate` / `setInputFiles` on the hidden input directly.
- CP: `fab-upload` (Upload icon + 'Upload Files'); `hidden-input` (style/attrs: class hidden, accept `image/*, audio/*, video/*, .txt`, multiple); `rows-after-upload`; assert `input.value` reset to `''`.

**FILE-09 `upload-file-button-component`** — standalone FileUploadButton. *(medium)*
- CP: `enabled` (Upload icon + label); `disabled-sync`; `input-attrs` (accept/multiple match props).

**FILE-10 `rename-file-via-options`** — rename via 3-dots. *(critical)*
- Steps: open options menu (Radix portal at body — scope selector to `[role=menu]` under body, NOT under row); click Rename; capture inline input with basename selected; type; Enter.
- CP: `dropdown-open` (Rename + Delete items — capture after open settles; mask ripple); `rename-input-active` (style: input visible; **mask selection/caret region**); `renamed-label` (ext span opacity-30 if ext && ≠'sd').
- Masks: `.s-ripple`, input selection region.

**FILE-11 `rename-cancel-escape`** — Escape cancels. *(high)*
- CP: `input-active`; `label-restored` (original name unchanged).

**FILE-12 `rename-no-change-noop`** — no-op rename. *(medium, style-only/state)*
- CP: `label-unchanged` (no renameFiles call — assert via no DOM change).

**FILE-13 `rename-click-outside-commit`** — outside click commits. *(high)*
- CP: `committed-label`.

**FILE-14 `delete-file-via-options`** — delete via 3-dots. *(critical)*
- CP: `dropdown-delete`; `row-removed` (after delete + reload).

**FILE-15 `options-menu-disabled-while-syncing`** — disabled during sync. *(high)*
- Steps: drive `syncStatus=syncing`; open menu.
- CP: `items-disabled` (style: `data-[disabled]` opacity-50 on Rename & Delete).

**FILE-16 `dropzone-drag-hover`** — drag overlay. *(critical)*
- Steps: dispatch synthetic `dragenter`/`dragover` DragEvents on window (NOT real OS drag).
- CP: `overlay-absent` (before); `overlay-visible` (Download icon size-16 stroke-width=1 + 'Import Project Files' on bg-engine-900, text-xl font-semibold, inset-0 z-[2]); `overlay-hidden` (after dragleave).

**FILE-17 `dropzone-drop-assets`** — drop loose assets. *(high)*
- Steps: synthetic `drop` DragEvent with `dataTransfer.files` (fixture File objects).
- CP: `overlay-visible-during`; `rows-after-drop` (overlay hidden, new rows).

**FILE-18 `dropzone-drop-zip-project`** — drop single .zip → import. *(high)*
- CP: `overlay-hidden-after`; `fabs-disabled-importing` (style: syncStatus=importing).

**FILE-19 `dropzone-protocol-relayed-drag`** — host-relayed protocol drag. *(medium)*
- Steps: dispatch `DragFilesEnter/Over/Leave` + `DropFiles` CustomEvents on window.
- CP: `overlay-toggle`; `protocol-import` (same import path).

**FILE-20 `diagnostics-badge-error`** — error red. *(high)*
- Steps: seed `workspace.state.debug.diagnostics` with severity-1 for the file (stub via hook).
- CP: `label-danger` (style: color `text-danger-500`).

**FILE-21 `diagnostics-badge-warning`** — warning yellow. *(high)*
- CP: `label-warning` (style: `text-warning-500`; error outranks warning if both).

**FILE-22 `diagnostics-badge-none`** — default color. *(medium)*
- CP: `label-default` (no danger/warning class; `text-foreground/80`).

**FILE-23 `logic-scripts-tab-aggregate-diagnostics`** — Logic Scripts/Main tab color. *(medium)*
- CP: `scripts-tab-colored` (non-main diagnostic); `main-tab-colored` (main.sd only); `both-clean-default`.

**FILE-24 `logic-scripts-list-empty`** — 'No Scripts'. *(medium)*
- CP: `empty-scripts` (Book icon + 'No Scripts'); `fab-newscript-faded`.

**FILE-25 `list-scroll-virtualized`** — virtualization. *(high)*
- Steps: seed many files; pin scroll container size; capture at scrollTop=0 then a fixed scrollTop.
- CP: `initial-window` (visible rows + chrome); `after-scroll` (different window — **mask the row text interiors** which differ by overscan; assert FAB stays anchored absolute inset-x-0 bottom-0); `fab-fixed`.
- Masks: row content interior beyond a known-stable first row.

**FILE-26 `reload-on-project-switch`** — list reloads on project change. *(high)*
- CP: `list-reloaded`; `no-project-empty` (no projectId → empty immediately).

**FILE-27 `fab-disabled-during-sync`** — all FABs disabled. *(medium)*
- CP: `fabs-disabled` (style: disabled attr + reduced opacity on FileAddButton/FileUploadButton/AssetsFab); `re-enabled` (after status clears).

### Area C — Logic + Script Editor

**LOGIC-01 `open-logic-view-default-list`** — Logic defaults to list/Main editor. *(critical)*
- Steps: navigate Logic; wait `<sparkdown-script-editor>` mount + ConnectedEditorMessage + main.sd load (poll for `.cm-content` lines).
- CP: `subtab-bar` (Main active+underline, Scripts inactive); `main-route-mounted`; `editor-visible` (after load, `.editor` opacity 1, gutter line numbers — **mask `.cm-content` interior**, compare gutter text + chrome); `loadingbar-hidden`.
- Masks: standing + `.cm-content` interior, inline diagnostics.

**LOGIC-02 `switch-to-scripts-list`** — Scripts sub-tab + list. *(critical)*
- Steps: click Scripts; `finish()`; wait FAB delay-150.
- CP: `underline-scripts` (after settle); `scripts-filelist` (one row per non-main .sd); `filitem-shape` (basename span + dimmed ext if ≠sd + 3-dot); `newscript-fab`.

**LOGIC-03 `scripts-empty-state`** → covered by FILE-24 (deduped).

**LOGIC-04 `open-script-in-editor`** — open script in multi-script editor. *(critical)*
- CP: `subtabs-gone` (showScriptsEditor branch); `nav-header` (FileEditorNavigation: ArrowLeft Back left, centered rename input, 56px right spacer); `editor-loaded` (chrome + gutter; mask content); `rename-input-value` (=== basename, diagnostic-colored if errors).

**LOGIC-05 `scroll-editor`** — scroll CodeMirror. *(high)*
- Steps: scroll `.cm-scroller`; pin viewport.
- CP: `chrome-fixed` (toolbar/header/back/tabs fixed — compare); `gutter-numbers` (compare numbers, **mask measured pixel layout**); content interior **masked**.

**LOGIC-06 `editor-diagnostics-gutter`** — diagnostics color + gutter. *(high)*
- Steps: stub LSP diagnostics fixed; wait settle.
- CP: `main-tab-color`; `scripts-tab-aggregate`; `rename-header-color`; `filitem-color` (via DiagnosticsLabel); `gutter-present` (compare); inline decorations **masked**.

**LOGIC-07 `multiple-scripts-navigation`** — open/back/open/rename. *(high)*
- CP: `back-to-list` (sub-tabs restored); `script-b-loaded` (B's chrome); `rename-commit` (renamed; editor reopens under new name — chrome).

**LOGIC-08 `editor-readonly-during-sync`** — readonly during sync. *(medium)*
- Steps: drive sync.status=syncing.
- CP: `readonly-attr` (style/attr: readonly on `<sparkdown-script-editor>`); `readonly-cleared` (after clear).

**LOGIC-09 `editor-loading-bar`** — loading bar above editor. *(medium)*
- Steps: capture only settled states (idle/complete); mask in-progress fill.
- CP: `bar-width-main` (style: --loading-indicator-width 50% under Main); `bar-100-scripts` (100% in scripts-editor view); in-progress fill **masked**.

### Area D — Preview (game + screenplay)

> **Game canvas (`#iframe`, `#preview`, `.pg-iframe-wrap`) is ALWAYS masked.** Toolbar state is driven via `workspace.state.value.preview.modes.game` store hooks rather than relying on a live player where possible.

**PREVIEW-01 `toggle-game-to-screenplay`** — Game → Screenplay via toolbar. *(critical)*
- CP: `game-toolbar` (PreviewGameToolbar 'Game Preview' title, RunToggle PLAY, Notes icon right — mask iframe); `mode-screenplay` (state); `screenplay-toolbar` (PreviewScreenplayToolbar 'Screenplay Preview' + PDF left + Gamepad right — mask `.cm-content`).

**PREVIEW-02 `toggle-screenplay-to-game`** — Screenplay → Game. *(critical)*
- CP: `screenplay-before` (mask content); `mode-game` (state); `game-after` (toolbar; iframe masked).

**PREVIEW-03 `game-run-toggle-play`** — PLAY. *(critical)*
- Steps: drive `running` via store or click; with player absent, drive store.
- CP: `pre-run` (PLAY, 'Game Preview', Notes — mask iframe); `post-run` (STOP, 5 playback buttons centered, Gear right — mask iframe).

**PREVIEW-04 `game-run-toggle-stop`** — STOP. *(high)*
- CP: `running-toolbar`; `stopped-toolbar`.

**PREVIEW-05 `game-loading-spinner`** — loading spinner. *(high)*
- Steps: drive `loading=true`.
- CP: `loading-toolbar` (spinner present — **SMIL `<animate>` hidden via FREEZE_CSS**; mask run-toggle slot interior); `after-loading` (PLAY/STOP).

**PREVIEW-06 `game-pause-resume`** — pause/resume. *(medium)*
- CP: `not-paused` (Pause icon, aria-label 'Pause'); `paused` (Play icon, aria-label 'Play' — mask iframe).

**PREVIEW-07 `game-scrub-hold`** — hold-to-scrub. *(medium)*
- CP: `playback-row` (all 5 buttons — compare chrome only; iframe masked, rAF-driven).

**PREVIEW-08 `game-settings-debug-toggle`** — Debugging toggle. *(medium)*
- CP: `dropdown-open` (Debugging item, after settle); `debug-on` (Check icon); `debug-off` (BugOff icon).

**PREVIEW-09 (merge `game-fullscreen-enter-exit` into SHELL-10)** — deduped.

**PREVIEW-10 `game-pageup-pagedown-traverse`** — PageUp/Down source traverse. *(low)*
- CP: `pageup-moves` (editor selection/scroll — editor pane comparable, iframe masked); `pagedown-moves`.

**PREVIEW-11 `screenplay-scroll`** — scroll screenplay. *(high)*
- CP: `top-of-doc` (sticky toolbar 'Screenplay Preview' comparable; mask CM body+caret); `after-scroll` (toolbar sticky/visible; content masked).

**PREVIEW-12 `screenplay-pdf-export-progress`** — PDF export progress. *(medium)*
- CP: `idle` (progress bar opacity 0, PDF enabled); `mid-export` (button disabled — **mask `export-progress-bar`**, scaleX non-deterministic); `post-export` (bar opacity 0, re-enabled).

**PREVIEW-13 `preview-toggle-button-mobile`** → covered by SHELL-08 (button is in HeaderNavigation). Add CP `external-sync` (after `DidExpand/CollapsePreviewPaneMessage`, button state matches without click). *(high)*

**PREVIEW-14 `screenplay-reload-on-file-change`** — reload on file change. *(medium)*
- CP: `body-updated` (mask CM text+caret; verify a change occurred, not exact pixels — assert via content-presence, not pixel).

### Area E — Header + Account + Share + Sync

**HEADER-01 `header-shell-render`** — header layout. *(critical)*
- CP: `header-ge960` (full layout ≥960, toggle hidden); `header-lt960` (toggle visible at 720); `bottom-divider`.

**HEADER-02 `header-ctrl-s-sync`** — Ctrl+S sync. *(high)*
- Steps: focus window; `page.keyboard.press("Control+S")`; assert default prevented; drive/observe caption.
- CP: `sync-caption-after` (caption settled state).

**HEADER-03 `open-menu-drawer`** — open drawer. *(critical)*
- Steps: click `menu-button`; `finish()` slide.
- CP: `drawer-closed` (style: overlay opacity-0, drawer -translate-x-full, still mounted); `drawer-open` (overlay + Account panel; close ArrowLeft, 'Spark Engine' wordmark, SparkLogo SVG, divider). Drop "mid-slide" CP (non-deterministic).
- Masks: account displayName/email (stub or mask).

**HEADER-04 `close-menu-drawer`** — close via button/overlay/Escape. *(high)*
- CP: `after-close-button`; `after-overlay-click`; `after-escape`.

**HEADER-05 `drawer-autoclose-picking-resource`** — auto-close on picker. *(medium)*
- Steps: drive `pickingResource=true`.
- CP: `drawer-closed-menu-disabled` (style: menu button disabled).

**HEADER-06 `account-unauthenticated`** — unauth layout. *(critical)*
- CP: `unauth-panel` (Import Project/Download, Export Project/Upload, spacer, 'Sync With Google Drive'/BrandGoogleDrive; hidden input accept=.zip).

**HEADER-07 `account-hover-import`** — hover/press overlays. *(high)*
- Steps: `page.hover`; capture rest + hover + active (press via `mouse.down`, `finish()` ripple).
- CP: `import-rest`; `import-hover` (style: `hover:bg-foreground/5`); `import-active` (style: `active:bg-foreground/[0.12]`; mask ripple).

**HEADER-08 `account-import-disabled-offline`** — disabled offline. *(medium)*
- CP: `disabled-import-export` (style: `disabled:opacity-50`, pointer-events-none).

**HEADER-09 `account-export-project`** — export zip. *(medium)*
- CP: `after-export-click` (state; downloadFile invoked — assert via download event listener, not pixels).

**HEADER-10 `account-signin-cta`** — CTA variants. *(medium)*
- CP: `cta-sync` ('Sync With Google Drive'); `cta-grant` ('Grant Access To Google Drive' — drive `info.uid` set, consented false).

**HEADER-11 `account-authenticated`** — auth layout. *(critical)*
- Steps: intercept `/api/auth/account` fixed on both.
- CP: `auth-panel` (Load Remote/Download + Save Remote/Upload fab-bg FabRows; spacer; account row displayName truncate + email opacity-70 — **mask the dynamic name/email text or use fixed fixture values**).

**HEADER-12 `account-signout-popup`** — sign out popup. *(high)*
- CP: `popup-open` (role=menu, 'Sign Out'/Logout); `after-signout`; `after-outside-click`; `after-escape`.

**HEADER-13 `account-load-remote`** — load remote pick. *(medium)*
- CP: `during-pick` (state; picker is native — drive via hook, don't click native picker).

**HEADER-14 `account-save-remote`** — save remote pick. *(medium)*
- CP: `during-folder-pick` (state).

**HEADER-15 `title-skeleton`** — title/caption skeleton. *(high)*
- Steps: capture BEFORE loadProject resolves (block/delay the loadProject path) — narrow window; or assert the skeleton element shape with `s-sheen` frozen at 0%.
- CP: `title-skeleton` (sheen pill sized 'Untitled Game', 21px); `caption-skeleton` (sized 'Saved in cache'). Both with `FREEZE_CSS` so sheen is static.
- Masks: none (frozen).

**HEADER-16 `title-loaded`** — editable input. *(critical)*
- CP: `loaded-input` (input aria-label 'Project Name', text-lg font-medium); `caption-resolved` ('Saved in cache').

**HEADER-17 `rename-commit-enter`** — rename via Enter. *(critical)*
- CP: `input-focused` (text selected — **mask selection**); `after-typing`; `after-enter` (persists; caption may flip 'Unsynced changes' — drive deterministically).

**HEADER-18 `rename-commit-blur`** — rename on blur. *(high)*
- CP: `after-blur`.

**HEADER-19 `rename-ripple`** — title ripple. *(low)*
- CP: `ripple-wave` (mask — non-deterministic; or `finish()` and assert box shape only). Marked low; consider style-only.

**HEADER-20 `rename-external-update`** — external rename. *(medium)*
- CP: `input-after-external` (draft reset to new persisted name).

**SYNC-01 `sync-hidden-local`** — sync toolbar hidden (local). *(high)*
- CP: `no-sync-button` (HeaderSyncToolbar null for LOCAL_PROJECT_ID).

**SYNC-02 `sync-synced`** — synced/idle. *(critical)*
- Steps: drive sync.status=synced via hook (avoid network).
- CP: `synced-button` (ghost Refresh, text-foreground, not spinning, enabled); `synced-caption` ('Synced online ✓', text-foreground/60).

**SYNC-03 `sync-unsynced`** — unsynced. *(high)*
- CP: `unsynced-button` (Refresh text-primary); `unsynced-caption` ('Unsynced changes', text-primary).

**SYNC-04 `sync-busy-spin`** — busy/spinning. *(high)*
- CP: `syncing` (Refresh `animate-spin` **frozen via FREEZE_CSS**, button disabled, 'Syncing...'); `loading` ('Loading...'). Capture settled-frozen, not mid-rotation.

**SYNC-05 `sync-error`** — error states. *(high)*
- CP: `error-button` (Refresh text-danger-500, enabled); `error-caption` (red 'Error: Could not ...').

**SYNC-06 `sync-offline`** — offline. *(medium)*
- CP: `offline-button` (Refresh text-warning-500); `offline-caption` ('Cannot sync while offline', warning-500).

**SYNC-07 `sync-click`** — sync click. *(high)*
- CP: `after-sync-click` (transitions to syncing).

**SYNC-08 `sync-conflict-toolbar`** — conflict toolbar. *(critical)*
- CP: `conflict-toolbar` (amber PUSH/ArrowUp + PULL/ArrowDown); `conflict-caption` ('Sync conflict detected', warning-500).

**SYNC-09 `conflict-push-dialog`** — push dialog. *(high)*
- CP: `push-dialog-open` (role=dialog, 'Push and overwrite remote file?', Cancel + 'Yes, overwrite remote file'); `after-close` (Cancel/overlay/Escape); `after-confirm`.

**SYNC-10 `conflict-pull-dialog`** — pull dialog. *(high)*
- CP: `pull-dialog-open` ('Pull and overwrite local changes?', 'Yes, overwrite my changes'); `after-close`; `after-confirm`.

**SHARE-01 `open-share-pane`** — open Share. *(critical)*
- CP: `share-initial` (sticky Game/Screenplay sub-tabs, Game active).

**SHARE-02 `share-switch-subtabs`** — Game ⇄ Screenplay. *(high)*
- Steps: click Screenplay (Binder), then Game (Pacman); `finish()`; arrow-key roving nav check.
- CP: `screenplay-route`; `game-route`. Drop "mid slide-x" CP (non-deterministic).

**SHARE-03 `share-game-targets`** — Game target rows. *(high)*
- CP: `game-targets` (4 OptionButton rows: Spark Cartridge/.s.png, HTML5 App/.zip, Android/.apk, iOS/.ipa; per-row Settings Gear; 'Publish Online' outline below).

**SHARE-04 `share-game-row-interactions`** — row/settings hover/press. *(medium)*
- CP: `row-hover` (ghost hover); `settings-hover`; `settings-click` (stopPropagation, no action).

**SHARE-05 `share-screenplay-rows`** — Screenplay export rows. *(high)*
- CP: `screenplay-rows` (Screenplay PDF/.pdf, Screenplay HTML/.html, Copy Work Text, Copy Work Skin; PDF/HTML have Settings Gear).

**SHARE-06 `share-screenplay-export-progress`** — export progress. *(high)*
- Steps: stub export progress to fixed values, or capture idle/complete only; mask mid.
- CP: `export-idle` (scaleX 0); `export-mid` (**mask `export-progress-bar`**); `export-complete` (reset).

**NAV-01 `file-editor-nav-back`** — sticky back nav. *(high)*
- CP: `nav-header` (h-12 bg-engine-900: Back ArrowLeft, centered truncating title, 56px spacer); `after-back-click`.

**NAV-02 `file-editor-nav-title-truncate`** — long title truncates. *(low)*
- CP: `long-title-truncated` (ellipsis, centered, doesn't push back button).

---

## 11. Project layout & tooling

**Location:** top-level `e2e-visual-parity/` in this repo (`impower-preact-port/e2e-visual-parity/`). Rationale: it builds and drives **both** repos (this one + `../impower`), so it should not live under `impower-dev` (which is one of the two subjects). It has its own `package.json` so its heavy devDeps (Playwright, pixelmatch) don't bloat `impower-dev`. The root monorepo `package.json` gets a passthrough script.

```
impower-preact-port/
├─ e2e-visual-parity/
│  ├─ package.json                # own deps; scripts below
│  ├─ playwright.config.ts        # §3
│  ├─ global-setup.ts             # §3: build + health-check both stacks
│  ├─ parity.config.ts            # default thresholds, prop sets, paths to both repos
│  ├─ allowlist.yaml              # §9
│  ├─ helpers/
│  │  ├─ seed.ts                  # §4 seedProject
│  │  ├─ stability.ts             # §4 awaitStable
│  │  ├─ determinism.ts           # §6 FREEZE_CSS, initScript, finishAnimations
│  │  ├─ handles.ts               # §5 cross-app Locator resolution
│  │  ├─ workspace-hooks.ts       # drive workspace store/signals (syncStatus, diagnostics, preview modes)
│  │  ├─ pixel-diff.ts            # §7 capture + pixelmatch + artifacts
│  │  ├─ style-diff.ts            # §8 readComputed + diffStyles
│  │  ├─ allowlist.ts             # §9 load/validate/apply suppression
│  │  └─ parity-fixture.ts        # the test fixture wiring A+B contexts + both layers
│  ├─ fixtures/
│  │  ├─ basic/                   # main.sd, .name, a few asset files, workspace/local JSON
│  │  ├─ many-files/              # virtualization fixture
│  │  ├─ with-diagnostics/        # seeds diagnostics fixture
│  │  └─ index.ts                 # fixture loader → {projectName, mainSd, files[], workspaceState}
│  ├─ tests/
│  │  ├─ shell.spec.ts            # SHELL-*
│  │  ├─ files-assets.spec.ts     # FILE-*
│  │  ├─ logic-editor.spec.ts     # LOGIC-*
│  │  ├─ preview.spec.ts          # PREVIEW-*
│  │  ├─ header-account.spec.ts   # HEADER-*
│  │  ├─ sync.spec.ts             # SYNC-*
│  │  └─ share-nav.spec.ts        # SHARE-*, NAV-*
│  ├─ scripts/
│  │  ├─ validate-allowlist.ts    # CI guard: schema, TODO, expiry, caps
│  │  ├─ accept-diff.ts           # parity:accept workflow (§9)
│  │  └─ build-report.ts          # §12 HTML summary generator
│  ├─ golden/                     # CI variant: committed golden PNGs + style JSON (per checkpoint)
│  └─ report/
│     ├─ artifacts/<scenario>/<checkpoint>/{baseline,port,diff}.png + meta.json
│     ├─ style-diffs/<scenario>/<checkpoint>.json
│     ├─ index.html               # §12
│     └─ run-meta.json
```

**npm deps** (`e2e-visual-parity/package.json` devDependencies): `@playwright/test`, `pixelmatch`, `pngjs`, `yaml`, `cross-env`. (`@adobe/css-tools` already in impower-dev for color normalization if reused; otherwise normalize inline.)

**npm scripts** (`e2e-visual-parity/package.json`):
```jsonc
{
  "scripts": {
    "parity": "playwright test",
    "parity:dev": "cross-env PW_DEV=1 playwright test",
    "parity:smoke": "playwright test --grep @critical",
    "parity:with-player": "cross-env PW_WITH_PLAYER=1 playwright test",
    "parity:golden": "cross-env PW_GOLDEN=1 playwright test",          // CI variant (§12)
    "parity:golden:update": "cross-env PW_GOLDEN=update playwright test",
    "parity:accept": "tsx scripts/accept-diff.ts",
    "parity:validate-allowlist": "tsx scripts/validate-allowlist.ts",
    "parity:report": "tsx scripts/build-report.ts && playwright show-report report/playwright"
  }
}
```
Root `impower-preact-port/package.json` adds: `"parity": "npm --prefix e2e-visual-parity run parity"`.

Tag scenarios with Playwright annotations (`@critical`, `@high`, …) so `--grep @critical` drives the smoke subset.

---

## 12. Reporting

### Per-checkpoint artifacts

For every checkpoint (always on failure; on pass when `--keep-all`):
- `report/artifacts/<scenarioId>/<checkpointId>/baseline.png`, `port.png`, `diff.png` (pixelmatch output, allowlisted regions visibly tinted to show they were suppressed).
- `report/artifacts/.../meta.json`: `{ ratio, maxDiffRatio, mismatchPixels, width, height, masks, allowlistApplied }`.
- `report/style-diffs/<scenarioId>/<checkpointId>.json`: `{ probes: [ { name, deltas:[{prop,baseline,port,suppressedBy}] } ] }`.

### HTML summary (`scripts/build-report.ts` → `report/index.html`)

A static page (no server) listing every scenario → checkpoint with:
- Pass/fail badge per layer (pixel / style) and overall.
- Side-by-side `baseline.png | port.png | diff.png` thumbnails (click to enlarge).
- A **computed-style diff table** per failing probe: columns `property | baseline | port | Δ | suppressed-by`.
- Run metadata header (both repo SHAs, mode, viewport, date) from `run-meta.json`.
- An **allowlist usage section**: applied entries, and stale (unused for this run / nearing expiry) entries flagged for cleanup.

### Computed-style diff tables

Rendered from `style-diffs/*.json`. Suppressed deltas are shown greyed with the suppressing entry id linked to its `allowlist.yaml` line (and `review_pr`). Unsuppressed deltas are red and counted toward failure.

### CI integration

- GitHub Actions job: checkout both repos (this repo + `../impower` at `main`), `npm ci` in both `impower-dev`s + `e2e-visual-parity`, `npx playwright install --with-deps chromium`, run `npm run parity:validate-allowlist` (fail fast on bad allowlist), then `npm run parity` (prod build mode, `reuseExistingServer:false`).
- Upload `report/` as a build artifact; on PRs, post a summary comment with pass/fail counts and links.
- **Golden-snapshot CI variant** (`PW_GOLDEN=1`): instead of (or in addition to) live A/B, compare the **port** capture against a committed golden under `golden/` (the baseline's last-blessed capture + style JSON). Use this when the baseline repo isn't checked out in CI, or to detect *port* drift independent of baseline availability. `PW_GOLDEN=update` regenerates goldens from a live baseline run (review the PNG diff before committing). Live A/B remains the default locally because it self-updates as the baseline evolves and needs no committed binaries.
- Pixel diffs are anti-aliasing-sensitive across OS/GPU. **Pin the CI runner OS** (e.g. `ubuntu-latest`) and run goldens generated on the same OS; for live A/B both stacks run on the same runner so OS rendering cancels out. Document that local macOS/Windows runs may show higher AA noise — keep `pixelmatch.threshold` at `0.1` and rely on the per-checkpoint ratio gate.

---

## 13. Phased rollout & effort estimate

| Phase | Scope | Deliverable | Rough effort |
|---|---|---|---|
| **P0 — Infra** | `playwright.config.ts`, `global-setup` (build + health-check both stacks, prod mode, empty player origin), determinism helpers (`FREEZE_CSS`, initScript, finish-animations), seed helper (OPFS + localStorage reset/write), `awaitStable` gate. | Two stacks boot reliably; one throwaway "blank load" test passes both layers. | 3–4 days |
| **P1 — Handles + 2 layers** | `handles.ts` cross-app resolution, `pixel-diff.ts`, `style-diff.ts`, `parity-fixture.ts`, `allowlist.ts` + schema validator + `accept-diff`. Add the **shared `data-testid` set (§5) to both apps** in one change. | Assertion machinery + allowlist working end-to-end on one checkpoint. | 3–4 days |
| **P2 — Smoke (critical)** | All `@critical` scenarios: SHELL-01/02/03/06-as-needed/07/08, FILE-01/05/06/08/10/14/16, LOGIC-01/02/04, PREVIEW-01/02/03, HEADER-01/03/06/11/16/17, SYNC-02/08, SHARE-01. Seed initial allowlist for the known intentional deltas (bottom-nav padding/font/scale/icon). | Green smoke suite + report. | 4–5 days |
| **P3 — Comprehensive** | All remaining `high`/`medium`/`low` scenarios across all five areas, including diagnostics, virtualization, conflict dialogs, share/export, drag/drop (synthetic), responsive. Expand fixtures (`many-files`, `with-diagnostics`). | Full catalog green; allowlist matured. | 6–8 days |
| **P4 — CI + golden** | GitHub Actions wiring, artifact upload, PR comment, golden-snapshot variant + OS pinning, allowlist expiry/usage reporting, HTML report generator. | Runs in CI on every PR. | 3–4 days |

**Total:** ~19–25 engineer-days.

### Highest-risk items

1. **Cross-app handle resolution for shadow-DOM baseline** (P1). Getting `getByRole` to land on the *style-bearing* inner shadow element (not the host wrapper) for computed-style reads is the trickiest part. Mitigate by validating each handle reads sane styles from **both** apps in a P1 handle-smoke test before P2.
2. **Driving non-`cached` sync states deterministically without network** (SYNC-02..10, HEADER-15/17). Requires a `workspace-hooks.ts` that mutates the store/signals identically in the signals-based port and the event-store baseline. Risk: the two stores diverge in how state is set. Mitigate by exposing a tiny `window.__parity` test hook in *both* apps (behind a build flag) that wraps each store's setter.
3. **SSR-before-hydration capture** (SHELL-01) — narrow, timing-sensitive window; aborting the hydration script per-app may behave differently. Mitigate by treating it as a single targeted test and accepting a looser threshold.
4. **Pixel AA noise across builds/OS** — two different bundlers (web-component vs Preact) may rasterize fonts/icons slightly differently even when "the same". Mitigate with `includeAA:false`, `threshold:0.1`, element-clipped captures, and reliance on the computed-style layer to catch true semantic drift.
5. **Allowlist becoming a dumping ground** — the comprehensive port has many intentional deltas; without discipline the allowlist could mask regressions. The exact-match + expiry + review + usage-report guardrails (§9) are the mitigation; budget time in P3 to keep entries tight.
6. **Synthetic drag/drop + hidden-input upload fidelity** (FILE-08/16/17/18) — must never touch native pickers (freezes renderer, per memory). Risk that synthetic DragEvents don't faithfully trigger the same code path in both apps. Mitigate via the protocol-event path (`DropFilesMessage`) where available, which is identical across both.

---

## 14. Open risks & decisions

- **Baseline checkout in CI.** Live A/B needs `../impower` at `main` checked out in CI. **Decision needed:** check out both repos in the workflow (simplest), or rely on the golden variant when baseline isn't available. Recommendation: check out both for the canonical job; keep golden as a fallback/port-drift guard.
- **`window.__parity` test hook.** Driving sync/diagnostics/preview state deterministically likely requires a small test-only hook in **both** apps. **Decision needed:** acceptable to add a build-flag-gated hook to the baseline (`main`)? If not, those scenarios must drive state via real flows (more flaky) or be downgraded. Recommendation: add the gated hook; it's inert in production.
- **Live-game toolbar scenarios with one shared player.** The player can only handshake with `:8080`. **Decision:** for `running`-game toolbar checkpoints, drive `preview.modes.game.running` via the store hook (no live player needed) rather than a real run, since we mask the canvas anyway. Confirm the toolbar renders identically when state is driven vs. genuinely running. Recommendation: store-driven; reserve `--with-player` for SHELL-10 fullscreen geometry only.
- **Per-checkpoint threshold tuning.** Initial `maxDiffRatio` values are estimates. First full run will reveal which checkpoints need looser/tighter gates; expect a tuning pass at the end of P2.
- **Skeleton/SSR captures.** Whether to assert pixel parity on transient skeleton/pre-hydration states at all, or only style/shape. Recommendation: style + shape only for SHELL-01 and HEADER-15 (freeze sheen at 0%); skip strict pixel gates there.
- **OS-dependent font rasterization for goldens.** Goldens are OS-specific. **Decision needed:** commit Linux-only goldens and run the golden job only on `ubuntu-latest`, documenting that local golden runs on Win/macOS will diff. Recommendation: yes, Linux-only goldens; local devs use live A/B.
- **Color-token resolution.** Some chrome uses CSS custom props (`var(--theme-color-panel)`, `--theme-color-fab-bg`). The style layer should compare **resolved** computed values, but a token rename that resolves to the same color would pass — acceptable (we care about rendered output). Flag if token-name parity is ever required.

---

Relevant existing files an implementer will touch or reference (all absolute):
- Harness root to create: `C:\Users\Lovelle\Documents\GitHub\impower-preact-port\e2e-visual-parity\`
- Port stack scripts/deps: `C:\Users\Lovelle\Documents\GitHub\impower-preact-port\impower-dev\package.json` (has `dev`/`build`/`start`; serves on `PORT||8080`).
- Baseline stack: `C:\Users\Lovelle\Documents\GitHub\impower\impower-dev\` (same `build.ts`/`start` contract; `out/` already present).
- Player (only for `--with-player`): `C:\Users\Lovelle\Documents\GitHub\impower-preact-port\sparkdown-player-app\` (`.env.development` pins `VITE_SPARKDOWN_EDITOR_ORIGIN`).
- Build-time origin var: `C:\Users\Lovelle\Documents\GitHub\impower-preact-port\impower-dev\.env.development`.
- Components needing shared `data-testid` are enumerated in §5 (port paths under `impower-dev\src\modules\spark-editor\components\...` and `packages\impower-ui\src\components\...`; baseline counterparts under `..\impower\impower-dev\src\modules\spark-editor\components\...`).