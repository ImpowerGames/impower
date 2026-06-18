# Web File Manager Upgrade

**Branch:** `dev/web-engine-file-manager`
**Goal:** Bring impower-dev's (the web game engine) file handling up to parity with the
vscode-sparkdown extension. Two headline pain points:

1. **The file manager is bare** — users can upload, delete, and rename, but cannot
   search, sort, filter, or organize files into **folders**.
2. **No local-folder editing** — users cannot point the web engine at a folder on
   their machine and edit it in place. Today's workflow is: drag files in → edit →
   export a project zip → unzip → manually overwrite the originals on disk. Tedious.

This document is the design of record. It is paired with the auto-memory entry
`project_web_file_manager_upgrade`.

---

## 1. Current state

The web editor's filesystem is a single dedicated worker,
`packages/opfs-workspace/src/opfs-workspace.ts`, that owns the **Origin Private File
System** (OPFS, `navigator.storage.getDirectory()`) and speaks an LSP-flavored
JSON-RPC protocol (the `workspace/*` messages in
`packages/spark-editor-protocol/src/protocols/workspace/`) over `postMessage` to
`WorkspaceFileSystem.ts` on the main thread. Files are addressed by a flat
`file://<projectId>/<filename>` URI. A **second, independent** OPFS reader lives in
the service worker (`impower-dev/src/workers/sw.ts`), which streams asset bytes for
`/file:/<path>` requests so previews can render images/audio.

### The storage layer already supports folders

This is the key insight that makes the whole effort tractable. The OPFS substrate is
**already nesting-capable**, and so is the asset-serving service worker:

- `getAllFilesRecursive` descends subdirectories and returns the full tree.
- `getDirectoryHandleFromPath` walks/creates intermediate dirs with `create: true`.
- `write`/`deleteFiles`/`renameFiles` resolve via `getParentPath` + `getFileName`, so
  they already operate on arbitrary subpaths. (Rename is copy-then-delete, so it can
  already move a file across directories.)
- `sw.ts`'s `getFileHandleByPath` already resolves nested asset URLs.

So **"folders" is a UI + identity + serialization refactor, not a storage rewrite.**

### Where the flatness actually lives

Three upper layers assume a single flat directory per project:

1. **Identity.** `WorkspaceFileSystem.getFileUri(projectId, filename)` joins exactly
   one segment; `getFilename = uri.split('/').slice(-1)`;
   `getDisplayName = filename.split('.')[0]`. The UI (`FileList`/`FileItem`) reduces
   every URI to its basename via `uri.split('/').pop()`.
   `getValidFileName` rewrites every non-`[\w.]` char — **including `/`** — to `_`,
   actively destroying folder structure on import/upload/drop.

2. **UI.** `FileList.tsx` renders a flat, glob-partitioned, virtualized list. The
   three panes (Logic ▸ Scripts, Assets ▸ Files, Assets ▸ URLs) are just three
   `FileList` instances with different include/exclude **filename** globs. Sort is
   hardcoded (alpha, then by extension) and duplicated in both the load and reload
   paths. There is no tree, search, filter, move, multi-select, or context menu.

3. **Round-trip serialization.** The script bundle (`//// name.ext ////` separators),
   the asset zip (`zipFiles` keys by basename; `unzipFiles` drops directory entries),
   and the compiler's `populateAssets` (basename keys) all collapse folder structure.

### ⚠️ A shipped data-loss regression (found during this investigation)

`WorkspaceFileSystem.splitProjectTextContent` — the **Google Drive text-sync pull**
path (`writeProjectScriptBundle` ← `pullRemoteScriptBundleChanges`) — is **broken on
`main` today**, independent of folders.

Commit `e7162cd3c` (2026-05-14, part of the Luau grammar migration) replaced the
grammar-derived `FILE_SPLITTER_REGEX`/`FILE_SEPARATOR_REGEX` with hardcoded regexes:

