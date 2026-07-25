# File Manager — UI / UX Design Spec

**Branch:** `dev/web-engine-file-manager`
**Scope:** Visual + interaction design for the per-pane folder tree (Logic ▸ Scripts,
Assets ▸ Files, Assets ▸ URLs). This is the **look-and-feel** companion to the
engineering design of record, [`web-file-manager-upgrade.md`](./web-file-manager-upgrade.md)
(which owns storage, identity, protocol, and local-folder editing). Where that doc says
*"build a tree"*, this doc says *what it looks like and how it feels on a phone*.

**Owner goal:** make the file manager feel like **VS Code's file explorer** (folder tree,
file-type icons, inline rename, drag-to-organize, context menus) but **styled in the
engine palette** and **mobile-first** (this editor runs on phones).

**Implements against:** `impower-dev/src/modules/spark-editor/components/file-list/FileList.tsx`,
`FileItem.tsx`, `FileOptionsButton.tsx`, `DiagnosticsLabel.tsx`;
`impower-dev/src/modules/spark-editor/utils/fileTree.ts`. Hosts:
`logic-list/LogicList.tsx`, `assets/Assets.tsx`, `main-window/MainWindow.tsx`,
`file-editor-navigation/FileEditorNavigation.tsx`.

> **Hard constraint recap (do not violate):**
> 1. Engine palette only — every color cites a real token from
>    `packages/impower-ui/src/style.css` `@theme` or `text-foreground/NN` opacity slashes.
> 2. Mobile-first — touch targets ≥ 44px, **no hover-only affordances**, touch drag is
>    secondary (explicit "Move to…" is the reliable path).
> 3. Reuse impower-ui primitives (`Button`, `Dropdown*`, `Ripple`, `Tabs`, `Router`) and the
>    existing `icons.generated.tsx` set. New primitives/icons are called out in a separate
>    "needs building" list.
> 4. Virtualized — TanStack Virtual, uniform `ITEM_HEIGHT = 52`. Design stays row-by-row at
>    one height; any variable-height element (inline rename, breadcrumbs) lives **outside**
>    the virtual list or is justified.

---

## 0. The real palette (cited, not invented)

Everything below maps to these. Source: `packages/impower-ui/src/style.css` `@theme`.

| Token (Tailwind class) | Value | Role in the file manager |
|---|---|---|
| `bg-engine-900` | `hsl(210.6 100% 10%)` | The list surface (panes already use it; matches `LogicList`/`Assets` sticky tab bar). |
| `bg-engine-950` | `hsl(210.6 100% 7%)` | Editor bg — used as a *deeper* well behind nothing here, but referenced for the open-file editor it drills into. |
| `bg-engine-800` | `hsl(210.7 89.1% 18%)` | Bottom nav surface; **selected-row fill base** (see §2). |
| `bg-engine-700` | `hsl(210.8 44.9% 34.9%)` | FAB / `secondary` fill — the New-File CTA. |
| `text-foreground` | `rgb(255 255 255)` | Pure white — folder names, active text. |
| `text-foreground/80` | white @ 80% | **File name** default (current `FileItem` already uses this). |
| `text-foreground/70` | white @ 70% | Toolbar button labels, dropdown items. |
| `text-foreground/50` | white @ 50% | Chevron, file-type icon, 3-dots glyph (muted chrome). |
| `text-foreground/30` | white @ 30% | The `.ext` suffix (current behavior), indent-guide *inactive*. |
| `bg-foreground/5` | white @ 5% | Hover overlay (matches `Button` `ghost`). |
| `bg-foreground/[0.12]` | white @ 12% | Pressed overlay (matches `Button` `ghost` active). |
| `bg-foreground/10` + `ring-foreground/40` | — | **Drag-over drop target** (current `FileList` already uses this exact pair). |
| `text-danger-500` (`red-500`) | — | Error diagnostic on a row (via `useDiagnosticColor`). |
| `text-warning-500` (`amber-500`) | — | Warning diagnostic on a row. |
| `text-primary` (`sky-400`) | — | Accent — selection indicator bar, dirty dot, search-match highlight. |
| `bg-popup` | `rgb(18 18 18)` | Dropdown / context-menu surface (already used by `DropdownContent`). |
| `--radius-md` (`rounded-md`) | 6px | Standard corner. `rounded` (4px) for compact chips. |

There is **no** `--color-folder`-type token and there should not be one; folders are
distinguished by **icon + weight + the indent guide**, not by a fill color.

---

## 1. Design principles

1. **The tree is the chrome, the file is the content.** Folders, chevrons, indent guides,
   and icons are all muted (`/50`–`/30`); only the *file name* and a real *state* (selected,
   error, dirty) get full contrast. Scanning a list should feel quiet.
2. **Touch is the primary input, pointer is a bonus.** Every action reachable by a phone tap
   or long-press without hover. Desktop hover/right-click are *additive accelerators*, never
   the only path. A feature that only works on hover is a bug.
