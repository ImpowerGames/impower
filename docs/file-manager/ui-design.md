# File manager: the Scripts and Assets pages

The project's files are browsed on two pages: **Scripts** (`#scripts`) holds every
script, and **Assets** (`#collection`) holds images, sounds, fonts and links. Both
are folders inside the one project, scoped by the file types of Settings, File types;
the files are stored in the browser's private file system by the
`packages/opfs-workspace` worker, reached through the `WorkspaceFileSystem`
controller, and the shell around them is described in [`impower-dev/docs/architecture.md`](../../impower-dev/docs/architecture.md#the-shell-the-routes-and-the-layouts).

## Where it lives

Both pages are built on one page frame,
`impower-dev/src/modules/spark-editor/components/library-page/`:

| Part | File |
|---|---|
| The page: toolbar, search, a virtualized list or grid of rows | `LibraryPage.tsx` (rows in `VirtualList` from `@impower/impower-ui`) |
| The folder path, with Parent folder, and its menu holding Recycle bin | `Trail.tsx` |
| Search | `SearchBox.tsx` |
| Sort by and Order | `SortMenu.tsx` |
| Selecting several rows, and Stop selecting | `SelectionBar.tsx`, `useSelectionKeys.ts` |
| Renaming a row in place | `NameRow.tsx` |
| Move… and Delete… | `MoveDialog.tsx`, `DeleteDialog.tsx` |
| Dragging rows into a folder | `useLibraryDrag.ts` |
| An empty folder or project | `EmptyState.tsx` |

Each page supplies its rows and its row menu: `scripts-page/ScriptsPage.tsx` with
`RowMenu.tsx`, and `assets/Assets.tsx` with `AssetRowMenu.tsx`, whose entries depend on what it is for: a folder
(Open, Select, Upload here…, New folder inside…, Rename, Move…, Delete), a file
(Select, Rename, Move…, Delete, and Variants for a picture with variants) and the
asset inspector (Rename, Move…, Download, Delete). The
listings and selections are store state, in `workspace/scriptsListing.ts`,
`workspace/scriptsSelection.ts`, `workspace/assetsListing.ts` and
`workspace/assetsSelection.ts`. A deleted file is moved to the project's Recycle bin
(`workspace/moveToTrash.ts`) rather than removed; the folder-path button's menu opens
the bin (`trash-panel/TrashPanel.tsx`), where each deletion can be restored.

## Rules

- Every row is a `ListRow` from `@impower/impower-ui`, at least 44px tall, and every
  action a row has is in its menu, so nothing depends on hover and Move… is the way
  to move a row by touch.
- Colours are the semantic tokens of
  [`impower-dev/docs/design/tokens.md`](../../impower-dev/docs/design/tokens.md); no
  page sets a palette value.
- Icons come from the `@impower/impower-ui` icon set (see
  [How to add a surface](../../impower-dev/docs/design/adding-a-surface.md#icons)).
- Below desktop width the Assets page opens the asset
  inspector as a sheet; at desktop width the inspector docks beside the page.
