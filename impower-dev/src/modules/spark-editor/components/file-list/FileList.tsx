// `@impower/spark-editor-protocol` re-exports types from
// `vscode-languageserver-protocol` (CJS-only). A static import here trips
// Vite SSR with "exports is not defined" during preact-registry walk.
// `Workspace` constructs WorkspaceWindow (touches localStorage/window) at
// module load. Both must be deferred — see memory:
// feedback_defer_cjs_imports_in_ssr_loaded_modules.
import {
  Button,
  DotsVertical,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
  FolderPlus,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  buildFileTree,
  childrenRows,
  filterPaths,
  flattenVisibleRows,
  FOLDER_SENTINEL,
  resolveScopePath,
  type FileTreeNode,
} from "../../utils/fileTree";
import { extOf, fileCategory, isImagePath } from "../../utils/fileIcon";
import globToRegex from "../../utils/globToRegex";
import workspace from "../../workspace/WorkspaceStore";
// Type-only import (fully erased at build) — safe despite the protocol package's
// CJS runtime exports that would otherwise trip Vite SSR (see the file header).
import type { FileData } from "@impower/spark-editor-protocol/src/types/workspace/FileData";
import FileBreadcrumb from "./FileBreadcrumb";
import FileItem from "./FileItem";
import FileListHeader, {
  type SortKey,
  type SortOrder,
  type TypeFilter,
} from "./FileListHeader";
import { useTreeDrag } from "./useTreeDrag";

// Thumbnail width requested from the SW — keep in sync with FileItem's `?thumb`.
const THUMB_WIDTH = 144;

// URLs whose thumbnail has already been requested this session, so re-mounting
// the list (e.g. switching panes) doesn't re-issue fetches for them.
const warmedThumbs = new Set<string>();

// Background tick. Uses requestIdleCallback so warming ONLY runs when the page
// has spare time — never stealing frames from the user or the game-preview
// animation. (Generating a thumbnail decodes the source image, which shares the
// renderer's decode capacity with the preview; forcing it on a timer visibly
// stutters the preview, so we stay polite. The trade-off: while the preview is
// animating hard the page is rarely idle, so warming makes little progress —
// the real fix for the recurring hitch is the persistent SW cache.)
const schedule = (cb: () => void): void => {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => cb(), { timeout: 4000 });
  } else {
    setTimeout(cb, 400);
  }
};

/**
 * Warm the SW thumbnail cache for a batch of image urls in the background, so
 * scrolling never triggers a cold-decode burst (the "frozen on first scroll"
 * hitch). A couple of fetches in flight at a time with a gap between batches;
 * the SW does the actual decode off the main thread. Aborts when the list
 * changes / unmounts.
 */
function prewarmThumbnails(urls: string[], signal: AbortSignal): void {
  const pending = urls.filter((u) => !warmedThumbs.has(u));
  if (pending.length === 0) {
    return;
  }
  let i = 0;
  // One decode at a time: thumbnail generation shares the renderer's image
  // decode capacity with the game preview, so we keep the footprint minimal.
  const CONCURRENCY = 1;
  const pump = () => {
    if (signal.aborted || i >= pending.length) {
      return;
    }
    const batch: Promise<unknown>[] = [];
    while (i < pending.length && batch.length < CONCURRENCY) {
      const url = pending[i++]!;
      warmedThumbs.add(url);
      // Reading the (tiny) body lets the SW finish generating + caching; the
      // result is discarded. Failures are ignored (the row's <img> still works).
      batch.push(
        fetch(url, { signal })
          .then((r) => r.arrayBuffer())
          .catch(() => undefined),
      );
    }
    void Promise.all(batch).then(() => {
      if (!signal.aborted) {
        schedule(pump);
      }
    });
  };
  schedule(pump);
}

// Pure helper that doesn't need Workspace (Workspace.fs.getFilename used
// to be the source of truth, but it's literally `uri.split('/').pop()`).
const getFilenameFromUri = (uri: string) => uri.split("/").pop() ?? "";

// Project-relative path of a file uri (`file://<projectId>/<path>` -> `<path>`).
// Falls back to the basename for uris outside the project dir. This path is the
// row identity threaded into FileItem so nested files sharing a basename never
// collide (on React keys or on rename/delete/open).
const relativePathFromUri = (
  uri: string,
  projectId: string | null | undefined,
) => {
  const prefix = `file://${projectId}/`;
  return projectId && uri.startsWith(prefix)
    ? uri.slice(prefix.length)
    : (uri.split("/").pop() ?? "");
};

