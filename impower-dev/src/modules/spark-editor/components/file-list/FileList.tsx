// `@impower/spark-editor-protocol` re-exports types from
// `vscode-languageserver-protocol` (CJS-only). A static import here trips
// Vite SSR with "exports is not defined" during preact-registry walk.
// `Workspace` constructs WorkspaceWindow (touches localStorage/window) at
// module load. Both must be deferred — see memory:
// feedback_defer_cjs_imports_in_ssr_loaded_modules.
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
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
 * Virtualized list of files for the Assets and Logic > Scripts panes.
 * Subscribes to LSP `DidChangeWatchedFiles` notifications so the list
 * stays in sync with disk. Newly created `.sd` scripts auto-open in
 * the editor (matches the legacy behavior).
 */
export default function FileList({
  include = "*",
  exclude,
  emptyState,
  action,
  onScrolledChange,
}: FileListProps) {
  const [uris, setUris] = useState<string[] | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Report scroll-off-top so the parent can collapse the FAB. The scroller
  // (`scrollRef`) is always mounted, so binding once is enough; report the
  // initial state immediately too.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onScrolledChange) return;
    const update = () => onScrolledChange(el.scrollTop > 0);
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [onScrolledChange]);


  // Make the active project id reactive so the list reloads when the user
  // switches projects. Read `.value` directly on the signal — this
  // subscribes the component to changes via @preact/signals' tracking.
  const projectId = workspace.signals.projectId.value;

  // Initial load + reload on project / glob change. Inline async + cancel
  // flag so an in-flight load whose response arrives after a re-render (or
  // unmount) doesn't overwrite freshly-loaded state.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!projectId) {
        if (!cancelled) setUris([]);
        return;
      }
      try {
        const { Workspace } = await import("../../workspace/Workspace");
        const files = await Workspace.fs.getFiles(projectId);
        if (cancelled) return;
        const includeRegex = include ? globToRegex(include) : /.*/;
        const excludeRegex = exclude ? globToRegex(exclude) : undefined;
        const filtered = Object.keys(files)
          .filter((uri) => includeRegex.test(uri) && !excludeRegex?.test(uri))
          .sort()
          .sort((a, b) => {
            const extA = a.split(".").at(-1) || "";
            const extB = b.split(".").at(-1) || "";
            return extA < extB ? -1 : extA > extB ? 1 : 0;
          });
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
  }, [projectId, include, exclude]);

  const reload = async () => {
    if (!projectId) return;
    try {
      const { Workspace } = await import("../../workspace/Workspace");
      const files = await Workspace.fs.getFiles(projectId);
      const includeRegex = include ? globToRegex(include) : /.*/;
      const excludeRegex = exclude ? globToRegex(exclude) : undefined;
      const filtered = Object.keys(files)
        .filter((uri) => includeRegex.test(uri) && !excludeRegex?.test(uri))
        .sort()
        .sort((a, b) => {
          const extA = a.split(".").at(-1) || "";
          const extB = b.split(".").at(-1) || "";
          return extA < extB ? -1 : extA > extB ? 1 : 0;
        });
      setUris(filtered);
    } catch {
      /* no-op */
    }
  };

  // LSP file-watcher → reload the list. Mirrors the legacy
  // `handleDidChangeWatchedFiles` rule set: only reload when the change is
  // relevant to this list's glob, never reload mid-rename (the create+change
  // pair would cause the order to shift while the user is editing the name).
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
      detach = onProtocolMessage(DidChangeWatchedFilesMessage.type, (message) => {
        const params = message.params;
        const changes = params.changes;
        const includeRegex = include ? globToRegex(include) : /.*/;
        const excludeRegex = exclude ? globToRegex(exclude) : undefined;
        const isRelevant = changes.some(
          (c) => includeRegex.test(c.uri) && !excludeRegex?.test(c.uri),
        );
        if (!isRelevant) return;
        const isCreate = changes.every(
          (c) => c.type === FileChangeType.Created,
        );
        const isDelete = changes.every(
          (c) => c.type === FileChangeType.Deleted,
        );
        const isRename = changes.every((c) =>
          c.type === FileChangeType.Created
            ? changes.some(
                (other) =>
                  other.uri === c.uri && other.type === FileChangeType.Changed,
              )
            : c.type === FileChangeType.Changed
              ? changes.some(
                  (other) =>
                    other.uri === c.uri &&
                    other.type === FileChangeType.Created,
                )
              : true,
        );
        if (!(params.remote || isCreate || isDelete || !isRename)) return;

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
      });
    })();
    return () => {
      cancelled = true;
      detach?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, include, exclude]);

  const rowUris = uris ?? [];
  const relativePaths = rowUris.map((uri) =>
    relativePathFromUri(uri, projectId),
  );

  const rowVirtualizer = useVirtualizer({
    count: rowUris.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 6,
  });

  const isEmpty = uris !== null && uris.length === 0;

  return (
    <div class="relative flex h-full w-full flex-col">
      <div
        ref={scrollRef}
        class="relative flex-1 overflow-auto [scrollbar-gutter:stable] pt-4 pb-24"
      >
        {isEmpty ? (
          <div class="flex h-full flex-col">{emptyState}</div>
        ) : (
          <div
            class="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const uri = rowUris[virtualRow.index];
              const path = relativePaths[virtualRow.index];
              if (uri == null || path == null) return null;
              return (
                <div
                  key={uri}
                  class="absolute left-0 top-0 w-full"
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <FileItem path={path} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Floating action button — overlays the bottom of the scroller so
          long lists scroll BEHIND it instead of getting clipped by it
          taking layout space. Mirrors the legacy `<s-collapsible
          position="relative">` placement. The action wrapper itself
          (FileUploadButton / FileAddButton) provides its own mx-4 my-6
          margins, so we only need to anchor it bottom-0 here. */}
      {action && (
        <div class="pointer-events-none absolute inset-x-0 bottom-0 [&>*]:pointer-events-auto">
          {action}
        </div>
      )}
    </div>
  );
}
