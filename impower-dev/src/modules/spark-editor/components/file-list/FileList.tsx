import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import globToRegex from "../../utils/globToRegex";
import workspace from "../../workspace/WorkspaceStore";
import { Workspace } from "../../workspace/Workspace";
import FileItem from "./FileItem";

export type FileListProps = {
  /** Glob of filenames to INCLUDE in this list. Defaults to `*`. */
  include?: string;
  /** Glob of filenames to EXCLUDE from this list. */
  exclude?: string;
  /** Empty-state content (icon + label) — only shown when list is empty. */
  emptyState?: ComponentChildren;
  /** "New / Upload" call-to-action button rendered below the list. */
  action?: ComponentChildren;
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
}: FileListProps) {
  const [uris, setUris] = useState<string[] | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);


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
    const onProtocol = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      if (!DidChangeWatchedFilesMessage.type.is(e.detail)) return;
      const params = e.detail.params;
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
      // A rename emits a paired Changed + Created on the same uri. If every
      // change pairs up that way, treat it as a rename and skip the reload
      // (FileItem owns the optimistic update of its own label).
      const isRename = changes.every((c) =>
        c.type === FileChangeType.Created
          ? changes.some(
              (other) =>
                other.uri === c.uri && other.type === FileChangeType.Changed,
            )
          : c.type === FileChangeType.Changed
            ? changes.some(
                (other) =>
                  other.uri === c.uri && other.type === FileChangeType.Created,
              )
            : true,
      );
      if (!(params.remote || isCreate || isDelete || !isRename)) return;

      // Special case: a single new `.sd` file means the user just created a
      // script — open it immediately.
      const firstFilename = Workspace.fs.getFilename(changes[0]?.uri || "");
      if (
        isCreate &&
        changes.length === 1 &&
        firstFilename?.endsWith(".sd")
      ) {
        Workspace.window.openedFileEditor(firstFilename);
        return;
      }
      void reload();
    };
    window.addEventListener(MessageProtocol.event, onProtocol);
    return () => window.removeEventListener(MessageProtocol.event, onProtocol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, include, exclude]);

  const filenames = (uris ?? []).map((uri) => Workspace.fs.getFilename(uri));

  const rowVirtualizer = useVirtualizer({
    count: filenames.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 6,
  });

  const isEmpty = uris !== null && uris.length === 0;

  return (
    <div class="relative flex h-full w-full flex-col">
      <div
        ref={scrollRef}
        class="relative flex-1 overflow-auto pt-4 pb-24"
      >
        {isEmpty ? (
          <div class="flex h-full flex-col">{emptyState}</div>
        ) : (
          <div
            class="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const filename = filenames[virtualRow.index];
              if (!filename) return null;
              return (
                <div
                  key={filename}
                  class="absolute left-0 top-0 w-full"
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <FileItem filename={filename} />
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
