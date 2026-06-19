// `@impower/spark-editor-protocol` re-exports types from
// `vscode-languageserver-protocol` (CJS-only). A static import here trips
// Vite SSR with "exports is not defined" during preact-registry walk.
// `Workspace` constructs WorkspaceWindow (touches localStorage/window) at
// module load. Both must be deferred — see memory:
// feedback_defer_cjs_imports_in_ssr_loaded_modules.
import {
  Button,
  Check,
  Checkbox,
  ChevronRight,
  DotsVertical,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
  FolderPlus,
  Ripple,
  Trash,
  X,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { extOf, fileCategory, isImagePath } from "../../utils/fileIcon";
import {
  buildFileTree,
  childrenRows,
  computeStickyRows,
  descendantPaths,
  filterPaths,
  flattenVisibleRows,
  FOLDER_SENTINEL,
  resolveScopePath,
  subtreeChildren,
  type FileTreeNode,
} from "../../utils/fileTree";
import globToRegex from "../../utils/globToRegex";
import workspace from "../../workspace/WorkspaceStore";
// Type-only import (fully erased at build) — safe despite the protocol package's
// CJS runtime exports that would otherwise trip Vite SSR (see the file header).
import type { FileData } from "@impower/spark-editor-protocol/src/types/workspace/FileData";
import FileBreadcrumb from "./FileBreadcrumb";
import FileItem, {
  BASE_INDENT,
  INDENT_PER_DEPTH,
  MAX_INDENT_DEPTH,
} from "./FileItem";
import FileListHeader, {
  type SortKey,
  type SortOrder,
  type TypeFilter,
} from "./FileListHeader";
import { useTreeDrag } from "./useTreeDrag";
import FilePreviewOverlay, {
  type PreviewItem,
  type PreviewKind,
} from "../file-preview/FilePreviewOverlay";

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
  /**
   * Root the list at a project SUBTREE (e.g. `"scripts"` or `"assets"`) so each
   * pane owns a SEPARATE folder tree instead of all sharing the project root.
   * The panel shows the CONTENTS of `<rootDir>/` (not the wrapper folder), and
   * every create / move / drop-to-root / dive-scope op is confined to it. `""`
   * (default) = the whole project root (legacy flat behaviour).
   */
  rootDir?: string;
  /**
   * Clicking a FILE opens a fullscreen preview overlay (image/audio/video/text)
   * instead of routing to the editor. Set on the Assets panes; the Scripts pane
   * leaves it off so a `.sd` click still opens the script editor.
   */
  enablePreview?: boolean;
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

// Slot height for the virtualizer — the row pitch. Roomier than the legacy 52px
// so the two-line name + caption have breathing room. MUST equal the FileItem
// row button height (h-16 = 64px): the virtualizer lays rows out at this pitch
// and the sticky-header offsets are computed from it, so any mismatch makes the
// pinned headers sit a few px off (and rows overlap their slots). Keep in sync.
const ITEM_HEIGHT = 64;

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
  rootDir = "",
  enablePreview,
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
  // Dive-mode (mobile) folder scope: which folder's direct children are shown,
  // as a FULL project-relative path. Starts at `rootDir` (the pane's subtree
  // root) and never escapes it. Ignored in tree mode (desktop). See `diveMode`.
  const [scopePath, setScopePath] = useState(rootDir);
  // Header controls: search-by-name, sort field + direction, Type filter.
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  // Multi-editing ("select") mode: per-row checkboxes + bulk delete.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  // A just-created file/folder we want to SCROLL into view once (one-shot): set
  // on create, cleared by the reveal effect the moment the row materializes.
  const [revealPath, setRevealPath] = useState<string | null>(null);
  // A just-created-from-scratch entry (a folder, or a blank script) whose row
  // should open straight into rename mode (VS Code "New Folder" UX): drives
  // FileItem's `isNew` (auto-edit + Escape removes the empty new entry). NOT set
  // for imports/uploads, which arrive already named. Cleared when the session ends.
  const [editingNewPath, setEditingNewPath] = useState<string | null>(null);
  // Index into `previewItems` of the file shown in the fullscreen preview
  // overlay (`null` = closed). Only used when `enablePreview` is set.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  // Latest built tree, read by the stable select handlers to cascade a folder's
  // selection to its descendants (set after the tree is built below).
  const treeRef = useRef<FileTreeNode[]>([]);
  // Latest previewable list, read by the stable `onOpenFile` handler.
  const previewItemsRef = useRef<PreviewItem[]>([]);
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
      if (e.deltaMode === 1)
        dy *= 16; // delta in lines -> approx px
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
  // pane's globs — confined to this pane's `rootDir` subtree so a `scripts/`
  // pane never reacts to / shows an `assets/` file (and vice versa).
  const matchesGlobs = (uri: string) => {
    if (rootDir && !relativePathFromUri(uri, projectId).startsWith(`${rootDir}/`)) {
      return false;
    }
    const includeRegex = include ? globToRegex(include) : /.*/;
    const excludeRegex = exclude ? globToRegex(exclude) : undefined;
    return (
      isSentinelUri(uri) || (includeRegex.test(uri) && !excludeRegex?.test(uri))
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
      ] = await Promise.all([
        import("@impower/spark-editor-protocol/src/enums/FileChangeType"),
        import("@impower/spark-editor-protocol/src/protocols/MessageProtocol"),
        import("@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage"),
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
          // its new folder.
          const firstUri = changes[0]?.uri || "";
          const firstFilename = getFilenameFromUri(firstUri);
          // Reveal a newly-created file (upload / drop / Add / new script) so an
          // add to a long list is obviously there — the same one-shot scroll as a
          // new folder. Skip `.folder` sentinels: a folder create reveals itself
          // via newFolder() (revealing the sentinel uri here would hijack it).
          if (isCreate && !isSentinelUri(firstUri)) {
            const rel = relativePathFromUri(firstUri, projectId);
            setRevealPath(rel);
            // A single brand-new `.sd` is a from-scratch script (the "Add"
            // button) with a placeholder name → open it straight into rename like
            // a new folder (Escape removes it; commit names it AND opens it in the
            // editor — see FileItem). A bulk create is a project import → leave
            // those alone (they're already named).
            if (changes.length === 1 && firstFilename?.endsWith(".sd")) {
              setEditingNewPath(rel);
            }
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
  treeRef.current = tree;
  // Root the panel at its subtree: the tree is built from full project-relative
  // paths, then we descend past the `scripts`/`assets` wrapper so the panel shows
  // its CONTENTS (full paths kept, so FileItem's ops are unchanged). `""` rootDir
  // = the whole project (legacy flat behaviour).
  const displayRoots = rootDir ? subtreeChildren(tree, rootDir) : tree;
  // DIVE mode (mobile): the current folder's direct children at depth 0. `scope`
  // recovers to the nearest surviving ancestor if the scoped folder vanished, and
  // is CLAMPED so it never escapes `rootDir` — a recovered/empty scope falls back
  // to the subtree root so creation still targets `rootDir`, not the project root.
  // TREE mode (desktop): the flattened, subtree-rooted tree (folders expand while
  // searching so buried matches show).
  const resolvedScope = diveMode ? resolveScopePath(tree, scopePath) : "";
  const scope =
    diveMode &&
    rootDir &&
    resolvedScope !== rootDir &&
    !resolvedScope.startsWith(`${rootDir}/`)
      ? rootDir
      : resolvedScope;
  const rows = diveMode
    ? childrenRows(tree, scope)
    : flattenVisibleRows(displayRoots, expanded, !!trimmedSearch || !!typeFilter);

  // Previewable list (Assets panes only): the visible FILE rows in display order
  // mapped to preview items. `.url` assets resolve their media kind from the
  // inferred FileData.type (the path ext is `.url`); everything else from the
  // path's extension category. Kept in a ref for the stable `onOpenFile`.
  const previewItems: PreviewItem[] = enablePreview
    ? rows.flatMap((r) => {
        if (r.isDirectory) return [];
        const file = filesByPath.get(r.path);
        const isUrl = extOf(r.path) === "url";
        const cat = isUrl ? file?.type : fileCategory(r.path);
        const kind: PreviewKind =
          cat === "image" || cat === "audio" || cat === "video" ? cat : "text";
        return [
          {
            path: r.path,
            name: r.path.split("/").pop() ?? r.path,
            src: file?.src,
            kind,
            url: isUrl ? file?.text : undefined,
          },
        ];
      })
    : [];
  previewItemsRef.current = previewItems;

  // Recover the scope state when the scoped folder vanishes, and report the
  // active scope (`""` in tree mode) to the parent so its create FAB targets the
  // folder the user is viewing. Reset to root when the project / globs change.
  useEffect(() => {
    if (diveMode && scope !== scopePath) {
      setScopePath(scope);
    }
  }, [diveMode, scope, scopePath]);
  useEffect(() => {
    // Report the folder new files should be created INTO: the dive scope on
    // mobile, else the pane's subtree root (so a desktop "Upload"/"Add" lands in
    // `assets/`/`scripts/`, not the project root).
    onScopeChange?.(diveMode ? scope : rootDir);
  }, [onScopeChange, diveMode, scope, rootDir]);
  useEffect(() => {
    setScopePath(rootDir);
    setSearch("");
    setTypeFilter("");
    setSelectMode(false);
    setSelectedPaths(new Set());
    setPreviewIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, include, exclude]);

  // Multi-select handlers — stable identities so FileItem's `memo` holds.
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedPaths(new Set());
  }, []);
  // Toggle a row; a folder cascades to ALL its descendants (files + subfolders),
  // so checking a folder checks everything inside it (and unchecking clears it).
  const toggleSelected = useCallback((rowPath: string, isDir: boolean) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      const group = isDir
        ? [rowPath, ...descendantPaths(treeRef.current, rowPath)]
        : [rowPath];
      if (next.has(rowPath)) {
        for (const p of group) next.delete(p);
      } else {
        for (const p of group) next.add(p);
      }
      return next;
    });
  }, []);
  // Right-click a row: enter select mode (if needed) and select it — a folder
  // also selects its contents.
  const contextSelect = useCallback((rowPath: string, isDir: boolean) => {
    setSelectMode(true);
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      next.add(rowPath);
      if (isDir) {
        for (const p of descendantPaths(treeRef.current, rowPath)) next.add(p);
      }
      return next;
    });
  }, []);

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

  // Scroll a freshly-created folder into view (centered) the first frame its row
  // exists, then clear the request so it fires exactly once. Rows are fixed
  // ITEM_HEIGHT, so we can place scrollTop directly (mirrors the sticky-header
  // click idiom) — more reliable here than scrollToIndex through the wedge-proof
  // wheel path. Without this a new folder lands offscreen in a long list.
  useEffect(() => {
    if (!revealPath) return;
    const idx = rows.findIndex((r) => r.path === revealPath);
    if (idx < 0) return; // not in the rows yet (reload still settling) — wait
    const el = scrollRef.current;
    if (el) {
      const centered = idx * ITEM_HEIGHT - (el.clientHeight - ITEM_HEIGHT) / 2;
      el.scrollTop = Math.max(0, centered);
    }
    setRevealPath(null);
  }, [revealPath, rows]);

  const isEmpty = uris !== null && rows.length === 0;

  // Multi-select derived state. Select-all covers EVERY node (files + folders,
  // including ones inside collapsed folders), not just the visible rows. Only
  // computed in select mode so the full-tree walk never runs on a scroll frame.
  const allNodePaths = selectMode
    ? flattenVisibleRows(displayRoots, new Set<string>(), true).map((r) => r.path)
    : [];
  const allSelected =
    allNodePaths.length > 0 && allNodePaths.every((p) => selectedPaths.has(p));
  const toggleSelectAll = () => {
    setSelectedPaths(allSelected ? new Set() : new Set(allNodePaths));
  };
  const deleteSelected = async () => {
    if (!projectId || selectedPaths.size === 0) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const paths = [...selectedPaths];
    // Drop any path nested under another selected one — deleting a folder
    // already removes its contents, so deleting the child too would error.
    const roots = paths.filter(
      (p) => !paths.some((o) => o !== p && p.startsWith(`${o}/`)),
    );
    let scriptChanged = false;
    let assetChanged = false;
    for (const p of roots) {
      // Folder paths have no FileData entry (only their files / sentinel do).
      const isDir = !filesByPath.has(p);
      if (isDir) {
        await Workspace.fs.deleteFolder(projectId, p);
        assetChanged = true;
      } else {
        const uri = Workspace.fs.getFileUri(projectId, p);
        const deleted = await Workspace.fs.deleteFiles({ files: [{ uri }] });
        if (deleted.some((d) => d.type === "script")) scriptChanged = true;
        else assetChanged = true;
      }
    }
    if (scriptChanged) await Workspace.window.recordScriptChange();
    if (assetChanged) await Workspace.window.recordAssetChange();
    exitSelectMode();
    await reload();
  };

  const newFolder = async () => {
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    // Dive mode (mobile) creates the folder INSIDE the folder you're viewing;
    // tree mode (desktop) creates it at this pane's subtree root (`rootDir`).
    // Uniqueness is checked against that same level's existing folders.
    const parent = diveMode ? scope : rootDir;
    const siblingDirNames = diveMode
      ? childrenRows(tree, scope)
          .filter((r) => r.isDirectory)
          .map((r) => r.name)
      : displayRoots.filter((n) => n.isDirectory).map((n) => n.name);
    const existing = new Set(siblingDirNames.map((n) => n.toLowerCase()));
    let folderName = "New Folder";
    let i = 2;
    while (existing.has(folderName.toLowerCase())) {
      folderName = `New Folder ${i}`;
      i += 1;
    }
    const folderPath = parent ? `${parent}/${folderName}` : folderName;
    await Workspace.fs.createFolder(projectId, folderPath);
    // Tree mode: auto-expand the new folder (keyed by its FULL path, like every
    // expanded entry). Dive mode: it already shows in the current scope.
    if (!diveMode) {
      setExpanded((prev) => new Set(prev).add(folderPath));
    }
    await Workspace.window.recordAssetChange();
    await reload();
    // VS Code "New Folder": scroll the new row into view and open it straight
    // into rename mode (the name preselected) so it's obvious it was created and
    // ready to name. Escape then removes the empty folder (see onEndNewEntry).
    setRevealPath(folderPath);
    setEditingNewPath(folderPath);
  };

  // End the new-entry rename session (FileItem committed a name, kept the
  // default, or Escaped — Escape also deletes the empty new entry inside
  // FileItem). Stable so FileItem's `memo` holds.
  const onEndNewEntry = useCallback(() => {
    setEditingNewPath(null);
    setRevealPath(null);
  }, []);

  // File click: in preview-enabled panes (Assets) a previewable file opens the
  // fullscreen overlay at its position; otherwise it routes to the editor.
  // Stable for FileItem's `memo` — reads the latest list via previewItemsRef.
  const onOpenFile = useCallback(
    async (path: string) => {
      if (enablePreview) {
        const idx = previewItemsRef.current.findIndex((i) => i.path === path);
        if (idx >= 0) {
          setPreviewIndex(idx);
          return;
        }
      }
      const { Workspace } = await import("../../workspace/Workspace");
      Workspace.window.openFileEditor(path);
    },
    [enablePreview],
  );

  // Edit a remote (`.url`) asset's target from the preview: write the new URL
  // back as the file's content. The worker re-derives the asset's `src`/`type`
  // on the resulting change, so the preview (and the row) re-resolve. Stable for
  // the overlay; `projectId` is the only dependency.
  const onEditUrl = useCallback(
    async (item: PreviewItem, newUrl: string) => {
      if (!projectId) return;
      const { Workspace } = await import("../../workspace/Workspace");
      const uri = Workspace.fs.getFileUri(projectId, item.path);
      await Workspace.fs.writeTextDocument({
        textDocument: { uri, version: 0, text: newUrl },
      });
      await Workspace.window.recordAssetChange();
    },
    [projectId],
  );

  // Move a set of paths into `folderPath` (`""` = project root). A dragged
  // selection can include a folder AND its contents (folder-cascade), so move
  // only the TOP-LEVEL paths — moving the folder carries its descendants.
  const movePaths = async (srcPaths: string[], folderPath: string) => {
    if (!projectId || srcPaths.length === 0) return;
    const roots = srcPaths.filter(
      (p) => !srcPaths.some((o) => o !== p && p.startsWith(`${o}/`)),
    );
    const { Workspace } = await import("../../workspace/Workspace");
    let scriptChanged = false;
    let assetChanged = false;
    for (const src of roots) {
      // Can't move a folder into itself or one of its own descendants.
      if (src === folderPath || folderPath.startsWith(`${src}/`)) continue;
      const basename = src.split("/").pop() ?? src;
      const destPath = folderPath ? `${folderPath}/${basename}` : basename;
      if (destPath === src) continue; // already there
      // Folder paths have no FileData entry (only their files / sentinel do).
      const result = !filesByPath.has(src)
        ? await Workspace.fs.moveFolder(projectId, src, destPath)
        : await Workspace.fs.moveFile(projectId, src, destPath);
      if (result.some((d) => d.type === "script")) scriptChanged = true;
      else assetChanged = true;
    }
    if (scriptChanged) await Workspace.window.recordScriptChange();
    if (assetChanged) await Workspace.window.recordAssetChange();
    // The moved paths are stale after a multi-move — leave select mode.
    if (selectMode) exitSelectMode();
  };

  const handleDropInto = (folderPath: string, srcPaths: string[]) =>
    movePaths(srcPaths, folderPath);

  // Dropping on the list BACKGROUND (or a file row) moves the dragged items to
  // this pane's ROOT (`rootDir`, e.g. `assets/`) — the way to pull files/folders
  // back OUT of a folder. Disabled in dive mode: there the background isn't
  // "root" (you're inside a folder), so a background drop would silently teleport
  // items out of view.
  const handleDropToRoot = (srcPaths: string[]) => {
    if (diveMode) return;
    // Skip items already sitting directly under the pane root (their parent dir
    // IS rootDir) — moving them there would be a no-op.
    const parentOf = (p: string) =>
      p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    void movePaths(
      srcPaths.filter((p) => parentOf(p) !== rootDir),
      rootDir,
    );
  };

  const drag = useTreeDrag({
    scrollRef,
    onDropInto: (folderPath, srcPaths) =>
      void handleDropInto(folderPath, srcPaths),
    onDropToRoot: (srcPaths) => void handleDropToRoot(srcPaths),
  });

  // VS Code "sticky scroll": the expanded ancestor folders of the row at the top
  // of the scroller, pinned as headers. Tree mode (desktop) only — never in dive
  // mode (mobile uses the breadcrumb) or while multi-selecting.
  const stickyRows =
    diveMode || selectMode
      ? []
      : computeStickyRows(rows, rowVirtualizer.scrollOffset ?? 0, ITEM_HEIGHT);

  return (
    <div class="relative flex h-full w-full flex-col">
      {/* Toolbar — search / Type filter / sort (the FileListHeader), with the
          overflow "more" menu (New Folder) docked right. In dive mode (mobile)
          the breadcrumb sits on its own row above. The bottom FAB stays the
          single primary create action per pane. */}
      <div class="flex flex-none flex-col gap-1.5 px-8 pt-2">
        {selectMode ? (
          // Multi-editing bar: select-all + count, then Delete + exit.
          <div class="flex h-8 flex-row items-center gap-2">
            <Button
              variant="ghost"
              aria-label={allSelected ? "Deselect all" : "Select all"}
              onClick={toggleSelectAll}
              class="size-8 flex-none rounded-full p-0 text-foreground/70 hover:text-foreground"
            >
              <span
                class={`flex size-5 items-center justify-center rounded border-2 ${
                  allSelected
                    ? "border-primary bg-primary text-white"
                    : "border-foreground/40"
                }`}
              >
                {allSelected && <Check class="size-3.5" />}
              </span>
            </Button>
            <span class="text-sm tabular-nums text-foreground/70">
              ({selectedPaths.size})
            </span>
            <div class="flex-1" />
            <Button
              variant="ghost"
              disabled={selectedPaths.size === 0}
              onClick={() => void deleteSelected()}
              class="h-8 gap-1.5 rounded-md px-2 text-sm font-normal text-foreground/80 hover:text-foreground"
            >
              <Trash class="size-4" />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Exit selection"
              onClick={exitSelectMode}
              class="rounded-full text-foreground/60 hover:text-foreground"
            >
              <X class="size-5" />
            </Button>
          </div>
        ) : (
          <>
            {diveMode && (
              // The breadcrumb works in subtree-RELATIVE paths so the pane root
              // (`assets`/`scripts`) isn't shown as a crumb — its own home glyph
              // navigates back to `rootDir`. Translate to/from full paths here.
              <FileBreadcrumb
                scope={
                  rootDir
                    ? scope.startsWith(`${rootDir}/`)
                      ? scope.slice(rootDir.length + 1)
                      : ""
                    : scope
                }
                onNavigate={(rel) =>
                  setScopePath(rootDir ? (rel ? `${rootDir}/${rel}` : rootDir) : rel)
                }
                class="min-w-0"
              />
            )}
            <FileListHeader
              search={search}
              onSearch={setSearch}
              sortKey={sortKey}
              sortOrder={sortOrder}
              onSort={handleSort}
              typeFilter={typeFilter}
              onTypeFilter={setTypeFilter}
              trailing={
                <DropdownRoot>
                  <DropdownTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="More options"
                      // mr-2 mirrors the per-row 3-dots (FileOptionsButton), so
                      // the header's 3-dots lines up with the file items' 3-dots.
                      class="mr-2 rounded-full text-foreground/60 hover:text-foreground"
                    >
                      <DotsVertical class="size-5" />
                    </Button>
                  </DropdownTrigger>
                  <DropdownContent align="end" sideOffset={4}>
                    <DropdownItem onSelect={() => void newFolder()}>
                      <FolderPlus class="size-4" />
                      New Folder
                    </DropdownItem>
                    <DropdownItem onSelect={() => setSelectMode(true)}>
                      <Checkbox class="size-4" />
                      Select
                    </DropdownItem>
                  </DropdownContent>
                </DropdownRoot>
              }
            />
          </>
        )}
      </div>
      <div
        ref={scrollRef}
        class={`relative flex-1 overflow-auto [scrollbar-gutter:stable] pb-24 ${
          drag.draggingPath ? "select-none [touch-action:none]" : ""
        }`}
      >
        {/* VS Code-style sticky folder headers, pinned at the top of the scroller
            and stacked by depth (the deepest eases out as its contents end). */}
        {stickyRows.length > 0 && (
          <div class="pointer-events-none sticky top-0 z-20 h-0">
            {stickyRows.map((s, k) => {
              const indent =
                BASE_INDENT +
                Math.min(s.depth, MAX_INDENT_DEPTH) * INDENT_PER_DEPTH;
              const isLast = k === stickyRows.length - 1;
              return (
                <button
                  key={s.path}
                  type="button"
                  aria-label={`Scroll to ${s.name}`}
                  // A sticky header OCCLUDES the rows scrolling behind it, so the
                  // opaque base (bg-engine-900) must stay put — swapping it for a
                  // translucent hover would let those rows peek through. Instead
                  // fade a `before:` overlay carrying the EXACT ghost-button tints
                  // (hover foreground/5, active foreground/12) over the solid base,
                  // so the hover reads identically to the file rows.
                  class={`pointer-events-auto absolute inset-x-0 flex cursor-pointer items-center bg-engine-900 px-5 text-left text-base font-normal text-foreground/80 before:pointer-events-none before:absolute before:inset-0 before:bg-foreground/5 before:opacity-0 before:transition-opacity before:content-[''] hover:before:opacity-100 active:before:bg-foreground/[0.12] active:before:opacity-100 ${
                    isLast ? "shadow-[0_2px_4px_rgba(0,0,0,0.3)]" : ""
                  }`}
                  style={{
                    top: `${s.offset}px`,
                    height: `${ITEM_HEIGHT}px`,
                    // Shallower headers paint on top, so the deepest slides up
                    // BEHIND them (and clips above) as its folder's contents end.
                    zIndex: stickyRows.length - k,
                  }}
                  onClick={() => {
                    if (scrollRef.current) {
                      scrollRef.current.scrollTop = s.index * ITEM_HEIGHT;
                    }
                  }}
                >
                  <div
                    // `relative` keeps the label above the hover `before:` overlay
                    // (an absolutely-positioned pseudo would otherwise paint over
                    // this static content).
                    class="relative flex flex-1 select-none items-center overflow-hidden"
                    style={{ paddingLeft: `${indent}px` }}
                  >
                    <span class="mr-3 flex size-10 flex-none items-center justify-center text-foreground/60">
                      <ChevronRight class="size-5 rotate-90" />
                    </span>
                    <span class="truncate font-semibold">{s.name}</span>
                  </div>
                  {/* Manual ripple — this stays a raw <button> (not <Button>)
                      because its custom opaque `before:` hover is what keeps it
                      occluding; a ghost Button's translucent hover would let the
                      rows behind it peek through. */}
                  <Ripple />
                </button>
              );
            })}
          </div>
        )}
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
                  onPointerDown={(e) => {
                    // In select mode, dragging a SELECTED row drags the whole
                    // selection; a non-selected row (or normal mode) drags just
                    // itself. A plain tap still toggles selection (the drag only
                    // arms on movement / long-press).
                    const dragSelection =
                      selectMode && selectedPaths.has(row.path);
                    const paths = dragSelection
                      ? [...selectedPaths]
                      : undefined;
                    const count = paths?.length ?? 1;
                    drag.onRowPointerDown(e, {
                      path: row.path,
                      paths,
                      isDirectory: row.isDirectory,
                      label:
                        count > 1
                          ? `${count} items`
                          : (row.path.split("/").pop() ?? row.path),
                    });
                  }}
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
                    remote={extOf(row.path) === "url"}
                    category={file?.type}
                    modified={file?.modified}
                    size={file?.size}
                    selectMode={selectMode}
                    bulkSelected={selectedPaths.has(row.path)}
                    isNew={editingNewPath === row.path}
                    onToggle={onItemActivate}
                    onToggleSelect={toggleSelected}
                    onContextSelect={contextSelect}
                    onEndNewEntry={onEndNewEntry}
                    onOpenFile={onOpenFile}
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
          style={{
            left: `${drag.proxy.x + 14}px`,
            top: `${drag.proxy.y + 12}px`,
          }}
        >
          {drag.proxy.label}
        </div>
      )}
      {enablePreview && (
        <FilePreviewOverlay
          open={previewIndex != null && previewItems[previewIndex] != null}
          items={previewItems}
          index={previewIndex ?? 0}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          onEditUrl={onEditUrl}
        />
      )}
    </div>
  );
}
