# URL (Remote/CDN) Assets — Implementation Plan

**Status:** Planned, not started. Hand-off doc for a future agent.
**Branch context:** spun out of `dev/web-engine-file-manager` so the file-manager
UI work isn't blocked on it. Pairs with `web-file-manager-upgrade.md` and
`ui-design.md` in this folder.

**Goal:** Let a game reference an asset (image / audio / video) by a **remote
CDN URL** instead of importing the bytes locally — useful for large media the
user doesn't want to bloat the project with, quick prototyping by pasting a URL,
and assets shared across projects.

---

## 1. Current state (what exists, what doesn't)

The Assets pane has two sub-tabs (`impower-dev/src/modules/spark-editor/components/assets/Assets.tsx`):

- **Files** — a `FileList` excluding `*.{sd,metadata,…}`; local assets, served as
  bytes by the service worker.
- **URLs** — a `FileList` with `include="*.{url}"`, and a FAB whose `addUrl()`
  writes a **zero-byte** `asset00.url` (`Assets.tsx` `addUrl`, and
  `FileAddButton.tsx` for the `asset00.url` default name).

**Nothing reads `.url` files.** The "Add URL" button creates an empty file, there
is no UI to put a URL into it, and no engine/runtime code consumes the `.url`
extension. The feature is a stub: it was deferred precisely because there was no
good interface designed for it. So today the URLs tab is a dead-end that creates
files which do nothing.

---

## 2. Decisions locked in

1. **URLs stays its own panel.** Do NOT fold remote assets into the Files list.
   Rationale: a unified list would need an **"Add" dropdown on the FAB** (Upload
   vs. From URL), and we deliberately avoid FAB dropdowns — that's exactly why
   "New Folder" was moved to the header's overflow menu rather than onto the FAB.
   Keeping URLs separate lets each panel's FAB stay a **single action**
   ("Upload Files" / "Add URL").

2. **On-disk model: the `.url` file.** Filename (minus `.url`) = the asset's
   **name/identity**; the file's **text content** = the remote URL. Tiny,
   git-friendly, serializable, nests in folders like any file, and needs **no
   `FileData` schema change**. Media **type is inferred** (see §5), so the
   filename stays just the asset name (`hero.url`, not `hero.png.url`).

3. **Scope of "works":** an asset that **displays/plays** from a remote URL in the
   preview and the player. Pixel-/sample-level processing (canvas readback,
   WebAudio decode) is CORS-gated and may not work for all CDNs — documented as a
   known limitation, not a blocker (see §4 and §6).

---

## 3. The three layers to build

### Layer A — On-disk + compiler (asset registration)

A `.url` file must register as a **named asset** the engine can reference (e.g.
`define backdrop hero = …` resolving to the `hero.url` asset).

- Find where the compiler/engine gathers assets and assigns each one a runtime
  **`src`**. Local assets get a service-worker URL (`/file:/<path>`, served by
  `impower-dev/src/workers/sw.ts`); a `.url` asset's `src` must instead be its
  **text content** (the remote URL).
- Integration points to trace (the implementing agent must confirm exact spots):
  - `WorkspaceFileSystem.ts` / `packages/opfs-workspace/src/opfs-workspace.ts` —
    where `FileData` (incl. `src`) is produced. `FileData` already carries `src`,
    `size`, `modified` (`packages/spark-editor-protocol/src/types/workspace/FileData.ts`).
  - The sparkdown asset pipeline (`packages/sparkdown`) — the image/audio asset
    struct and how its `src`/href reaches the runtime.
  - `packages/spark-web-player` — how the runtime element (`<img>`/`<audio>`/
    `<video>`) gets its source.
- **Recommended approach (A1):** resolve `src` = file-content URL at the
  `FileData`/asset-struct layer, so everything downstream is transparent and the
  service worker is never involved.
- Alternative (A2): SW reads the `.url` and **302-redirects** `/file:/<path>` to
  the remote URL — keeps one uniform `src` scheme but adds an extra hop + SW
  complexity. Prefer A1 unless something downstream hard-requires a same-origin
  `src`.

### Layer B — Interface (entering + previewing the URL)

Within the **existing separate URLs panel**:

