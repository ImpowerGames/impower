// `@impower/spark-editor-protocol` re-exports types from
// `vscode-languageserver-protocol` (CJS-only). A static import here trips
// Vite SSR with "exports is not defined" during preact-registry walk.
// `Workspace` constructs WorkspaceWindow (touches localStorage/window) at
// module load. Both must be deferred — see memory:
// feedback_defer_cjs_imports_in_ssr_loaded_modules.
import { Button, Plus } from "@impower/impower-ui/components";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  buildFileTree,
  flattenVisibleRows,
  FOLDER_SENTINEL,
} from "../../utils/fileTree";
import globToRegex from "../../utils/globToRegex";
import workspace from "../../workspace/WorkspaceStore";
import FileItem from "./FileItem";

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
}: FileListProps) {
  const [uris, setUris] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const draggedPathRef = useRef<string | null>(null);
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

  // Make the active project id reactive so the list reloads when the user
  // switches projects.
  const projectId = workspace.signals.projectId.value;

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

  const loadUris = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    const files = await Workspace.fs.getFiles(projectId!);
    return Object.keys(files)
      .filter(matchesGlobs)
      .sort();
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
        const filtered = await loadUris();
        if (!cancelled) setUris(filtered);
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
      setUris(await loadUris());
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

  const toggle = (folderPath: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });

  // Build the tree from the filtered relative paths (sentinels materialize empty
  // folders and are hidden), then flatten the EXPANDED tree for the virtualizer.
  const relativePaths = (uris ?? []).map((uri) =>
    relativePathFromUri(uri, projectId),
  );
  const tree = buildFileTree(relativePaths);
  const rows = flattenVisibleRows(tree, expanded);

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
    const existing = new Set(
      tree.filter((n) => n.isDirectory).map((n) => n.name.toLowerCase()),
    );
    let folderName = "New Folder";
    let i = 2;
    while (existing.has(folderName.toLowerCase())) {
      folderName = `New Folder ${i}`;
      i += 1;
    }
    await Workspace.fs.createFolder(projectId, folderName);
    setExpanded((prev) => new Set(prev).add(folderName));
    await Workspace.window.recordAssetChange();
    await reload();
  };

  const handleDropInto = async (folderPath: string) => {
    const src = draggedPathRef.current;
    draggedPathRef.current = null;
    setDropTarget(null);
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

  return (
    <div class="relative flex h-full w-full flex-col">
      {/* Toolbar: New Folder (search/sort/filter will join here later). */}
      <div class="flex flex-none flex-row items-center justify-end px-4 pt-2">
        <Button
          variant="ghost"
          class="h-8 gap-1.5 rounded-md px-2 text-sm font-normal text-foreground/70"
          onClick={() => void newFolder()}
        >
          <Plus class="size-4" />
          New Folder
        </Button>
      </div>
      <div
        ref={scrollRef}
        class="relative flex-1 overflow-auto [scrollbar-gutter:stable] pt-2 pb-24"
      >
        {isEmpty ? (
          <div class="flex h-full flex-col">{emptyState}</div>
        ) : (
          <div
            class="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              return (
                <div
                  key={row.path}
                  class={`absolute left-0 top-0 w-full ${
                    dropTarget === row.path
                      ? "rounded bg-foreground/10 ring-1 ring-inset ring-foreground/40"
                      : ""
                  }`}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  draggable
                  onDragStart={(e) => {
                    draggedPathRef.current = row.path;
                    e.dataTransfer?.setData("text/plain", row.path);
                  }}
                  onDragEnd={() => {
                    draggedPathRef.current = null;
                    setDropTarget(null);
                  }}
                  onDragOver={
                    row.isDirectory
                      ? (e) => {
                          e.preventDefault();
                          if (dropTarget !== row.path) setDropTarget(row.path);
                        }
                      : undefined
                  }
                  onDragLeave={
                    row.isDirectory
                      ? () =>
                          setDropTarget((t) => (t === row.path ? null : t))
                      : undefined
                  }
                  onDrop={
                    row.isDirectory
                      ? (e) => {
                          e.preventDefault();
                          void handleDropInto(row.path);
                        }
                      : undefined
                  }
                >
                  <FileItem
                    path={row.path}
                    isDirectory={row.isDirectory}
                    depth={row.depth}
                    hasChildren={row.hasChildren}
                    expanded={row.expanded}
                    onToggle={() => toggle(row.path)}
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
    </div>
  );
}