```js
const FILE_SPLITTER_REGEX  = /^([/]{4,})(\s*)([^/\s]+)(\s*)([/]{4,})(\s*)$/gmu; // 6 capture groups
const FILE_SEPARATOR_REGEX = /^((?:[/]{4,})(?:\s*)(?:[^/\s]+)(?:\s*)(?:[/]{4,})(?:\s*))$/; // 1 group
const FILE_NAME_CAPTURE_INDEX = 3;
```

`String.split` with a 6-capture-group regex splices **6 values per separator** into
the result array, but the parse loop still assumes simple alternating even/odd
content/separator pairs. And `FILE_SEPARATOR_REGEX` no longer captures the filename at
index 3 (everything inside is non-capturing). Empirically, pulling a project with
`main` + `dialogue.sd` + `choices.sd` yields:

```
{ "file://proj/main.sd": "CHOICES BODY" }   // dialogue + choices lost; main overwritten
```

i.e. **every script collapses onto `main.sd` and is overwritten by the last chunk.**
The file is byte-identical on `main` and this branch, so this is in production. Phase 0
fixes this as a side effect of rewriting the serializer correctly.

### Local-folder editing: not implemented

There is **no** File System Access API usage anywhere (`showDirectoryPicker`,
`createWritable`, `FileSystemObserver` are all absent) and no IndexedDB handle
persistence. All storage is OPFS.

---

## 2. Target architecture

### 2a. Folder model

**URI scheme.** Keep `file://<root>/<...subpath>/<file>.ext`; let the path after the
root carry arbitrarily many segments. Generalize `<root>` from a bare projectId to a
**root/mount discriminator** so OPFS projects and picked local folders share one
namespace (e.g. keep `file://<projectId>/…` for OPFS; `file://local-<mountId>/…` for a
mounted folder). The worker gains one `resolveRoot(uri)` helper that returns the right
`FileSystemDirectoryHandle`. Everything below `resolveRoot` is already polymorphic
because OPFS roots and picked directories are both `FileSystemDirectoryHandle`.

**Protocol.** Most existing messages are already path-ready (`ReadDirectoryFiles`
returns the recursive tree; `Will{Create,Rename,Delete,Write}Files` pass full URIs).
New messages to add:

- `CreateFolderMessage` (`{uri}` → `FileData`) — OPFS dirs are implicit, so this writes
  a sentinel `.folder` marker so empty folders persist.
- `MoveFilesMessage` (`{files:[{oldUri,newUri}]}`) — folder-aware reparent; for a
  directory, enumerate → recreate under the new parent → recursive-delete the source.
- A `recursive?: boolean` flag on `WillDeleteFilesMessage` (`removeEntry` currently runs
  **without** `{recursive:true}`, so deleting a non-empty folder throws).
- `SearchInFilesMessage` (`{query, include?, exclude?, isRegex?}` → matches) — grep over
  `getAllFilesRecursive`, runs OPFS/local-polymorphically.

**FileData.** Add optional `isDirectory?`, `parentUri?`, and a root/mount discriminator
(additive — keeps the vscode webviews that share the type working).

**UI tree.** In `FileList.tsx`, stop flattening to basename: build a path tree from
`Object.keys(files)`, hold expand/collapse state, flatten the **expanded-visible** tree
into a linear array, and feed *that* to the existing TanStack virtualizer (keep
windowing). `FileItem.tsx` gains depth/indentation, folder-vs-file rendering,
`draggable` + drop-target handlers, and `onContextMenu`.

### 2b. Local-folder editing — chosen approach: backend-polymorphic worker

We adopt **Architecture A: make the worker polymorphic over
`FileSystemDirectoryHandle`, with a write-path switch.** We reject mirror-to-OPFS and
OPFS-as-cache.

**The deciding constraint.** `createSyncAccessHandle()` is **hard-restricted to OPFS** —
it throws `InvalidStateError` on any handle from `showDirectoryPicker`. So the worker's
synchronous fast write path *cannot* run against local files; local writes must use the
**async** `createWritable()` stream (writes to a temp file, atomically swaps on
`close()`). Reads (`getFile()`) are uniform across both backends. The clean seam is a
per-root write branch, not a new pipeline:

