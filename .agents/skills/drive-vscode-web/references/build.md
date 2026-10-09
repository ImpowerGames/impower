# Extension build and freshness

Run from the worktree root. Choose the scenario and evidenced automation route first: desktop `f5` starts with generated outputs absent, before any preparatory full build. The exercised portable Windows route uses explicit `--automation cdp`; Electron failures remain separate evidence. See [desktop scenarios](desktop.md).

## Full build

```text
cd vscode-sparkdown
npm run build
```

Desktop `full-build` and web `debug` need the extension, copied language-server worker, game webview (with its bundled player/workspace worker), and fonts. The scenario guard hashes those artifacts and stamps source content/source sets; copied fonts must match their sources. It accepts an identical source touch but refuses changed or deleted sources without rebuilt artifacts. Fingerprints describe files on disk in a fresh host, rather than independently captured loaded worker bytes.

An exit-zero build can still log `dts-bundle-generator` errors and `no type bundle produced; skipping post-process`. The missing `out/data/spark.d.ts` then causes a captured extension error. Preserve that strict failure; successful semantic-token replies or visible game content do not clear it.

## Narrow editor rebuild

The editor-only web `verify` guard covers `out/extension.js`, `out/workers/sparkdown-language-server.js` and copied `data/` files. Extension `src/` and `language/` feed the extension bundle. Package `src/` and `language/` feed both bundles; generated grammar edits therefore require rebuilding them. Tests, snapshots, dependencies and generated output directories are excluded from source scans. `package.json` is read directly.

For extension source, language configuration or data changes:

```text
cd vscode-sparkdown
node scripts/esbuild.ts
```

For package changes:

```text
cd vscode-sparkdown
npm run build:sparkdown-language-server
node scripts/esbuild.ts
```

The language-server build writes its package `dist`; the extension build copies that worker into `out/workers`. These narrow steps leave webviews and the screenplay PDF worker unchanged, so they do not prepare preview, export or packaging scenarios. Use the full build for those.

The editor guard requires artifacts at least as new as their sources, with a one-millisecond allowance for copied mtimes. Its `out/.drive-vscode-web-build.json` content stamp accepts identical touches. Added/deleted source sets refuse unless all affected artifacts were rebuilt after the source directory entry changed. A partially rebuilt set still refuses. The driver's error names the missing/stale artifact and required rebuild steps. The report names the oldest rebuilt bundle; copied-data timestamps do not establish when bundling ran.
