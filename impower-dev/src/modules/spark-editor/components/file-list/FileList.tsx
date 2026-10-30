// workaround(vite): Vite SSR fails with "exports is not defined" on CJS-only vscode-languageserver-protocol, so the import is deferred
import {
  Button,
  Check,
  Checkbox,
  ChevronRight,
  DotsVertical,
  Download,
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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import {
  extOf,
  fileCategory,
  iconForCategory,
  isImagePath,
} from "../../utils/fileIcon";
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
import getValidFileName from "../../utils/getValidFileName";
import globToRegex from "../../utils/globToRegex";
import { importDroppedFiles } from "../../utils/importDroppedFiles";
import { inspectAsset, inspectedAsset } from "../../utils/assetInspector";
import { recordMove, recordTrashDeletion } from "../../utils/fileUndo";
import { onFolderPathChanged } from "../../utils/folderPathChanges";
import { newEntryDraftRequest } from "../../utils/newEntryDraft";
import workspace from "../../workspace/WorkspaceStore";
// workaround(vite): Vite SSR fails on CJS-only vscode-languageserver-protocol runtime exports, so only a type import is used here
import type { FileData } from "@impower/spark-editor-protocol/src/types/workspace/FileData";
import FilePreviewOverlay, {
  type PreviewItem,
  type PreviewKind,
} from "../file-preview/FilePreviewOverlay";
import FileBreadcrumb from "./FileBreadcrumb";
import FileListBorder from "./FileListBorder";
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
import {
  useExternalFileDrop,
  type ExternalDropFile,
} from "./useExternalFileDrop";
import { useTreeDrag } from "./useTreeDrag";

const THUMB_WIDTH = 144;

const warmedThumbs = new Set<string>();

const schedule = (cb: () => void): void => {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => cb(), { timeout: 4000 });
  } else {
    setTimeout(cb, 400);
  }
};