const isSentinelUri = (uri: string) => uri.endsWith(`/${FOLDER_SENTINEL}`);

export type FileListProps = {
  /** Glob of filenames to INCLUDE in this list. Defaults to `*`. */
  include?: string;
  /** Glob of filenames to EXCLUDE from this list. */
  exclude?: string;
  /** Empty-state content (icon + label) — only shown when list is empty. */
  emptyState?: ComponentChildren;
  /** "New / Upload" call-to-action button rendered below the list. */
  action?: ComponentChildren;
  /**
   * Called with `true` once the list is scrolled off the top, `false` at the
   * top. Lets the parent collapse the (sibling) FAB on scroll — mirrors main's
   * `<s-collapsible collapsed="scrolled">`, whose sentinel/IntersectionObserver
   * the FAB lives outside of here.
   */
  onScrolledChange?: (scrolled: boolean) => void;
  /**
   * Called with the current dive-mode folder scope (`""` = project root, or e.g.
   * `chapters/act1`) whenever it changes — `""` on desktop (tree mode). Lets the
   * parent's create FAB (Upload / Add URL / New Script) drop new files INTO the
   * folder the user is currently viewing on mobile.
   */
  onScopeChange?: (scopePath: string) => void;
};

// Slot height for the virtualizer. The row button itself is h-14 (56px),
// but the legacy `outletEl.itemHeight = 52` packs the rows 52px apart —
// each button visually overlaps its neighbor's slot by 4px (no visible
// artifact since both are transparent/same-color). Match that spacing
// or rows render 4px further apart than main.
const ITEM_HEIGHT = 52;

/**
 * Virtualized folder tree of files for the Assets and Logic > Scripts panes.
 * Files (matched by the include/exclude globs) plus any `.folder` sentinels are
 * built into a nested tree (see utils/fileTree); folders expand/collapse, and a
 * file can be dragged onto a folder to move it there. A flat project renders as
 * a flat list (every file at depth 0), identical to before.
 *
 * Subscribes to LSP `DidChangeWatchedFiles` so the tree stays in sync with
 * disk; newly created `.sd` scripts auto-open in the editor.
 */