- `FsBackend` interface `{ readFile, writeFile, list, stat, delete, createDir }`, two
  impls selected by `resolveRoot(uri)`:
  - `OpfsSyncBackend` — keeps the current `createSyncAccessHandle` path.
  - `LocalAsyncBackend` — uses `createWritable()`; methods are async. Expose a uniform
    async surface so the existing debounce/queue (`State.writeQueue`/`enqueueWrite`) is
    preserved; never hold a sync access handle across an `await`.

**Permissions & persistence.** Main thread (inside a click gesture) calls
`showDirectoryPicker({mode:'readwrite'})`, persists the handle in **IndexedDB** (handles
are structured-cloneable), then `postMessage`s the already-authorized handle to the
worker (structured-cloned — **not** in the transfer list; handles are not Transferable).
The worker registers it under a `mountId`. On reload: read handle from IDB →
`queryPermission({mode:'readwrite'})` silently → if not `granted`, surface a
**"Reconnect &lt;folder&gt;"** button and call `requestPermission()` from *that* click (a
worker cannot call `requestPermission` — no user activation). `handle.name` (leaf folder
name only — the API hides absolute paths) labels the tree root; keep a recent-folders
list.

**Asset src — the single biggest hazard.** `sw.ts` is a *separate* OPFS reader and
**cannot reach a handle held in the worker**, so `/file:/<path>` will 404 for local
roots. For local mounts, the **worker mints `blob:` URLs** for assets and puts them in
`FileData.src` (bypassing the service worker). OPFS assets keep the `/file:/` + `sw.ts`
path. The src resolver routes on root kind.

**External-change detection.** Feature-detect `'FileSystemObserver' in self`; if present
`observer.observe(localRoot,{recursive:true})` and reconcile on records (re-enumerate the
affected subtree on coarse `unknown` records). Otherwise fall back to bounded
`getFile().lastModified` polling of open/visible files only, plus reconcile on
`visibilitychange`/focus. Before every save, re-read and compare mtime/size; on a
changed-under-an-unsaved-edit conflict, show Reload / Keep-mine / Compare — never
blind-overwrite.