function prewarmThumbnails(urls: string[], signal: AbortSignal): void {
  const pending = urls.filter((u) => !warmedThumbs.has(u));
  if (pending.length === 0) {
    return;
  }
  let i = 0;
  const CONCURRENCY = 1;
  const pump = () => {
    if (signal.aborted || i >= pending.length) {
      return;
    }
    const batch: Promise<unknown>[] = [];
    while (i < pending.length && batch.length < CONCURRENCY) {
      const url = pending[i++]!;
      warmedThumbs.add(url);
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
  include?: string;
  exclude?: string;
  excludeDirs?: string[];
  rootDir?: string;
  enablePreview?: boolean;
  emptyState?: ComponentChildren;
  action?: ComponentChildren;
  onScrolledChange?: (scrolled: boolean) => void;
  onScopeChange?: (scopePath: string) => void;
};

const ITEM_HEIGHT = 64;

const DRAFT_SENTINEL = "new";

const draftPseudoPath = (dir: string, ext: string) =>
  dir ? `${dir}/${DRAFT_SENTINEL}.${ext}` : `${DRAFT_SENTINEL}.${ext}`;

export default function FileList({
  include = "*",
  exclude,
  excludeDirs,
  rootDir = "",
  enablePreview,
  emptyState,
  action,
  onScrolledChange,
  onScopeChange,
}: FileListProps) {
  const [uris, setUris] = useState<string[] | null>(null);
  const [filesByUri, setFilesByUri] = useState<Record<string, FileData>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [scopePath, setScopePath] = useState(rootDir);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [revealPath, setRevealPath] = useState<string | null>(null);
  const [editingNewPath, setEditingNewPath] = useState<string | null>(null);
  const [draftNew, setDraftNew] = useState<{
    dir: string;
    ext: string;
    name?: string;
  } | null>(null);
  const [pinnedPath, setPinnedPath] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const treeRef = useRef<FileTreeNode[]>([]);
  const selectionAnchorRef = useRef<string | null>(null);
  const rowsRef = useRef<{ path: string; isDirectory: boolean }[]>([]);
  const previewItemsRef = useRef<PreviewItem[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onScrolledChange) return;
    const update = () => onScrolledChange(el.scrollTop > 0);
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [onScrolledChange]);

  // workaround(chromium): a continuously compositing same-tab iframe wedges wheel scroll latching, so the next gesture scrolls nothing for about 1 s
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.deltaY === 0) return;
      let dy = e.deltaY;
      if (e.deltaMode === 1)
        dy *= 16;
      else if (e.deltaMode === 2) dy *= el.clientHeight;
      const max = el.scrollHeight - el.clientHeight;
      const next = Math.max(0, Math.min(max, el.scrollTop + dy));
      if (next !== el.scrollTop) {
        el.scrollTop = next;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const projectId = workspace.signals.projectId.value;

  const diveMode = workspace.state.value.screen?.horizontalLayout === false;

  const matchesGlobs = (uri: string) => {
    const rel = relativePathFromUri(uri, projectId);
    if (rootDir && !rel.startsWith(`${rootDir}/`)) {
      return false;
    }
    if (excludeDirs?.some((d) => rel === d || rel.startsWith(`${d}/`))) {
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
    }
  };

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
          const firstUri = changes[0]?.uri || "";
          if (isCreate && !isSentinelUri(firstUri)) {
            setRevealPath(relativePathFromUri(firstUri, projectId));
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

  const diveModeRef = useRef(diveMode);
  diveModeRef.current = diveMode;
  const onItemActivate = useCallback((folderPath: string) => {
    if (diveModeRef.current) {
      setScopePath(folderPath);
      return;
    }
    inspectAsset(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  }, []);

  const remapExpanded = useCallback((oldPath: string, newPath: string) => {
    if (oldPath === newPath) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const p of prev) {
        if (p === oldPath) {
          next.add(newPath);
          changed = true;
        } else if (p.startsWith(`${oldPath}/`)) {
          next.add(`${newPath}${p.slice(oldPath.length)}`);
          changed = true;
        } else {
          next.add(p);
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => onFolderPathChanged(remapExpanded), [remapExpanded]);

  useEffect(() => {
    if (!enablePreview) return;
    return () => inspectAsset(null);
  }, [enablePreview]);

  useEffect(() => {
    if (!enablePreview) return;
    const cur = inspectedAsset.value;
    if (!cur) return;
    const fresh = previewItemsRef.current.find((i) => i.path === cur.path);
    if (!fresh) {
      inspectAsset(null);
      return;
    }
    if (
      fresh.src !== cur.src ||
      fresh.size !== cur.size ||
      fresh.modified !== cur.modified ||
      fresh.name !== cur.name ||
      fresh.url !== cur.url
    ) {
      inspectAsset({
        path: fresh.path,
        name: fresh.name,
        src: fresh.src,
        kind: fresh.kind,
        url: fresh.url,
        size: fresh.size,
        modified: fresh.modified,
      });
    }
  }, [enablePreview, uris, filesByUri]);

  const draftReq = newEntryDraftRequest.value;
  useEffect(() => {
    if (!draftReq) return;
    const mine =
      !!rootDir &&
      (draftReq.dir === rootDir || draftReq.dir.startsWith(`${rootDir}/`));
    if (!mine) return;
    newEntryDraftRequest.value = null;
    setDraftNew({ dir: draftReq.dir, ext: draftReq.ext });
    const pseudo = draftPseudoPath(draftReq.dir, draftReq.ext);
    setEditingNewPath(pseudo);
    setRevealPath(pseudo);
  }, [draftReq, rootDir]);

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

  const trimmedSearch = search.trim();
  let visiblePaths = allRelativePaths;
  if (typeFilter) {
    visiblePaths = visiblePaths.filter((p) => fileCategory(p) === typeFilter);
  }
  if (trimmedSearch) {
    visiblePaths = filterPaths(visiblePaths, trimmedSearch);
  }
  const draftPath = draftNew
    ? draftNew.name != null
      ? draftNew.dir
        ? `${draftNew.dir}/${draftNew.name}.${draftNew.ext}`
        : `${draftNew.name}.${draftNew.ext}`
      : draftPseudoPath(draftNew.dir, draftNew.ext)
    : null;
  if (draftPath && !visiblePaths.includes(draftPath)) {
    visiblePaths = [...visiblePaths, draftPath];
  }

  const sortDir = sortOrder === "asc" ? 1 : -1;
  const compareFiles = (a: FileTreeNode, b: FileTreeNode): number => {
    const pinnedTop = (p: string) => p === editingNewPath || p === pinnedPath;
    const aPinned = pinnedTop(a.path);
    const bPinned = pinnedTop(b.path);
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }
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
  const displayRoots = rootDir ? subtreeChildren(tree, rootDir) : tree;
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
    : flattenVisibleRows(
        displayRoots,
        expanded,
        !!trimmedSearch || !!typeFilter,
      );
  rowsRef.current = rows;

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
            size: isUrl ? undefined : file?.size,
            modified: file?.modified,
          },
        ];
      })
    : [];
  previewItemsRef.current = previewItems;

  useEffect(() => {
    if (diveMode && scope !== scopePath) {
      setScopePath(scope);
    }
  }, [diveMode, scope, scopePath]);
  useEffect(() => {
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

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedPaths(new Set());
  }, []);
  const toggleSelected = useCallback((rowPath: string, isDir: boolean) => {
    selectionAnchorRef.current = rowPath;
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
  const rangeSelect = useCallback((rowPath: string, isDir: boolean) => {
    const order = rowsRef.current;
    const ci = order.findIndex((r) => r.path === rowPath);
    const anchor = selectionAnchorRef.current;
    const ai = anchor ? order.findIndex((r) => r.path === anchor) : -1;
    if (ci < 0 || ai < 0) {
      selectionAnchorRef.current = rowPath;
      setSelectedPaths(() => {
        const next = new Set<string>([rowPath]);
        if (isDir) {
          for (const p of descendantPaths(treeRef.current, rowPath)) next.add(p);
        }
        return next;
      });
      return;
    }
    const [lo, hi] = ai <= ci ? [ai, ci] : [ci, ai];
    setSelectedPaths(() => {
      const next = new Set<string>();
      for (const r of order.slice(lo, hi + 1)) {
        next.add(r.path);
        if (r.isDirectory) {
          for (const p of descendantPaths(treeRef.current, r.path)) next.add(p);
        }
      }
      return next;
    });
  }, []);
  const replaceSelect = useCallback((rowPath: string) => {
    selectionAnchorRef.current = rowPath;
    setSelectedPaths((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);
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

  useEffect(() => {
    if (!revealPath) return;
    const idx = rows.findIndex((r) => r.path === revealPath);
    if (idx < 0) return;
    const el = scrollRef.current;
    if (el) {
      const centered = idx * ITEM_HEIGHT - (el.clientHeight - ITEM_HEIGHT) / 2;
      el.scrollTop = Math.max(0, centered);
    }
    setRevealPath(null);
  }, [revealPath, rows]);

  const isEmpty = uris !== null && rows.length === 0;
  const TypeFilterIcon = iconForCategory(typeFilter);
  const emptyContent =
    isEmpty && typeFilter ? (
      <FileListBorder>
        <TypeFilterIcon class="size-12 m-2" />
        <span class="text-sm">
          No {typeFilter[0]!.toUpperCase() + typeFilter.slice(1)} Files
        </span>
      </FileListBorder>
    ) : (
      emptyState
    );

  const hasSelection = selectMode || selectedPaths.size > 0;
  const allNodePaths = useMemo(
    () =>
      hasSelection
        ? flattenVisibleRows(displayRoots, new Set<string>(), true).map(
            (r) => r.path,
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasSelection, uris, typeFilter, trimmedSearch, rootDir],
  );
  const allSelected = useMemo(
    () => allNodePaths.length > 0 && allNodePaths.every((p) => selectedPaths.has(p)),
    [allNodePaths, selectedPaths],
  );
  const toggleSelectAll = () => {
    setSelectedPaths(allSelected ? new Set() : new Set(allNodePaths));
  };
  const deleteSelected = async () => {
    if (!projectId || selectedPaths.size === 0) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const paths = [...selectedPaths];
    const roots = paths.filter(
      (p) => !paths.some((o) => o !== p && p.startsWith(`${o}/`)),
    );
    let scriptChanged = false;
    let assetChanged = false;
    const allDeletedUris: string[] = [];
    const since = Date.now();
    for (const p of roots) {
      const isDir = !filesByPath.has(p);
      if (isDir) {
        const deleted = await Workspace.fs.deleteFolder(projectId, p, "trash");
        allDeletedUris.push(...deleted.map((d) => d.uri));
        assetChanged = true;
      } else {
        const uri = Workspace.fs.getFileUri(projectId, p);
        const deleted = await Workspace.fs.deleteFiles({
          files: [{ uri }],
          mode: "trash",
        });
        allDeletedUris.push(uri);
        if (deleted.some((d) => d.type === "script")) scriptChanged = true;
        else assetChanged = true;
      }
    }
    if (scriptChanged) await Workspace.window.recordScriptChange();
    if (assetChanged) await Workspace.window.recordAssetChange();
    const label =
      roots.length === 1
        ? roots[0]!.split("/").pop() || roots[0]!
        : `${roots.length} items`;
    await recordTrashDeletion(projectId, allDeletedUris, label, since);
    exitSelectMode();
    await reload();
  };

  const downloadSelected = async () => {
    if (!projectId || selectedPaths.size === 0) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const { downloadFile } = await import("../../utils/downloadFile");
    const sel = [...selectedPaths];
    const filePaths = [...filesByPath.keys()].filter((fp) =>
      sel.some((s) => fp === s || fp.startsWith(`${s}/`)),
    );
    if (filePaths.length === 0) return;
    if (filePaths.length === 1) {
      const fp = filePaths[0]!;
      const uri = Workspace.fs.getFileUri(projectId, fp);
      const data = await Workspace.fs.readFile({ file: { uri } });
      downloadFile(fp.split("/").pop()!, "application/octet-stream", data);
    } else {
      const files = filePaths.map((fp) => ({
        uri: Workspace.fs.getFileUri(projectId, fp),
        path:
          rootDir && fp.startsWith(`${rootDir}/`)
            ? fp.slice(rootDir.length + 1)
            : fp,
      }));
      const zip = await Workspace.fs.zipFiles({ files });
      downloadFile(`${rootDir || "files"}.zip`, "application/zip", zip);
    }
    exitSelectMode();
  };

  const deleteSelectedRef = useRef(deleteSelected);
  deleteSelectedRef.current = deleteSelected;
  const downloadSelectedRef = useRef(downloadSelected);
  downloadSelectedRef.current = downloadSelected;
  const onDeleteSelected = useCallback(
    () => void deleteSelectedRef.current(),
    [],
  );
  const onDownloadSelected = useCallback(
    () => void downloadSelectedRef.current(),
    [],
  );

  const newFolder = async () => {
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
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
    if (!diveMode) {
      setExpanded((prev) => new Set(prev).add(folderPath));
    }
    await Workspace.window.recordAssetChange();
    await reload();
    setRevealPath(folderPath);
    setEditingNewPath(folderPath);
  };

  const onEndNewEntry = useCallback(() => {
    setEditingNewPath(null);
    setRevealPath(null);
    setDraftNew(null);
  }, []);

  const onDraftCommitting = useCallback((name: string, finalPath: string) => {
    setDraftNew((prev) => (prev ? { ...prev, name } : prev));
    setEditingNewPath(null);
    setRevealPath(finalPath);
    setPinnedPath(finalPath);
  }, []);

  useEffect(() => {
    if (!draftNew?.name) return;
    const fp = draftNew.dir
      ? `${draftNew.dir}/${draftNew.name}.${draftNew.ext}`
      : `${draftNew.name}.${draftNew.ext}`;
    const landed = (uris ?? []).some(
      (u) => relativePathFromUri(u, projectId) === fp,
    );
    if (landed) {
      setDraftNew(null);
    }
  }, [draftNew, uris, projectId]);

  const onOpenFile = useCallback(
    async (path: string) => {
      if (enablePreview) {
        const idx = previewItemsRef.current.findIndex((i) => i.path === path);
        if (idx >= 0) {
          const item = previewItemsRef.current[idx]!;
          if (diveModeRef.current) {
            setPreviewIndex(idx);
          } else {
            inspectAsset({
              path: item.path,
              name: item.name,
              src: item.src,
              kind: item.kind,
              url: item.url,
              size: item.size,
              modified: item.modified,
            });
          }
          return;
        }
      }
      const { Workspace } = await import("../../workspace/Workspace");
      Workspace.window.openFileEditor(path);
    },
    [enablePreview],
  );

  const onEditUrl = useCallback(
    async (item: PreviewItem, newUrl: string) => {
      if (!projectId) return;
      const { writeUrlAsset } = await import("../../utils/urlAsset");
      await writeUrlAsset(projectId, item.path, newUrl);
    },
    [projectId],
  );

  const movePaths = async (srcPaths: string[], folderPath: string) => {
    if (!projectId || srcPaths.length === 0) return;
    const roots = srcPaths.filter(
      (p) => !srcPaths.some((o) => o !== p && p.startsWith(`${o}/`)),
    );
    const { Workspace } = await import("../../workspace/Workspace");
    let scriptChanged = false;
    let assetChanged = false;
    for (const src of roots) {
      if (src === folderPath || folderPath.startsWith(`${src}/`)) continue;
      const basename = src.split("/").pop() ?? src;
      const destPath = folderPath ? `${folderPath}/${basename}` : basename;
      if (destPath === src) continue;
      const isDir = !filesByPath.has(src);
      const result = isDir
        ? await Workspace.fs.moveFolder(projectId, src, destPath)
        : await Workspace.fs.moveFile(projectId, src, destPath);
      if (result.some((d) => d.type === "script")) scriptChanged = true;
      else assetChanged = true;
      if (isDir) remapExpanded(src, destPath);
      recordMove(projectId, src, destPath, isDir);
    }
    if (scriptChanged) await Workspace.window.recordScriptChange();
    if (assetChanged) await Workspace.window.recordAssetChange();
    if (selectMode) exitSelectMode();
  };

  const handleDropInto = (folderPath: string, srcPaths: string[]) =>
    movePaths(srcPaths, folderPath);

  const handleDropToRoot = (srcPaths: string[]) => {
    if (diveMode) return;
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

  const containerRef = useRef<HTMLDivElement>(null);
  const handleExternalDrop = useCallback(
    (targetFolder: string | null, files: ExternalDropFile[]) => {
      if (!projectId) return;
      if (files.length === 1 && /\.zip$/i.test(files[0]!.name)) {
        void (async () => {
          const { Workspace } = await import("../../workspace/Workspace");
          await Workspace.window.importLocalProject(
            files[0]!.name,
            await files[0]!.getBuffer(),
          );
        })();
        return;
      }
      const dir = targetFolder ?? (diveMode ? scope : rootDir);
      void importDroppedFiles(
        projectId,
        files.map((f) => ({
          rel: dir
            ? `${dir}/${getValidFileName(f.name)}`
            : getValidFileName(f.name),
          getBuffer: f.getBuffer,
        })),
      );
    },
    [projectId, diveMode, scope, rootDir],
  );
  const external = useExternalFileDrop(
    containerRef,
    !!projectId,
    handleExternalDrop,
  );

  const stickyRows =
    diveMode || selectMode
      ? []
      : computeStickyRows(rows, rowVirtualizer.scrollOffset ?? 0, ITEM_HEIGHT);

  return (
    <div
      ref={containerRef}
      data-file-drop-target
      class={`relative flex h-full w-full flex-col rounded ${
        external.active && external.targetFolder == null
          ? "ring-2 ring-inset ring-primary/60"
          : ""
      }`}
    >

      <div class="flex flex-none flex-col gap-1.5 pl-8 pr-3 pt-2">
        {diveMode && (
          <FileBreadcrumb
            scope={
              rootDir
                ? scope.startsWith(`${rootDir}/`)
                  ? scope.slice(rootDir.length + 1)
                  : ""
                : scope
            }
            onNavigate={(rel) =>
              setScopePath(
                rootDir ? (rel ? `${rootDir}/${rel}` : rootDir) : rel,
              )
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

                {diveMode && (
                  <DropdownItem onSelect={() => setSelectMode(true)}>
                    <Checkbox class="size-4" />
                    Select
                  </DropdownItem>
                )}
                <DropdownItem
                  onSelect={() => {
                    workspace.trashOpen.value = true;
                  }}
                >
                  <Trash class="size-4" />
                  Recycle bin
                </DropdownItem>
              </DropdownContent>
            </DropdownRoot>
          }
          selectionRow={
            hasSelection ? (
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
                  onClick={() => void downloadSelected()}
                  class="h-8 gap-1.5 rounded-md px-2 text-sm font-normal text-foreground/80 hover:text-foreground"
                >
                  <Download class="size-4" />
                  Download
                </Button>
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
            ) : undefined
          }
        />
      </div>
      <div
        ref={scrollRef}
        class={`relative flex-1 overflow-auto [scrollbar-gutter:stable] pb-24 ${
          drag.draggingPath ? "select-none [touch-action:none]" : ""
        }`}
      >

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
                  data-tree-row
                  data-dir="1"
                  data-path={s.path}
                  aria-label={`Scroll to ${s.name}`}
                  class={`pointer-events-auto absolute inset-x-0 flex cursor-pointer items-center bg-engine-900 px-5 text-left text-base font-normal text-foreground/80 before:pointer-events-none before:absolute before:inset-0 before:bg-foreground/5 before:opacity-0 before:transition-opacity before:content-[''] hover:before:opacity-100 active:before:bg-foreground/[0.12] active:before:opacity-100 ${
                    isLast ? "shadow-[0_2px_4px_rgba(0,0,0,0.3)]" : ""
                  }`}
                  style={{
                    top: `${s.offset}px`,
                    height: `${ITEM_HEIGHT}px`,
                    zIndex: stickyRows.length - k,
                  }}
                  onClick={() => {
                    if (scrollRef.current) {
                      scrollRef.current.scrollTop = s.index * ITEM_HEIGHT;
                    }
                  }}
                >
                  <div
                    class="relative flex flex-1 select-none items-center overflow-hidden"
                    style={{ paddingLeft: `${indent}px` }}
                  >
                    <span class="mr-3 flex size-10 flex-none items-center justify-center text-foreground/60">
                      <ChevronRight class="size-5 rotate-90" />
                    </span>
                    <span class="truncate font-semibold">{s.name}</span>
                  </div>

                  <Ripple />
                </button>
              );
            })}
          </div>
        )}
        {isEmpty ? (
          <div class="flex h-full flex-col">{emptyContent}</div>
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
                <div
                  key={slot}
                  data-tree-row
                  data-path={row.path}
                  data-dir={row.isDirectory ? "1" : "0"}
                  class={`absolute left-0 top-0 w-full ${
                    drag.dropTarget === row.path
                      ? "rounded bg-foreground/10 ring-1 ring-inset ring-foreground/40"
                      : external.targetFolder === row.path
                        ? "rounded bg-primary/10 ring-1 ring-inset ring-primary/60"
                        : ""
                  } ${drag.draggingPath === row.path ? "opacity-50" : ""}`}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onPointerDown={(e) => {
                    const dragSelection = selectedPaths.has(row.path);
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
                    isDraft={draftPath === row.path}
                    selectionCount={selectedPaths.size}
                    onToggle={onItemActivate}
                    onToggleSelect={toggleSelected}
                    onRangeSelect={rangeSelect}
                    onReplaceSelect={replaceSelect}
                    onDeleteSelected={onDeleteSelected}
                    onDownloadSelected={onDownloadSelected}
                    onContextSelect={contextSelect}
                    onEndNewEntry={onEndNewEntry}
                    onDraftCommitting={onDraftCommitting}
                    onFolderRenamed={remapExpanded}
                    onOpenFile={onOpenFile}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {action && (
        <div class="pointer-events-none absolute inset-x-0 bottom-0 [&>*]:pointer-events-auto">
          {action}
        </div>
      )}

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
