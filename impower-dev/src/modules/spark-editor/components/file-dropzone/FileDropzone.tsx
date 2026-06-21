import { Download } from "@impower/impower-ui/components";
import { useEffect, useRef, useState } from "preact/hooks";
import { recordResolvedUpload } from "../../utils/fileUndo";
import getValidFileName from "../../utils/getValidFileName";
import { runImport } from "../../utils/importProgress";
import { resolveUploadConflicts } from "../../utils/uploadConflicts";

export const propDefaults = {};
export type FileDropzoneProps = Partial<typeof propDefaults>;

/**
 * Window-level file-drop catcher. Listens for drag/drop on window so the
 * user can drop a zip or asset files anywhere in the editor and they'll
 * be imported into the active workspace project. Shows a centered
 * "Import Project Files" overlay while a drag is in progress.
 *
 * Two event sources funnel into the same state machine:
 *   1. Native HTML5 DnD on `window`
 *   2. DraggedFilesIn / Over / Out / DroppedFiles protocol messages
 *      (used when the parent VS Code host or similar relays drags)
 */
export default function FileDropzone(_props: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  // Keep the latest setter reachable from imperative listeners without
  // re-binding them on every render.
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;

  useEffect(() => {
    let disposeProtocol: (() => void) | undefined;

    const dragEnter = () => setDragging(true);
    const dragLeave = () => setDragging(false);
    const dragOver = () => setDragging(true);

    // Buffers are read lazily (`getBuffer`) so the conflict prompt — which may
    // await the user for a while — runs BEFORE we touch the bytes, and a Skip
    // never reads a file we're going to drop. Owns the whole import pipeline:
    // zip-check, conflict resolution, the progress bar, the write, and the
    // undoable record. Both the native-DnD and protocol call sites are thin
    // adapters that just map their inputs into this `{ name, getBuffer }` shape.
    const handleDrop = async (
      items: { name: string; getBuffer: () => Promise<ArrayBuffer> }[],
    ) => {
      setDragging(false);
      const { Workspace } = await import("../../workspace/Workspace");
      const store = (await import("../../workspace/WorkspaceStore")).default
        .state.value;
      const projectId = store?.project?.id;
      if (!projectId) return;
      if (!items || items.length === 0) return;
      // A single .zip is a whole-project import — importLocalProject owns its
      // own 'importing' status, so route it straight there (not through the
      // per-file conflict/progress path).
      if (items.length === 1 && items[0]?.name.endsWith(".zip")) {
        const item = items[0]!;
        await Workspace.window.importLocalProject(
          item.name,
          await item.getBuffer(),
        );
        return;
      }
      // Route loose dropped files into the folder whose panel actually shows
      // them — a bare project-root path (the old behavior) matches no pane's
      // rootDir, so an imported asset never appeared until... never (only a
      // re-import into a folder would). Scripts go to `scripts/`, everything
      // else to `assets/`, mirroring the per-pane upload buttons.
      const targetRel = (name: string) => {
        const valid = getValidFileName(name);
        return valid.endsWith(".sd") ? `scripts/${valid}` : `assets/${valid}`;
      };
      // Resolve same-path conflicts (Replace -> trash / Keep both / Skip) BEFORE
      // the progress-tracked write — the prompt awaits the user, which would
      // otherwise freeze the determinate bar.
      const { survivors, trashedOldUris, since } = await resolveUploadConflicts(
        projectId,
        items.map((it) => ({ rel: targetRel(it.name), payload: it })),
      );
      const newUris = survivors.map((s) => s.uri);
      let wrote = false;
      try {
        if (survivors.length > 0) {
          await runImport(survivors.length, async (advance) => {
            const created = await Promise.all(
              survivors.map(async (s) => {
                const data = await s.payload.getBuffer();
                advance();
                return { uri: s.uri, data };
              }),
            );
            await Workspace.fs.createFiles({ files: created });
            await Workspace.window.recordAssetChange();
          });
          wrote = true;
        }
      } finally {
        // One undoable action covering the new files + any replaced originals.
        // Runs even if the write threw AFTER the originals were trashed, so they
        // stay recoverable via Undo (no-ops if nothing was trashed or written).
        const label =
          newUris.length === 1
            ? (newUris[0]!.split("/").pop() ?? "file")
            : `${newUris.length} files`;
        await recordResolvedUpload(
          projectId,
          wrote ? newUris : [],
          trashedOldUris,
          since,
          label,
        );
      }
    };

    // Only react to drags carrying OS files. An INTERNAL element drag (e.g.
    // dragging a row to move it within the file tree) advertises `text/plain`,
    // not `Files`, so it must not trigger the import overlay or steal the drop.
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragEnter();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragLeave();
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragOver();
    };
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer?.files || []);
      await handleDrop(
        files.map((f) => ({ name: f.name, getBuffer: () => f.arrayBuffer() })),
      );
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);

    // Lazy-load protocol message types — workspace transports them when a
    // hosting parent (e.g. an embedding window) relays drag state to us.
    Promise.all([
      import("@impower/spark-editor-protocol/src/protocols/MessageProtocol"),
      import("@impower/spark-editor-protocol/src/protocols/window/DraggedFilesInMessage"),
      import("@impower/spark-editor-protocol/src/protocols/window/DraggedFilesOutMessage"),
      import("@impower/spark-editor-protocol/src/protocols/window/DraggedFilesOverMessage"),
      import("@impower/spark-editor-protocol/src/protocols/window/DroppedFilesMessage"),
    ]).then(
      ([
        { onProtocolMessage },
        { DraggedFilesInMessage },
        { DraggedFilesOutMessage },
        { DraggedFilesOverMessage },
        { DroppedFilesMessage },
      ]) => {
        const disposers = [
          onProtocolMessage(DraggedFilesInMessage.type, () => dragEnter()),
          onProtocolMessage(DraggedFilesOutMessage.type, () => dragLeave()),
          onProtocolMessage(DraggedFilesOverMessage.type, () => dragOver()),
          onProtocolMessage(DroppedFilesMessage.type, (m) => {
            // Host relayed already-read buffers — wrap each as a resolved
            // getBuffer so handleDrop can run its uniform pipeline (zip-check,
            // conflict resolution, progress, undo).
            void handleDrop(
              m.params.files.map((f) => ({
                name: f.name,
                getBuffer: () => Promise.resolve(f.buffer),
              })),
            );
          }),
        ];
        disposeProtocol = () => disposers.forEach((d) => d());
      },
    );

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      disposeProtocol?.();
    };
  }, []);

  return (
    <div class="pointer-events-none absolute inset-0 z-[2] flex flex-col">
      {dragging && (
        <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-engine-900 text-foreground text-xl font-semibold">
          <Download class="size-16" stroke-width="1" />
          Import Project Files
        </div>
      )}
    </div>
  );
}