**Browser support — local editing is desktop-Chromium-only.** `showDirectoryPicker` is
Chrome/Edge/Opera desktop only. Firefox and Safari (and **all** iOS browsers, which are
WebKit underneath) ship OPFS but **not** the disk pickers, with no committed timeline.
**Installing as a PWA does not change this** — it only grants Chromium *persistent*
file-handle permissions (frictionless reconnect, no per-session re-prompt); it does not
polyfill the API into other engines. Decision: **graceful fallback** — gate the feature
on `'showDirectoryPicker' in window`; where absent, run OPFS-only (today's behavior) plus
`<input type=file webkitdirectory>` read-only import and download/Save-As export — **and
ship impower-dev as an installable PWA** so Chromium users get seamless reconnect.

### 2c. Backwards compatibility

The danger is **silent data loss on round-trip**, since OPFS + `sw.ts` already render
nested files that then vanish on the next sync/export.

- **Script bundle** (`bundleProjectText`/`splitProjectTextContent`): carry the
  project-relative **path** in the separator, not the basename; rebuild URIs from the
  full relative path. The new parser is a superset that reads old flat bundles
  unchanged (an old bundle's separators are just paths with no `/`), so **no version
  flag or migration is needed for reading**. New bundles for a flat project are
  byte-identical to old output (zero Drive churn for existing flat projects).
- **Google Drive sync** (`GoogleDriveSyncProvider.ts`): the provider is path-agnostic
  (one `.project` blob); all flattening is upstream in the bundlers and `zipFiles`. Fix
  `zipFiles` to key by project-relative path and stop dropping directory entries in
  `unzipFiles`. Transport, conflict, and revision logic unchanged.
- **main.sd**: keep root `main.sd` as the default bundle head and default-open editor
  (the agreed single-root-main contract), but stop *assuming* it everywhere.
- **Language-server startup**: `loadInitialFiles` already passes full-URI `FileData[]`
  to `Workspace.ls.start`; the document registry is URI-keyed (collision-free). Only
  basename-identity helpers (`getFileName`/`getFileExtension`/`findFiles`) and
  `populateAssets` need path-qualifying.
- **getValidFileName**: sanitize **per path segment** (allow `/`, reject `..` and
  leading-slash escapes to prevent OPFS path traversal).

---

## 3. Feature breakdown

| Feature | Mechanism | Files that change |
|---|---|---|
| **Folder tree** | Path tree over `Object.keys(files)`; expand/collapse; flatten-visible → virtualize; indentation | `FileList.tsx`, `FileItem.tsx`; persist expansion in `WorkspaceStore` `panels[panel]` |
| **Project-wide search** | New `SearchInFilesMessage` + worker grep over `getAllFilesRecursive` | protocol `workspace/SearchInFilesMessage.ts` (new), `opfs-workspace.ts`, `WorkspaceFileSystem.ts`, `MainWindow.tsx` |
| **Inline filename filter** | `useState` query gating the visible list pre-virtualization; reuse `globToRegex.ts` | `FileList.tsx` control bar |
| **Sort / filter controls** | `useState` sort-mode/filter; one `buildView()` helper replacing the two duplicated sort blocks | `FileList.tsx`; menus via existing `DropdownCheckboxItem`/`DropdownSub` |
| **Drag-to-move** | `FileItem` `draggable` + folder drop targets → `moveFile` → `MoveFilesMessage` | `FileItem.tsx`, `WorkspaceFileSystem.ts`, `opfs-workspace.ts` |
| **Drag-from-OS into a folder** | Extend `FileDropzone` with a drop-target path; preserve `webkitRelativePath`; relax `getValidFileName` | `FileDropzone.tsx`, `getValidFileName.ts` |
| **Multi-select** | Shift/Ctrl-click selection; bulk delete/move | `FileList.tsx`, `FileItem.tsx`, `FileOptionsButton.tsx` |
| **Context menus** | Right-click reusing Radix menu content | `FileItem.tsx`; new `ContextMenu` primitive wrapping `@radix-ui/react-context-menu` |
| **New Folder** | FAB/menu → `CreateFolderMessage` (sentinel `.folder`) | `FileAddButton.tsx`, `Assets.tsx`, `WorkspaceFileSystem.ts`, `opfs-workspace.ts` |
| **Breadcrumbs** | Derive from active file's relative-path segments | `MainWindow.tsx` / new `Breadcrumbs.tsx` |
| **Open Local Folder** | `showDirectoryPicker` in a click; persist in IDB; register mount in worker | new mount/provider module, `WorkspaceSync.ts`, `WorkspaceWindow.ts`, `opfs-workspace.ts`, `MainWindow.tsx` |

`packages/impower-ui` has **no** Tree, Search/Input, ContextMenu, or SegmentedControl
primitives — these are net-new (Radix `@radix-ui/react-context-menu` is the natural base,
mirroring the existing Dropdown wrapper). `sparkdown-document-views`' only host contract
is `FileSystemReader {scheme, url(uri)}` — as long as nested-asset URIs still resolve via
`url()`, the editor/preview need **no** changes.

The file browser stays **per-pane** (folders *within* Logic and Assets, scoped by glob) —
not a single unified tree — per the product decision below. This keeps `WorkspaceWindow`
pane/panel routing unchanged.

---

## 4. Phased roadmap

Ordering principle: **make identity path-safe and stop data loss first** (invisible but
load-bearing), then ship visible folder UX, then local-folder editing. Each phase is
independently shippable.

### Phase 0 — Path-safe identity + anti-data-loss (effort: M) — ship first
No new UI. Make the existing nesting safe to expose, and fix the shipped Drive-sync bug.
- **Script bundle** (this slice also fixes the `e7162cd3c` regression): extract
  `bundleProjectText`/`splitProjectTextContent` into a tested pure module; carry the
  project-relative path in the `////` separator; read old flat bundles unchanged.
- **Asset zip**: `zipFiles`/`unzipFiles` (+ `writeProjectZip`/`writeProjectAssetBundle`)
  preserve directory paths.
- **Identity**: `getFileUri`/`getFilename` accept multi-segment paths; add
  `getRelativePath`/`moveFile`; `FileItem`/`FileAddButton`/`openFileEditor` stop
  re-deriving URIs from basenames; key React rows by full URI.
- **Compiler**: `populateAssets` keys by path-qualified name + basename-collision
  diagnostic; harden `getFileExtension` to `lastIndexOf('.')`.
- **Tests first** — round-trip is the highest-risk silent-loss spot: two same-basename
  files in different folders survive the script bundle and the asset zip with distinct
  paths; old flat bundle still reads.

### Phase 1 — Folder tree + search/sort/filter UI (effort: L) — pain point #1
- New impower-ui primitives: `Tree`/`TreeItem` (ARIA `role=tree/treeitem/group`, roving
  tabindex, explicit `aria-level`/`aria-labelledby`), `Input`/`SearchInput`,
  `ContextMenu`.
- `FileList` → path tree + control bar; `CreateFolder`/`Move`/recursive-delete/`Search`
  protocol messages + client wrappers; inline create/rename, drag-to-move, multi-select,
  breadcrumbs; relaxed `getValidFileName`; `FileDropzone` preserves `webkitRelativePath`;
  persist expansion/sort/filter/search in `WorkspaceStore`. All browsers, pure OPFS.

### Phase 2 — Open Local Folder (Chromium) (effort: L) — pain point #2
- `resolveRoot` + `FsBackend`/`LocalAsyncBackend`; root/mount-prefixed URIs; provider
  registry (`Workspace.sync.active`); `showDirectoryPicker` flow + IDB persistence +
  reconnect; worker-minted `blob:` asset src; feature-detect + graceful fallback; ship
  as PWA. Gated behind `'showDirectoryPicker' in window`.

### Phase 3 — External-change reconciliation (effort: M) — polish on Phase 2
- `FileSystemObserver` (feature-flagged) + polling/visibility fallback; re-read+compare
  before save; Reload/Keep/Compare dialog; per-path dirty tracking.

### Phase 4 (optional) — Multi-project / soft switch (effort: M)
- Project registry + soft re-init replacing `location.reload()`. Deferred; not required
  for either headline goal.

---

## 5. Locked product decisions (owner, 2026-06-18)

1. **Sequencing:** folders/search first (Phase 0 → 1), then local-folder (Phase 2).
   All-browser and lower-risk before the Chromium-only feature.
2. **Browser model:** folders **within** the existing Logic/Assets panes (per-pane,
   glob-scoped) — not a single unified tree. Smallest change to pane routing.
3. **Non-Chromium fallback:** graceful — OPFS sandbox + `webkitdirectory` import +
   download export, with honest messaging; **plus ship as an installable PWA** for the
   Chromium persistent-permission win. (Rejected the OPFS-mirror: doubles storage and
   creates a sync-back consistency problem.)

## 6. Risks & open questions

**Top hazards:** (1) silent data loss on sync/export round-trip — *mitigated by doing
Phase 0 first and gating folder UI behind it*; (2) asset collapse in the running game
(`populateAssets` last-writer-wins on basename) — path-qualified key + collision
diagnostic; (3) local asset src 404s — worker-minted `blob:` URLs; (4)
`createSyncAccessHandle` throw on local handles — `FsBackend` write branch; (5)
permission loss on reload + no off-Chromium watcher — design for reconnect-on-reload and
reconcile-on-focus.

**Open questions:** empty-folder persistence convention (sentinel `.folder` vs.
tolerating implicit OPFS dirs); whether `applyWorkspaceEdit`'s abort-only failure
handling is acceptable once move/folder ops widen the blast radius (the code already
TODOs zenfs for transactional edits); and scoping `BroadcastChannel('opfs-workspace')`
notifications away from per-tab local mounts (a picked handle is not shared across tabs).