3. **One row, one height, one tap target.** 52px slot (already shipped), ≥44px hit area. The
   whole row is the primary tap (open file / toggle folder). Secondary actions live in a
   persistent 3-dots affordance and a long-press menu — never in hover-reveal.
4. **Engine palette, VS Code muscle memory.** Adopt VS Code's *structure* (twistie on the
   left, indent guides, file-type icons, inline rename with stem selected, drag-to-organize)
   but render it in the deep-navy `engine-*` ramp the rest of the editor already wears.
5. **Don't fight the virtualizer.** Uniform-height rows. Anything taller (breadcrumb bar,
   search field, multi-select action bar) is a sticky element *above* the scroller, not a row.
6. **Degrade, never block.** No selection, no folders, no search → the list still renders as
   today's flat list. Every new affordance is additive over the existing flat behavior.

---

## 2. Visual spec — rows & states

### 2.1 Row anatomy (uniform 52px slot, 44px+ inner hit area)

```
┌─ 52px slot ───────────────────────────────────────────────────────────┐
│  [indent guides]  [twistie]  [type icon]  Name.ext            [⋮]      │
│   12px + d·16px     20px       24px        flex-1, ellipsis   44px     │
└────────────────────────────────────────────────────────────────────────┘
```

| Zone | Width | Content | Token |
|---|---|---|---|
| Indent guides | `12 + depth·16`px (current `BASE_INDENT`/`INDENT_PER_DEPTH`) | vertical guide lines, one per ancestor depth | see §2.4 |
| Twistie | 20px fixed (current `w-5`) | folder: rotating `ChevronRight`; file: empty spacer (alignment) | `text-foreground/50` |
| Type icon | 24px (icon `size-5` in a `w-6` box) | file-type or folder icon (§2.5) | `text-foreground/50` |
| Name | flex-1, `truncate` | stem at full weight, `.ext` suffix muted | folder `text-foreground` + `font-medium`; file `text-foreground/80` |
| Trailing | 44px | 3-dots `DotsVertical` (always visible — **not** hover-gated) | `text-foreground/50`, hover→`text-foreground` |

> **Change from today:** the current `FileItem` has the chevron and name but **no
> file-type icon column** and **no indent guides**. Those two additions are the bulk of the
> visual upgrade. The icon column slots between the twistie and the name.

### 2.2 Folder row vs file row

|  | Folder | File |
|---|---|---|
| Twistie | `ChevronRight` `size-4`, `rotate-90` when expanded, `transition-transform` (already shipped). Empty folders: render at `opacity-40` (already shipped) **or** drop the chevron and rely on the folder icon. | none — 20px spacer keeps names aligned |
| Type icon | `Binder` (closed) when collapsed, `Files`-stack tint when expanded — see §2.5 recommendation | per-extension icon (§2.5) |
| Name weight | `font-medium`, `text-foreground` (full white) | `font-normal`, `text-foreground/80` |
| Ext suffix | n/a (whole segment shown) | `.png` etc. at `opacity-30` (already shipped); `.sd` is hidden (already shipped) |
| Tap | toggle expand/collapse | open in editor |

### 2.3 Row states → tokens

| State | Visual | Token / mechanism |
|---|---|---|
| **default** | transparent row on `bg-engine-900` | `Button variant="ghost"` base |
| **hover** (pointer only) | 5% white wash | `hover:bg-foreground/5` (Button ghost — already there) |
| **pressed** | 12% white wash + ripple | `active:bg-foreground/[0.12]` + `<Ripple/>` (already there) |
| **selected** (active file / current folder) | 12% `engine-800` tint fill + a 2px `primary` left accent bar inset at the row's left edge | `bg-engine-800/40` on the row container; accent: a `before:` 2px bar `bg-primary` pinned left. Mirrors VS Code's active-row treatment in the engine accent. |
| **expanded** (folder) | chevron `rotate-90`; icon swaps closed→open | `rotate-90` (shipped) + icon swap |
| **drag-over** (folder is a drop target) | 10% white fill + 1px inset `foreground/40` ring, `rounded` | `rounded bg-foreground/10 ring-1 ring-inset ring-foreground/40` (**already shipped** in `FileList`) |
| **dragging** (the row being moved) | source row at `opacity-50` | `opacity-50` on the dragged container |
| **dirty / unsaved** | a 6px `primary` dot replacing or preceding the type icon (VS Code shows a dot + amber name; we use the engine accent) | `bg-primary rounded-full size-1.5`; do **not** recolor the whole name |
| **error diagnostic** | name + icon in red | `text-danger-500` via existing `DiagnosticsLabel` / `useDiagnosticColor` |
| **warning diagnostic** | name + icon in amber | `text-warning-500` (same path) |
| **disabled** (syncing) | row dimmed | `opacity-50 pointer-events-none` (FileOptionsButton already disables its items while `syncStatus` is busy) |