export default function FileList({
  include = "*",
  exclude,
  emptyState,
  action,
  onScrolledChange,
  onScopeChange,
}: FileListProps) {
  const [uris, setUris] = useState<string[] | null>(null);
  // uri -> full FileData (src for thumbnails, size/modified for the row caption
  // + sort/filter). Kept beside `uris` so a reload refreshes both.
  const [filesByUri, setFilesByUri] = useState<Record<string, FileData>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Dive-mode (mobile) folder scope: which folder's direct children are shown
  // (`""` = project root). Ignored in tree mode (desktop). See `diveMode` below.
  const [scopePath, setScopePath] = useState("");
  // Header controls: search-by-name, sort field + direction, Type filter.
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Report scroll-off-top so the parent can collapse the FAB.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onScrolledChange) return;
    const update = () => onScrolledChange(el.scrollTop > 0);
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [onScrolledChange]);

  // WHEEL SCROLL FIX — drive scrolling from JS instead of the compositor.
  //
  // The editor embeds a continuously-animating game-preview iframe in the SAME
  // tab. Nonstop compositing in the same renderer process wedges Chrome's wheel
  // scroll-latching: after a gesture settles, the NEXT wheel gesture is still
  // delivered to JS but the compositor applies NO scroll to any element until
  // the gesture times out (~1s) — the list (and even the scrollbar thumb)
  // freezes in place. Diagnosed with an in-page monitor: wheel events fired with
  // defaultPrevented=false, zero long tasks (main thread free), scrollTop pinned
  // mid-range, and NO scrollable element on the page moved. So it isn't our
  // CSS/JS, a preventDefault, or a main-thread block — it's the compositor input
  // path itself wedging.
  //
  // Taking the gesture onto a non-passive wheel listener + preventDefault pulls
  // it OFF that wedged path and scrolls reliably. This opts the list out of
  // threaded wheel scrolling on purpose; the main thread is never blocked here
  // (the virtualizer re-render is well under a frame), so it stays smooth. Touch
  // uses a separate compositor path (touch-action: pan-y) and isn't covered —
  // revisit only if touch scrolling shows the same wedge.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.deltaY === 0) return; // ctrl = pinch-zoom; ignore pure-horizontal
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; // delta in lines -> approx px
      else if (e.deltaMode === 2) dy *= el.clientHeight; // delta in pages
      const max = el.scrollHeight - el.clientHeight;
      const next = Math.max(0, Math.min(max, el.scrollTop + dy));
      if (next !== el.scrollTop) {
        el.scrollTop = next;
        e.preventDefault(); // off the compositor's wedged latch path
      }
      // At a scroll boundary we leave the event alone so overscroll behaves
      // normally (the scroller already sets overscroll-behavior: none).
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Make the active project id reactive so the list reloads when the user
  // switches projects.
  const projectId = workspace.signals.projectId.value;

  // Responsive presentation, switched on the SAME breakpoint the rest of the app
  // uses (WorkspaceWindow's `matchMedia("(min-width: 960px)")`):
  //   - desktop / horizontalLayout (≥960px) → TREE mode: the VS Code inline
  //     nested tree (expand/collapse in place, drag to reorganize).
  //   - mobile / vertical (<960px) → DIVE mode: Google-Drive folder navigation —
  //     one folder level at a time (depth 0, no indent), with a breadcrumb.
  // Defaults to tree mode until the flag is set (it's set synchronously on load).
  const diveMode = workspace.state.value.screen?.horizontalLayout === false;

  // Keep `.folder` sentinels (so empty folders show) plus any file matching the
  // pane's globs.
  const matchesGlobs = (uri: string) => {
    const includeRegex = include ? globToRegex(include) : /.*/;
    const excludeRegex = exclude ? globToRegex(exclude) : undefined;
    return (
      isSentinelUri(uri) ||
      (includeRegex.test(uri) && !excludeRegex?.test(uri))
    );
  };

  const loadFiles = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    const files = await Workspace.fs.getFiles(projectId!);
    const filteredUris = Object.keys(files).filter(matchesGlobs).sort();
    const filesByUri: Record<string, FileData> = {};
    for (const uri of filteredUris) {
      const file = files[uri];
      if (file) {
        filesByUri[uri] = file;
      }
    }
    return { uris: filteredUris, filesByUri };
  };

  // Initial load + reload on project / glob change.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!projectId) {
        if (!cancelled) setUris([]);
        return;
      }
      try {
        const { uris: filtered, filesByUri: fbu } = await loadFiles();
        if (!cancelled) {
          setUris(filtered);
          setFilesByUri(fbu);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[FileList] loadEntries failed:", err);
        if (!cancelled) setUris([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, include, exclude]);

  const reload = async () => {
    if (!projectId) return;
    try {
      const { uris: filtered, filesByUri: fbu } = await loadFiles();
      setUris(filtered);
      setFilesByUri(fbu);
    } catch {
      /* no-op */
    }
  };

  // LSP file-watcher → reload the tree. Mirrors the legacy relevance rules, but
  // also treats `.folder` sentinel changes as relevant so folder create/delete
  // refresh the tree.
  useEffect(() => {
    let detach: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const [
        { FileChangeType },
        { onProtocolMessage },
        { DidChangeWatchedFilesMessage },
        { Workspace },
      ] = await Promise.all([
        import("@impower/spark-editor-protocol/src/enums/FileChangeType"),
        import("@impower/spark-editor-protocol/src/protocols/MessageProtocol"),
        import(
          "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage"
        ),
        import("../../workspace/Workspace"),
      ]);
      if (cancelled) return;
      detach = onProtocolMessage(
        DidChangeWatchedFilesMessage.type,
        (message) => {
          const params = message.params;
          const changes = params.changes;
          const isRelevant = changes.some((c) => matchesGlobs(c.uri));
          if (!isRelevant) return;
          const isCreate = changes.every(
            (c) => c.type === FileChangeType.Created,
          );
          // NOTE: the legacy "don't reload during a rename" guard is gone. A
          // rename/move broadcasts only AFTER it commits (the inline input is
          // already closed), and the tree MUST refresh so a moved file lands in
          // its new folder. Auto-open is still gated on a pure create below.

          const firstUri = changes[0]?.uri || "";
          const firstFilename = getFilenameFromUri(firstUri);
          if (
            isCreate &&
            changes.length === 1 &&
            firstFilename?.endsWith(".sd")
          ) {
            // Open by project-relative path so a newly-created nested script
            // routes to the right editor identity (not just its basename).
            Workspace.window.openFileEditor(
              relativePathFromUri(firstUri, projectId),
            );
            return;
          }
          void reload();
        },
      );
    })();
    return () => {
      cancelled = true;
      detach?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, include, exclude]);

  // Background-warm the thumbnail cache for every image in this list, on idle,
  // so scrolling never triggers a cold-decode burst. Matches FileItem's exact
  // thumbnail url (so the SW caches under the same signature).
  useEffect(() => {
    if (!uris || uris.length === 0) return;
    const urls: string[] = [];
    for (const uri of uris) {
      if (!isImagePath(relativePathFromUri(uri, projectId))) continue;
      const src = filesByUri[uri]?.src;
      if (src) {
        urls.push(`${src}${src.includes("?") ? "&" : "?"}thumb=${THUMB_WIDTH}`);
      }
    }
    if (urls.length === 0) return;
    const controller = new AbortController();
    prewarmThumbnails(urls, controller.signal);
    return () => controller.abort();
  }, [uris, filesByUri, projectId]);

  // Stable handler passed to FileItem (keeps its `memo` intact): a folder tap
  // toggles expand/collapse in TREE mode, or scopes INTO the folder in DIVE
  // mode. Reads the mode off a ref so the callback identity never changes.
  const diveModeRef = useRef(diveMode);
  diveModeRef.current = diveMode;
  const onItemActivate = useCallback((folderPath: string) => {
    if (diveModeRef.current) {
      setScopePath(folderPath);
      return;
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  }, []);

  // Project-relative path -> FileData (thumbnail src + size/modified for the
  // caption + the sort/filter keys), plus the flat path list for the tree.
  const filesByPath = new Map<string, FileData>();
  const allRelativePaths: string[] = [];
  for (const uri of uris ?? []) {
    const rel = relativePathFromUri(uri, projectId);
    allRelativePaths.push(rel);
    const file = filesByUri[uri];
    if (file) {
      filesByPath.set(rel, file);
    }
  }

  // Header controls applied to the path list BEFORE the tree is built:
  //   - Type filter keeps files whose FileData category matches (an ancestor
  //     folder survives as long as it still contains a matching file).
  //   - Search keeps paths containing the query (substring over the full path,
  //     so a match keeps its ancestor folders); folders auto-expand to reveal it.
  const trimmedSearch = search.trim();
  let visiblePaths = allRelativePaths;
  if (typeFilter) {
    visiblePaths = visiblePaths.filter((p) => fileCategory(p) === typeFilter);
  }
  if (trimmedSearch) {
    visiblePaths = filterPaths(visiblePaths, trimmedSearch);
  }

  // Sort comparator for FILE siblings (folders always sort first, by name).
  // Files are ALWAYS grouped by extension/type first (ascending), so all `.png`
  // sit together, then all `.ogg`, etc.; WITHIN a type group the chosen sort
  // field (name / modified / size) + direction takes over.
  const sortDir = sortOrder === "asc" ? 1 : -1;
  const compareFiles = (a: FileTreeNode, b: FileTreeNode): number => {
    const ea = extOf(a.path);
    const eb = extOf(b.path);
    if (ea !== eb) {
      return ea < eb ? -1 : 1;
    }
    const fa = filesByPath.get(a.path);
    const fb = filesByPath.get(b.path);
    let cmp = 0;
    if (sortKey === "size") {
      cmp = (fa?.size ?? 0) - (fb?.size ?? 0);
    } else if (sortKey === "modified") {
      cmp = (fa?.modified ?? 0) - (fb?.modified ?? 0);
    } else {
      const na = a.name.toLowerCase();
      const nb = b.name.toLowerCase();
      cmp = na < nb ? -1 : na > nb ? 1 : 0;
    }
    return cmp * sortDir;
  };

  const tree = buildFileTree(visiblePaths, { compareFiles });
  // TREE mode (desktop): flatten the expanded tree (every folder expands while
  // searching so buried matches show). DIVE mode (mobile): only the current
  // folder's direct children at depth 0. `scope` recovers to the nearest
  // surviving ancestor if the scoped folder was deleted/renamed underneath us.
  const scope = diveMode ? resolveScopePath(tree, scopePath) : "";
  const rows = diveMode
    ? childrenRows(tree, scope)
    : flattenVisibleRows(tree, expanded, !!trimmedSearch || !!typeFilter);

  // Recover the scope state when the scoped folder vanishes, and report the
  // active scope (`""` in tree mode) to the parent so its create FAB targets the
  // folder the user is viewing. Reset to root when the project / globs change.
  useEffect(() => {
    if (diveMode && scope !== scopePath) {
      setScopePath(scope);
    }
  }, [diveMode, scope, scopePath]);
  useEffect(() => {
    onScopeChange?.(diveMode ? scope : "");
  }, [onScopeChange, diveMode, scope]);
  useEffect(() => {
    setScopePath("");
    setSearch("");
    setTypeFilter("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, include, exclude]);

  // Pick a sort field — toggle asc↔desc when it's already the active field,
  // otherwise switch to it (keeping the current direction, like Drive).
  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
      }
    },
    [sortKey],
  );

  // Relative paths of every editor currently open across the workspace panes.
  // A row whose path is in this set gets the selection accent (the file the
  // user is viewing). `activeEditor.filename` holds the project-relative path
  // `openFileEditor` was called with — the same identity a row keys off.
  const openFilenames = useComputed(() => {
    const open = new Set<string>();
    const panes = workspace.state.value.panes ?? {};
    for (const pane of Object.values(panes)) {
      for (const panel of Object.values(pane?.panels ?? {})) {
        const editor = panel?.activeEditor;
        if (editor?.open && editor.filename) {
          open.add(editor.filename);
        }
      }
    }
    return open;
  }).value;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 6,
  });

  const isEmpty = uris !== null && rows.length === 0;

  const newFolder = async () => {
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    // Dive mode (mobile) creates the folder INSIDE the folder you're viewing;
    // tree mode (desktop) creates it at the project root, as before. Uniqueness
    // is checked against that same level's existing folders.
    const parent = diveMode ? scope : "";
    const siblingDirNames = diveMode
      ? childrenRows(tree, scope)
          .filter((r) => r.isDirectory)
          .map((r) => r.name)
      : tree.filter((n) => n.isDirectory).map((n) => n.name);
    const existing = new Set(siblingDirNames.map((n) => n.toLowerCase()));
    let folderName = "New Folder";
    let i = 2;
    while (existing.has(folderName.toLowerCase())) {
      folderName = `New Folder ${i}`;
      i += 1;
    }
    const folderPath = parent ? `${parent}/${folderName}` : folderName;
    await Workspace.fs.createFolder(projectId, folderPath);
    // Tree mode: auto-expand the new (root-level) folder. Dive mode: it already
    // shows in the current scope after reload.
    if (!diveMode) {
      setExpanded((prev) => new Set(prev).add(folderName));
    }
    await Workspace.window.recordAssetChange();
    await reload();
  };

  const handleDropInto = async (folderPath: string, src: string) => {
    if (!src || !projectId) return;
    // Don't drop a folder onto itself or its own descendant.
    if (src === folderPath || folderPath.startsWith(`${src}/`)) return;
    const srcBasename = src.split("/").pop() ?? src;
    const destPath = folderPath ? `${folderPath}/${srcBasename}` : srcBasename;
    if (destPath === src) return;
    const srcRow = rows.find((r) => r.path === src);
    const { Workspace } = await import("../../workspace/Workspace");
    const result = srcRow?.isDirectory
      ? await Workspace.fs.moveFolder(projectId, src, destPath)
      : await Workspace.fs.moveFile(projectId, src, destPath);
    if (result.some((d) => d.type === "script")) {
      await Workspace.window.recordScriptChange();
    } else {
      await Workspace.window.recordAssetChange();
    }
  };

  // Dropping on the list BACKGROUND (or a file row) moves the dragged item to
  // the project ROOT — the way to pull a file/folder back OUT of a folder.
  // Disabled in dive mode: there the background isn't "root" (you're inside a
  // folder), so a background drop would silently teleport the item out of view.
  // Cross-level moves on mobile are a follow-up (drop onto a breadcrumb crumb).
  const handleDropToRoot = async (src: string) => {
    if (diveMode) return;
    if (!src || !projectId || !src.includes("/")) return; // already at root
    const destPath = src.split("/").pop() ?? src;
    const srcRow = rows.find((r) => r.path === src);
    const { Workspace } = await import("../../workspace/Workspace");
    const result = srcRow?.isDirectory
      ? await Workspace.fs.moveFolder(projectId, src, destPath)
      : await Workspace.fs.moveFile(projectId, src, destPath);
    if (result.some((d) => d.type === "script")) {
      await Workspace.window.recordScriptChange();
    } else {
      await Workspace.window.recordAssetChange();
    }
  };

  const drag = useTreeDrag({
    scrollRef,
    onDropInto: (folderPath, src) => void handleDropInto(folderPath, src),
    onDropToRoot: (src) => void handleDropToRoot(src),
  });

  return (
    <div class="relative flex h-full w-full flex-col">
      {/* Toolbar — search / Type filter / sort (the FileListHeader), with the
          overflow "more" menu (New Folder) docked right. In dive mode (mobile)
          the breadcrumb sits on its own row above. The bottom FAB stays the
          single primary create action per pane. */}
      <div class="flex flex-none flex-col gap-1.5 px-4 pt-2">
        {diveMode && (
          <FileBreadcrumb scope={scope} onNavigate={setScopePath} class="min-w-0" />
        )}
        <div class="flex flex-row items-center gap-1">
          <FileListHeader
            search={search}
            onSearch={setSearch}
            sortKey={sortKey}
            sortOrder={sortOrder}
            onSort={handleSort}
            typeFilter={typeFilter}
            onTypeFilter={setTypeFilter}
          />
          <DropdownRoot>
            <DropdownTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="More options"
                class="rounded-full text-foreground/60 hover:text-foreground"
              >
                <DotsVertical class="size-5" />
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end" sideOffset={4}>
              <DropdownItem onSelect={() => void newFolder()}>
                <FolderPlus class="size-4" />
                New Folder
              </DropdownItem>
            </DropdownContent>
          </DropdownRoot>
        </div>
      </div>
      <div
        ref={scrollRef}
        class={`relative flex-1 overflow-auto [scrollbar-gutter:stable] pt-2 pb-24 ${
          drag.draggingPath ? "select-none [touch-action:none]" : ""
        }`}
      >
        {isEmpty ? (
          <div class="flex h-full flex-col">{emptyState}</div>
        ) : (
          <div
            class="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow, slot) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              const file = filesByPath.get(row.path);
              return (
                // Key by the window SLOT (position in the visible set), not the
                // row path. As the user scrolls, each slot's DOM is REUSED and
                // only its content/transform is patched — instead of mounting
                // brand-new DOM per row, which forces style recalc + layer
                // creation + icon-HTML parsing (the dominant scroll cost in the
                // perf trace). This is DOM recycling for the virtualized list.
                <div
                  key={slot}
                  data-tree-row
                  data-path={row.path}
                  data-dir={row.isDirectory ? "1" : "0"}
                  class={`absolute left-0 top-0 w-full ${
                    drag.dropTarget === row.path
                      ? "rounded bg-foreground/10 ring-1 ring-inset ring-foreground/40"
                      : ""
                  } ${drag.draggingPath === row.path ? "opacity-50" : ""}`}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onPointerDown={(e) =>
                    drag.onRowPointerDown(e, {
                      path: row.path,
                      isDirectory: row.isDirectory,
                      label: row.path.split("/").pop() ?? row.path,
                    })
                  }
                >
                  <FileItem
                    path={row.path}
                    isDirectory={row.isDirectory}
                    depth={row.depth}
                    hasChildren={row.hasChildren}
                    expanded={row.expanded}
                    diveMode={diveMode}
                    selected={openFilenames.has(row.path)}
                    src={file?.src}
                    modified={file?.modified}
                    size={file?.size}
                    onToggle={onItemActivate}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Floating action button — overlays the bottom of the scroller so
          long lists scroll BEHIND it instead of getting clipped. */}
      {action && (
        <div class="pointer-events-none absolute inset-x-0 bottom-0 [&>*]:pointer-events-auto">
          {action}
        </div>
      )}
      {/* Drag proxy — our own floating label that follows the pointer (replaces
          the browser's native drag ghost). Offset down-right of the pointer so
          a finger/cursor doesn't cover it. */}
      {drag.proxy && (
        <div
          class="pointer-events-none fixed z-50 max-w-[16rem] truncate rounded-md bg-popup px-3 py-1.5 text-sm text-foreground shadow-lg ring-1 ring-foreground/15"
          style={{ left: `${drag.proxy.x + 14}px`, top: `${drag.proxy.y + 12}px` }}
        >
          {drag.proxy.label}
        </div>
      )}
    </div>
  );
}