- **Add:** "Add URL" must stop creating an empty file silently. Open a small form
  (URL field, required; name field, default derived from the URL's last path
  segment). On submit, write `name.url` containing the URL. (A single-line inline
  rename is for *names* only, so a URL needs its own input — a tiny dialog or a
  reveal-into the preview pane below.)
- **Edit:** clicking a `.url` asset opens the **preview pane (task #21)** which,
  for `.url` files, also exposes an **editable URL field** + a live preview of the
  remote media. So the "URL editor" is just the preview pane plus one field — the
  two features should be built together.
- **List row:** `FileItem` already renders a thumbnail from `src`; for a `.url`
  image that `src` is the remote URL, so thumbnails work for free. Add a small
  **link/remote badge** so remote assets are visually distinct from local ones,
  and keep the existing broken-image fallback glyph for dead URLs.

### Layer C — Export / publish

Decide what a project export (zip) does with remote refs:

- **v1 (recommended):** keep `.url` files as-is — the exported game depends on the
  CDN at runtime. Document the dependency.
- **Later:** optional "inline remote assets on export" (fetch + embed), which
  removes the runtime CDN dependency at the cost of export-time fetching + CORS.

---

## 4. CORS reality (read before estimating)

- Cross-origin `<img src>` / `<audio src>` / `<video src>` **display and play
  fine without CORS.** Most "just show the image / play the sound" paths work.
- Reading pixels (canvas `getImageData`, WebGL textures) or decoding audio via
  WebAudio (`decodeAudioData` on fetched bytes) requires the remote server to send
  `Access-Control-Allow-Origin` **and** the element to set
  `crossorigin="anonymous"`. Many CDNs don't send CORS headers → those assets can
  display but not be processed.
- **Action for the implementing agent:** audit how the engine consumes each asset
  type (plain display/playback vs. pixel/sample processing). If any asset type is
  always decoded (e.g. audio through WebAudio), remote assets of that type are
  CORS-dependent — surface that clearly in the UI rather than failing silently.

---

## 5. Type inference

- Infer media type from the URL's **file extension** first (`.png/.jpg/.webp/.gif`
  → image, `.mp3/.ogg/.wav` → audio, `.mp4/.webm` → video). No network needed.
- Fallback: a `HEAD` request's `Content-Type` when the URL has no usable
  extension (signed/opaque URLs). Keep this optional/lazy.
- Reuse / extend the existing extension→category map
  (`impower-dev/src/modules/spark-editor/utils/fileIcon.ts` `fileCategory` /
  `CATEGORY_BY_EXT`) — but key off the **URL's** extension, not the `.url` file's.

---

## 6. Phased plan (de-risk the engine first)

1. **Engine-resolution spike (riskiest, do first).** Hard-code one `.url` asset
   and prove it resolves + renders in `spark-web-player` via the Layer-A1
   `src`-from-content approach. Confirms the model and surfaces the CORS truth for
   each asset type before any UI polish.
2. **Compiler asset gathering.** `.url` files register as named assets with
   inferred type (§5) and remote `src`. Verify a `define …` referencing a `.url`
   asset works end-to-end.
3. **Interface (pairs with task #21).** "Add URL" form (URL + name) in the URLs
   panel; preview pane gains a URL field; `FileItem` shows the remote badge +
   thumbnail + broken-URL fallback.
4. **Export behavior.** Ship v1 "keep remote refs"; document. (Inline-on-export is
   a later enhancement.)
5. **Edge cases.** Dead-URL fallback, CORS-failure messaging, type-inference
   fallback, very large remote media UX.

---

## 7. Open questions

- **Naming:** confirm filename = asset name only (`hero.url`), type inferred — vs.
  encoding type in the name. Recommended: name only.
- **Content format:** start with the raw URL as the file's text. If we later need
  per-asset metadata (explicit type override, alt text, CORS flag), migrate to a
  tiny JSON body — but only if a concrete need appears.
- **Validation:** how strict on add? (require `http(s)://`, reject obviously
  non-asset URLs?) Recommend light validation + the live preview as the real
  feedback.
- **Auth'd / expiring URLs:** out of scope (they rot); don't design for them.