Selected + error compose: the `primary` accent bar still shows, the name stays
`text-danger-500` (severity wins on the text, selection wins on the bar/fill).

### 2.4 Indent guides (the VS Code vertical containment lines)

VS Code draws one faint vertical rule per ancestor depth, so the eye can trace a child
back up to its folder. Because rows are uniform-height and absolutely positioned by the
virtualizer, the cleanest implementation is **N absolutely-positioned 1px columns inside
the row's left padding zone**, one per depth level `0..depth-1`.

- **Geometry:** each guide sits at `x = BASE_INDENT + i·INDENT_PER_DEPTH + (INDENT_PER_DEPTH/2)`
  for `i in 0..depth-1` (centered in each indentation step). `INDENT_PER_DEPTH = 16`,
  `BASE_INDENT = 12` — reuse the existing constants in `FileItem.tsx`.
- **Token:** `bg-foreground/10` (a 1px-wide `<span>` spanning full row height). This is the
  same 10% white as the editor's dividers (`--color-divider`) — consistent and quiet.
- **Active-ancestor guide (optional polish):** when a row is selected, brighten the guide of
  its *direct* parent depth to `bg-foreground/30` so the eye snaps to the containing folder
  (VS Code's "active indent guide"). Skip in v1 if it complicates the virtualizer.
- **Why per-row, not a single overlay:** the virtualizer renders only visible rows at
  arbitrary scroll offsets; a global SVG overlay would need scroll-synced redraw. Per-row
  1px spans are free (they ride along in each row's transform) and stay pixel-aligned.

```
depth 0   │file.sd                 (no guide)
depth 1   ╎  ╷child.sd             (1 guide @ x=20)
depth 2   ╎  ╎  ╷deep.sd           (2 guides @ x=20, x=36)
          ↑  ↑
       guide0 guide1  — each a 1px bg-foreground/10 span, full row height
```

### 2.5 File-type → icon mapping (from the existing `icons.generated.tsx` set)

The icon set is **Tabler-style outline** (24×24, `stroke-width=2`, `currentColor`,
`stroke-linecap=round`). All render mono in `text-foreground/50`. There is **no dedicated
`Folder` icon** — recommendation in §2.6.

| Class of file | Match | Icon (exists) | Notes |
|---|---|---|---|
| Sparkdown script | `*.sd` | `Script` | The scroll glyph — semantically perfect for screenplay scripts; reserves `FileCode` for code-ish. (Alt: `FileText`.) |
| Plain text / markdown | `*.txt`, `*.md`, `*.name` | `FileText` | lined-document glyph |
| Code / data | `*.json`, `*.js`, `*.ts`, `*.csv` | `FileCode` | angle-bracket document |
| Image | `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.svg` | `Photo` | mountains-in-frame |
| Audio (music) | `*.mid`, `*.mp3`, `*.ogg`, `*.wav`, `*.m4a` | `Music` | beamed-notes |
| Audio (sfx/voice) | by folder convention (`sfx/`, `vo/`) | `Headphones` | distinguishes sfx from music if the project conventionally splits them; otherwise fall back to `Music` |
| URL | `*.url` | `Link` | matches the Assets ▸ URLs tab icon already in use |
| Archive / bundle | `*.zip` | `FileZip` | — |
| PDF | `*.pdf` | `FileTypePdf` | — |
| HTML | `*.html` | `FileTypeHtml` | — |
| Synth / waveform | `*.synth` or synth defines | `WaveSaw` | engine-specific |
| Fallback (unknown) | `*` | `FileText` | never leave a row icon-less |

Implementation: a pure `iconForPath(path, isDirectory): IconComponent` helper (no React) in
`utils/fileTree.ts` or a sibling `utils/fileIcon.ts`, unit-testable like the rest of the
tree module. Keyed by lowercased extension via a `Record<string, IconComponent>` with the
class-fallbacks above.

> **Color-coded icons?** VS Code's Seti/Material themes tint by language. **Recommend NOT**
> tinting in v1 — the engine is a quiet dark surface and a rainbow of icons fights principle
> #1. Keep all icons `text-foreground/50`; let *diagnostics* (red/amber) and *selection*
> (primary) be the only color signals. Revisit per-type tint only if users ask.

### 2.6 The missing Folder icon — recommendation

There is no folder glyph. Three options, in order of preference:

1. **(Recommended, zero new assets)** Use `Binder` for a collapsed folder and keep the
   `ChevronRight`→`rotate-90` twistie as the open/closed signal. `Binder` is a closed
   rectangular binder with horizontal lines — reads clearly as "container of documents" and
   is already imported-friendly. When expanded, render the same `Binder` at full
   `text-foreground` weight (vs `/50` collapsed) so expansion has an icon-level cue too.
2. Use `Files` (the stacked-sheets glyph) for folders. Slightly weaker "container" read than
   `Binder` but very recognizable; note `Files` is **already the Assets ▸ Files tab icon**,
   so reusing it for every folder row creates visual collision with that tab — prefer
   `Binder` to avoid it.
3. **(Best fidelity, needs building)** Add a real `Folder` / `FolderOpen` pair to
   `icons.generated.tsx` (Tabler `folder` / `folder-open` paths). This is the only option
   that gives the canonical closed/open folder shape. ~10 lines, two SVG paths, matches the
   generator format exactly. **Listed in §7 "needs building" as optional-but-nice.**

Decision for v1: **`Binder` collapsed / `Binder` at full weight expanded**, twistie carries
the rotation. Add the real `Folder`/`FolderOpen` pair in a follow-up if the closed/open
binder doesn't read well in testing.

### 2.7 Typography & spacing

- Row font: `text-base` (16px) — matches current `FileItem` and the 16px mobile minimum that
  avoids iOS zoom-on-focus. (Current code uses `text-base`; keep it.)
- Folder name `font-medium`, file name `font-normal` (shipped).
- `.ext` suffix `opacity-30` (shipped).
- Gap between icon and name: `gap-2` (8px). Between twistie and icon: rely on the fixed
  column widths, no extra gap.
- Row horizontal padding: keep the existing `px-5` outer but note the indent zone is the
  `paddingLeft` inline-style (`BASE_INDENT + depth·INDENT_PER_DEPTH`) — don't double-count.

---

## 3. Interaction spec

### 3.1 Primary gestures

| Gesture | Folder row | File row |
|---|---|---|
| **Tap / click** | toggle expand/collapse (shipped: `onToggle`) | open in editor (shipped: `openFileEditor`) |
| **Long-press** (≥ 400ms, touch) | open context menu (Rename / Move to… / New File here / New Folder here / Delete) | open context menu (Open / Rename / Move to… / Duplicate / Delete) |
| **Right-click** (pointer) | same context menu | same context menu |
| **Tap the ⋮** | same context menu (the always-visible accelerator) | same context menu |
| **Drag** (pointer; touch = secondary, see §3.5) | — (folders are drop *targets*) | pick up → drop on a folder to move |

The **⋮ button and the long-press menu open the same `DropdownContent`** — one menu
definition, three triggers (tap-⋮, long-press, right-click). This is the core mobile
adaptation of VS Code's hover-reveal actions: **the actions are always one tap away**, never
hidden behind hover.

### 3.2 Row context menu (replaces & extends today's Rename/Delete)

Built on the existing `Dropdown*` primitives (`DropdownRoot/Trigger/Content/Item/Sub`).
Current `FileOptionsButton` has only Rename + Delete; extend to:

```
File row                         Folder row
─────────                        ──────────
Open                       ⏎     New File…              +
Rename…                    ✎     New Folder…            ⊞
Move to…                   →     ─────────────
Duplicate                  ⧉     Rename…               ✎
─────────────                    Move to…              →
Delete                     🗑     ─────────────
                                 Delete                🗑
```

Icons (all exist): `Pencil` (Rename), `Trash` (Delete), `Plus` (New File / inside "New…"),
`ArrowRight` (Move to…), `Files` or `Package` (Duplicate). "Move to…" opens a **second
dropdown / sheet listing folders** (a `DropdownSub` on desktop; a bottom sheet on mobile —
see §4). Items stay `disabled` while `syncStatus` is busy (shipped pattern).

### 3.3 Inline rename (VS Code parity: stem pre-selected)

Already implemented well in `FileItem` — keep and refine:
- Entering rename swaps the label for a transparent `<input>`, auto-focus, **selects the
  stem only** (`setSelectionRange(0, name.length)` — shipped; this is the VS Code behavior).
- Commit on Enter / blur / click-outside; cancel on Escape (shipped).
- **Refinement:** show the row in a subtle "editing" frame — `ring-1 ring-inset
  ring-primary/50 rounded` on the input wrapper — so it's obvious the row is live. Keep the
  `.ext` suffix visible and *outside* the editable region (rename edits the stem, the
  extension is appended on commit — shipped logic in `commit()`).
- **Mobile:** the input is 16px (`text-base`) to prevent iOS focus-zoom. The on-screen
  keyboard pushing the row up is fine — rename is a focused, modal-ish moment.
- The inline input is the **one justified exception** to uniform-height purity: it stays
  within the 52px row (single-line), so the virtualizer is unaffected.

### 3.4 Toolbar (the explorer header actions)

VS Code puts New File / New Folder / Refresh / Collapse-All in the explorer title bar,
hover-revealed. We make them **always visible** in the existing toolbar row (currently only
"New Folder" lives there in `FileList.tsx`). Target layout — a single flex row, sticky above
the scroller, `bg-engine-900`:

```
┌──────────────────────────────────────────────────────────────────────┐
│ [🔍 Search files…                    ]   [⊞+] [📁+] [⤢] [⇅]          │
└──────────────────────────────────────────────────────────────────────┘
   search input (flex-1)                    new   new   collapse sort
                                            file  folder  all
```

| Control | Icon | Action | Notes |
|---|---|---|---|
| Search | `Search` | filter the visible tree by substring | uses `filterPaths` (shipped in `fileTree.ts`); matches keep ancestors (already documented there) |
| New File | `Plus` (in a file-ish affordance) | create file at root / in selected folder | for Scripts/URLs panes this overlaps the FAB — see §3.7 |
| New Folder | `Plus` over `Binder`, or just `Plus`+label | `createFolder` (shipped via `newFolder()`) | already present as a labeled ghost button; keep label on wide, icon-only on narrow |
| Collapse All | `ArrowBackUp` or a new chevron-collapse icon | clear the `expanded` set | one-liner: `setExpanded(new Set())`. VS Code's most-loved explorer button. |
| Sort | `Sliders` or `Sort` | open a `Dropdown` of sort modes | see §3.6 |

On a phone the row is tight; collapse the toolbar to **search field + a single ⋮ "more"
overflow** that contains New Folder / Collapse All / Sort, keeping New File on the FAB. (See
§4.)

### 3.5 Search / sort / filter

- **Search:** a `SearchInput` (needs building — §7) bound to a `useState(query)`; gate the
  paths through `filterPaths(paths, query)` (shipped) *before* `buildFileTree`, so matching
  files auto-reveal their ancestor folders (the module already guarantees this). Clearing the
  query restores expand/collapse state. A small `X` (`X` icon, exists) clears the field.
  Project-wide content search (`SearchInFilesMessage`) is a Phase-1 engine concern — the UI
  affordance is the same field with a toggle, but v1 ships **filename** filter only.
- **Sort:** `DropdownCheckboxItem` group (exists), single-select feel: *Name (A–Z)*, *Name
  (Z–A)*, *Type*, *Recently modified*. Default = current behavior (folders first, then name,
  case-insensitive — shipped in `fileTree.ts` `sortNodes`). Persist the choice in
  `WorkspaceStore` `panels[panel]`.
- **Filter:** out of scope for v1 visual layer beyond search; the glob include/exclude is
  already a per-pane prop and not user-facing.

### 3.6 Breadcrumbs

VS Code shows a breadcrumb of the open file's ancestor folders. For this per-pane, drilled-in
editor (`FileEditorNavigation` is the open-file header), put breadcrumbs **in that header**,
not in the list:
- Render `chapters › act1 › intro.sd` as `ArrowRight`-separated segments
  (`text-foreground/50`, last segment `text-foreground`), derived from the open file's
  relative path (`path.split('/')`).
- Tapping a segment closes the editor and reveals + scrolls the list to that folder
  (expands ancestors). Tapping the last (file) segment is a no-op.
- This replaces the centered filename slot in `FileEditorNavigation` with a horizontally
  scrollable breadcrumb (still single-line, ellipsis the *front* not the back so the filename
  stays visible). **Outside** the virtual list, so no height constraint.
- v1 can ship without breadcrumbs (the list itself shows the hierarchy); list it as a
  fast-follow.

### 3.7 Drag-to-move (mobile is the hard part)

Native HTML5 DnD is already wired in `FileList.tsx` (`draggable`, `onDragStart/Over/Drop`,
the `dropTarget` ring) and **works on desktop**. Native DnD on touch is **unreliable**
(no `dragstart` from touch on most mobile browsers). Strategy:

1. **Reliable path (mobile + desktop): "Move to…" action.** Every row's context menu has
   **Move to…**, opening a folder picker (bottom sheet on mobile, `DropdownSub` on desktop)
   listing all folders + "(root)". Selecting one calls the shipped `moveFile`/`moveFolder`.
   **This is the primary, always-works mechanism** and the one to build first.
2. **Desktop nicety: keep native drag.** The existing `draggable` + drop-ring stays for
   pointer users — it's already there and costs nothing.
3. **Touch drag (optional, later):** if a true drag feel is wanted on touch, implement a
   pointer-events-based long-press-then-drag (`pointerdown` → 400ms hold → follow `pointermove`
   with a floating row ghost → `pointerup` over a folder = drop). This is a custom gesture,
   **not** native DnD, and is explicitly a Phase-1+ polish item, **not** required for v1. The
   "Move to…" action covers the need.

> Decision: **ship "Move to…" as the canonical move; keep native drag as desktop sugar;
> defer custom touch-drag.** This honors mobile-first without a custom gesture engine.

### 3.8 Multi-select (defer, but design the seam)

VS Code supports shift/ctrl multi-select + bulk move/delete. On mobile this is a
*selection-mode* (long-press a row → enter selection mode → checkboxes appear → a sticky
action bar shows Move / Delete count). **Defer to a later phase.** The seam: the row already
keys off `path`; a `Set<string> selected` in `FileList` + a sticky bottom action bar (outside
the virtual list) is all that's needed. Note it; don't build it in v1.

---

## 4. Mobile adaptations (explicit deltas vs desktop)

| Concern | Desktop | Mobile (this editor's primary target) |
|---|---|---|
| Row actions | hover-reveal would be fine | **always-visible ⋮** + **long-press** menu; never hover-gated |
| Touch target | mouse pointer is precise | row inner hit area ≥ 44px (52px slot already satisfies); ⋮ button ≥ 44px (`size-icon` is 40 — bump the *tap area* with padding, keep the 20px glyph) |
| Context menu | right-click → dropdown anchored at cursor | long-press → **bottom sheet** (full-width, thumb-reachable) rather than a tiny anchored dropdown. Reuse `DropdownContent` styling but anchor bottom on coarse-pointer (`@media (pointer: coarse)`). |
| Move | drag-and-drop | **"Move to…" bottom sheet** is the path; drag is desktop-only |
| Toolbar | full row: search + New File + New Folder + Collapse + Sort | **search field + one ⋮ overflow** (New Folder / Collapse / Sort) + the FAB for New File. Don't crowd a phone-width header. |
| Breadcrumbs | in the file-editor header | same, but ellipsis the *front* and make it horizontally swipeable |
| Rename input | 14–16px fine | **16px (`text-base`)** mandatory to avoid iOS focus-zoom |
| FAB | optional | keep the existing bottom-docked FAB (New Script / Upload / Add URL) — it's the thumb-zone primary create action and is already shipped across panes |
| Scrollbars | visible | `[scrollbar-gutter:stable]` already set; thin themed scrollbar tokens already exist |

**Coarse-pointer detection:** branch menu placement on `window.matchMedia('(pointer:
coarse)')` — bottom sheet vs anchored dropdown. Radix's `DropdownContent` can be styled to
dock bottom; or wrap a simple Preact-native bottom sheet (no Radix Dialog — see memory
`feedback_radix_dialog_breaks_ssr`).

---

## 5. ASCII mockups

> White-on-navy. `■` = `engine-800` selected fill, `▏` = `primary` accent bar,
> `╎` = indent guide (`foreground/10`), `▸/▾` = twistie, `⋮` = always-visible options.

### 5.1 Collapsed (top-level, mixed folders + files)

```
┌────────────────────────────────────────────────────────────────┐
│  🔍 Search files…                         📁+  ⤢  ⇅            │  ← sticky toolbar (engine-900)
├────────────────────────────────────────────────────────────────┤
│  ▸  📒  chapters                                            ⋮   │  folder: Binder icon, ▸ collapsed, bold white
│  ▸  📒  characters                                         ⋮   │
│  ▸  📒  music                                              ⋮   │
│     📜  main.sd                                            ⋮   │  file: Script icon, /80 white, no twistie
│     📜  outline.sd                                         ⋮   │
│     🖼  cover.png                                  .png    ⋮   │  Photo icon, ext suffix /30
└────────────────────────────────────────────────────────────────┘
                                              ╭──────────────╮
                                              │  ＋ New Script│  ← FAB (engine-700), thumb zone
                                              ╰──────────────╯
```

### 5.2 Expanded with nesting + indent guides + a selected row + an error

```
┌────────────────────────────────────────────────────────────────┐
│  🔍 act                                    📁+  ⤢  ⇅            │
├────────────────────────────────────────────────────────────────┤
│  ▾  📒  chapters                                           ⋮   │  expanded (▾), icon full-weight
│  ╎  ▾  📒  act1                                            ⋮   │  depth1: one guide ╎ @x20
│  ╎  ╎     📜  intro.sd                                     ⋮   │  depth2: guides @x20,x36
│ ▏■ ╎  ╎     📜  rising.sd                                  ⋮   │  ← SELECTED: ▏primary bar + ■ engine-800 fill
│  ╎  ╎     📜  climax.sd                              (!)   ⋮   │  ← ERROR: name+icon text-danger-500
│  ╎  ▸  📒  act2                                            ⋮   │
│  ▸  📒  characters                                         ⋮   │  collapsed sibling at depth0
└────────────────────────────────────────────────────────────────┘
```

### 5.3 Drag in progress (desktop) — file picked up, hovering a folder

```
┌────────────────────────────────────────────────────────────────┐
│  ▾  📒  chapters                                           ⋮   │
│  ╎  ▾  📒  act1                                            ⋮   │
│  ╎  ╎     📜  intro.sd            ░░░░░░░ (opacity-50)     ⋮   │  ← source row, dragging, dimmed
│ ┌──────────────────────────────────────────────────────────┐  │
│ │▸  📒  characters                                          │  │  ← DROP TARGET: bg-foreground/10
│ └──────────────────────────────────────────────────────────┘  │     + ring-1 ring-inset ring-foreground/40 (shipped)
│         👻 intro.sd  ← drag ghost follows pointer              │
└────────────────────────────────────────────────────────────────┘
```

### 5.4 Inline rename in progress (stem selected)

```
┌────────────────────────────────────────────────────────────────┐
│  ╎  ╎     📜 ┃▒intro▒┃.sd                                  ⋮   │  ← input, stem "intro" selected (▒),
│              └ ring-1 ring-inset ring-primary/50 ┘             │     ".sd" shown but outside editable region
└────────────────────────────────────────────────────────────────┘
   Enter / blur = commit · Esc = cancel  (shipped behavior)
```

### 5.5 Mobile context menu (long-press → bottom sheet)

```
┌────────────────────────────────────────────────────────────────┐
│   list dims behind a scrim …                                   │
├────────────────────────────────────────────────────────────────┤
│   intro.sd                                                     │  ← sheet header = the target
│   ───────────────────────────────────────────────────────     │
│   ⏎  Open                                                      │
│   ✎  Rename…                                                   │
│   →  Move to…                                                  │
│   ⧉  Duplicate                                                 │
│   ───────────────────────────────────────────────────────     │
│   🗑  Delete                                            (red)  │  ← text-danger-500
└────────────────────────────────────────────────────────────────┘     bg-popup, docked bottom on (pointer:coarse)
```

---

## 6. Prioritized change list (incremental, cite-by-file)

Ordered so each step is independently shippable and visible. Production files only; this doc
modifies nothing.

### Step 1 — File-type icons + folder icon (biggest visual win, low risk)
- **New** `impower-dev/src/modules/spark-editor/utils/fileIcon.ts`: pure
  `iconForPath(path, isDirectory, expanded): IconComponent` using the §2.5 map. Keyed by
  lowercased ext; folder → `Binder`. Unit-testable (no React), sits beside `fileTree.ts`.
- **Edit** `file-list/FileItem.tsx`: add a 24px icon column between the twistie `<span>` and
  the `DiagnosticsLabel`. Render `iconForPath(...)` at `size-5` in a `w-6 flex-none` box,
  `text-foreground/50` (inherits `text-danger-500`/`text-warning-500` from the
  `DiagnosticsLabel` wrapper automatically since it's `currentColor`). Folder icon at full
  weight when `expanded`.
- Icons used: `Binder`, `Script`, `FileText`, `FileCode`, `Photo`, `Music`, `Headphones`,
  `Link`, `FileZip`, `FileTypePdf`, `FileTypeHtml`, `WaveSaw` — **all already exist**.

### Step 2 — Indent guides
- **Edit** `file-list/FileItem.tsx`: inside the row, before the twistie, render `depth`
  absolutely-positioned 1px `<span>`s at `x = BASE_INDENT + i·INDENT_PER_DEPTH +
  INDENT_PER_DEPTH/2`, full row height, `bg-foreground/10`. Reuse the existing
  `BASE_INDENT`/`INDENT_PER_DEPTH` constants. The row container needs `relative` (Button base
  already is `relative`).

### Step 3 — Selected-row state
- **Edit** `FileItem.tsx` to accept a `selected?: boolean`; when true add `bg-engine-800/40`
  and a `before:` 2px `bg-primary` left bar. **Edit** `FileList.tsx` to derive `selected`
  from the workspace's active editor filename (compare `row.path` to the open file's relative
  path — the same identity `openFileEditor` already uses).

### Step 4 — Context menu expansion (Open / Move to… / Duplicate) + always-visible on mobile
- **Edit** `file-list/FileOptionsButton.tsx`: add `Open` (files), `Move to…`, `Duplicate`,
  and folder-specific `New File here` / `New Folder here` items. Icons: `ArrowRight`,
  `Files`/`Package`, `Plus`. Keep the `disabled`-while-syncing pattern.
- **Edit** `FileItem.tsx`: wire **long-press** (`pointerdown` + 400ms timer, cancel on
  move/up) and **`onContextMenu`** to open the same menu the ⋮ opens. On `(pointer: coarse)`,
  render the menu as a bottom sheet (dock-bottom variant of `DropdownContent`).
- The ⋮ is **already always-visible** in `FileItem` (good — keep it; do **not** hide it
  behind hover).

### Step 5 — "Move to…" folder picker (the mobile-safe move)
- **New** small `MoveToMenu`/sheet listing folders from the current `tree`
  (`tree.filter(n => n.isDirectory)`) + "(root)". On select, call the shipped
  `Workspace.fs.moveFile`/`moveFolder` (same calls `handleDropInto` already uses in
  `FileList.tsx`). Reuse `DropdownSub` (desktop) / bottom sheet (mobile).
- Native drag in `FileList.tsx` stays as-is (desktop sugar).

### Step 6 — Toolbar: Collapse-All + Search field + Sort
- **Edit** `FileList.tsx` toolbar row (currently just the "New Folder" button): add
  **Collapse All** (`setExpanded(new Set())`, icon `ArrowBackUp` or a new collapse icon) and a
  **search field**. Gate `relativePaths` through `filterPaths(paths, query)` (shipped) before
  `buildFileTree`. Add a **Sort** `Dropdown` (Name A–Z / Z–A / Type / Modified) persisted in
  `WorkspaceStore`.
- Mobile: collapse New Folder / Collapse / Sort into a single ⋮ overflow; keep search + FAB.

### Step 7 — Dirty indicator
- **Edit** `FileItem.tsx`: accept `dirty?: boolean`; render a 6px `bg-primary rounded-full`
  dot in place of (or before) the type icon. Source the flag from the workspace's
  unsaved-edit state when it exists (engineering doc Phase 3 "per-path dirty tracking").

### Step 8 (fast-follow) — Breadcrumbs in the file-editor header
- **Edit** `file-editor-navigation/FileEditorNavigation.tsx`: replace the centered filename
  slot with an `ArrowRight`-separated, front-ellipsized breadcrumb built from the open file's
  path segments; tapping a segment closes the editor and reveals that folder in the list.

### Deferred (note the seam, don't build)
- Multi-select / selection-mode + bulk action bar (§3.8).
- Custom touch-drag gesture (§3.7.3) — "Move to…" covers the need.
- Active-ancestor indent-guide highlight (§2.4 polish).
- Per-type icon tinting (§2.5 — recommend against for now).

---

## 7. Needs building (new primitives / icons)

| Item | Why | Effort | Required for v1? |
|---|---|---|---|
| `iconForPath` helper (`utils/fileIcon.ts`) | map extension → existing icon | trivial, pure fn | **yes** (Step 1) |
| `SearchInput` primitive (impower-ui) | toolbar search; no `Input` exists in `components/index.ts` | small — a styled `<input>` + `Search`/`X` icons, cn() idiom | yes (Step 6) — can inline a local input first |
| Bottom-sheet menu variant | mobile long-press menu / "Move to…" on coarse pointer | small — style `DropdownContent` to dock bottom, or a Preact-native sheet (avoid Radix Dialog per `feedback_radix_dialog_breaks_ssr`) | yes (Steps 4–5) |
| **`Folder` / `FolderOpen` icons** | canonical closed/open folder shape (vs the `Binder` stand-in) | ~10 lines, 2 Tabler SVG paths in `icons.generated.tsx` | **optional** — `Binder` ships v1; add if it doesn't read well |
| Collapse-all icon | a chevron-into-bar glyph; `ArrowBackUp` is a serviceable stand-in | optional new icon | no — reuse `ArrowBackUp` |
| `ContextMenu` primitive (Radix `@radix-ui/react-context-menu`) | true right-click menu (vs reusing Dropdown) | medium — mirrors the existing Dropdown wrapper | no — reusing `Dropdown*` is fine for v1 |

**Everything else uses existing primitives** (`Button`, `Dropdown*`, `Ripple`, `Tabs`,
`Router`) and **existing icons** (`ChevronRight`, `Binder`, `Script`, `FileText`, `FileCode`,
`Photo`, `Music`, `Headphones`, `Link`, `FileZip`, `FileTypePdf`, `FileTypeHtml`, `WaveSaw`,
`Plus`, `Pencil`, `Trash`, `DotsVertical`, `ArrowRight`, `ArrowBackUp`, `Search`, `X`,
`Files`, `Package`, `Sliders`).

---

## 8. Consistency checklist (matches the rest of the editor chrome)

- List surface `bg-engine-900`, sticky toolbar `bg-engine-900` — same as `LogicList`/`Assets`
  tab bars and `FileEditorNavigation`.
- Create CTA is the bottom-docked `variant="fab"` (`engine-700`) — unchanged across Scripts /
  Files / URLs; the toolbar's New Folder is a `ghost` button (shipped).
- Hover/press overlays are `foreground/5` / `foreground/[0.12]` everywhere (Button + Dropdown
  already standardize this).
- Menus are `bg-popup` with `Ripple` items (Dropdown standard).
- Diagnostics keep flowing through `DiagnosticsLabel` + `useDiagnosticColor`
  (`text-danger-500` / `text-warning-500`) — the only non-accent color on a row.
- The `primary` (sky-400) accent is reserved for **selection, dirty, and search-match** — a
  single, recognizable "this is the engine's blue highlight" signal.

---

### Sources (VS Code explorer UX patterns)
- [VS Code User Interface docs](https://code.visualstudio.com/docs/getstarted/userinterface)
- [Sticky scroll for the file explorer (vscode#194903)](https://github.com/microsoft/vscode/issues/194903)
- [Change indent for File Explorer tree](https://www.ryanchapin.com/vscode-change-indent-for-file-explorer-tree/)
- [Making the explorer tree more readable](https://stephencharlesweiss.com/vscode-explorer-tree-resize/)
