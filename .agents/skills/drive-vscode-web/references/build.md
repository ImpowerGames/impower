# Extension build and freshness

All commands run from the worktree root unless stated otherwise.

## 1. Build the extension

Start with the full runtime build, about a minute on the development machine:

```bash
cd vscode-sparkdown && npm run build
```

The optional `spark-web-player` declaration generator can report unresolved imports, finish with `Error: Compiled with errors` and `no type bundle produced; skipping post-process`, and leave the build command's exit status at 0. The runtime outputs do not require that type bundle; the extension handles an absent `spark.d.ts` separately.

The driver checks the artifacts for the selected surface:

| Surface | Required artifacts |
| --- | --- |
| Served `up` and ordinary `verify` | `out/extension.js`, `out/workers/sparkdown-language-server.js`, copies of `data/*` |
| `desktop --mode full`, F5 after its task, and served `verify --debug` | The editor artifacts, PDF worker and all four webviews, including the player and its embedded workers |

For the served editor, `vscode-sparkdown/src/`, `language/` and `data/` feed the extension output; `packages/*/src/` and `packages/*/language/` feed the extension and language-server bundles because workspace imports resolve to source. Tests, snapshots, `node_modules`, `dist` and `out` are excluded. Regenerating language definitions makes their consuming bundles stale. `package.json` is read directly by the workbench.

Complete-runtime checks additionally include package and extension build inputs and webview sources. Package and extension `tsconfig.json` files are inputs too: esbuild discovers them when compiling bundled TypeScript, and JSX or class-field settings can change runtime bytes without a source edit. Webview configs are already included through their source directories. An editor-only rebuild cannot verify Game Preview. The F5 task builds and watches both workers and all four webviews before starting the extension copier; it does not require the optional declaration bundle. See [desktop scenarios](desktop.md) for missing-output and source-propagation verification.

A missing or stale artifact refuses launch/verification and names the outputs, sources and ordered rebuild steps. A source touched without changing its content, such as a red/green restore, may be accepted against the build's recorded hashes. A newly accepted build records artifact and source content in `out/.drive-vscode-web-build.json`, or the separate `.drive-vscode-desktop-build.json` for complete-runtime checks. A newer source must still match the stamp, and every stamped artifact must remain unchanged. A source added or deleted since that stamp refuses even with an old timestamp, unless all consuming outputs were rebuilt after the directory changed. The stamp is not rewritten over a source-set gap. `build` in the report names the oldest required runtime bundle, not a copied data file's timestamp.

For changes confined to `vscode-sparkdown/src/`, `language/` or `data/`, the served editor can use:

```bash
cd vscode-sparkdown && node scripts/esbuild.ts
```

For shared-package changes, the served editor can use:

```bash
cd vscode-sparkdown && npm run build:sparkdown-language-server && node scripts/esbuild.ts
```

These narrower steps leave the PDF worker and webviews untouched. Run the full build before Game Preview, debugging, packaging or export verification when their inputs changed. Prefer the driver's refusal text for the exact required rebuild steps.
