import { Download } from "@impower/impower-ui/components";
import { useEffect, useRef, useState } from "preact/hooks";
import getValidFileName from "../../utils/getValidFileName";
import { importDroppedFiles } from "../../utils/importDroppedFiles";

export const propDefaults = {};
export type FileDropzoneProps = Partial<typeof propDefaults>;

/**
 * Window-level file-drop catcher. Two jobs:
 *
 *  1. ZIP = whole-project import. A single `.zip` dragged anywhere shows the
 *     full-page "Import Project Files" overlay and imports the project on drop.
 *  2. Loose files = fallback. A drop ONTO a file list is claimed by that list
 *     (it routes the files into the hovered folder / current scope — see
 *     useExternalFileDrop). This window handler only catches loose-file drops
 *     that land OUTSIDE any list (e.g. on the preview pane), routing them by
 *     type: scripts -> `scripts/`, everything else -> `assets/`. No overlay for
 *     loose files — the list shows a folder highlight instead.
 *
 * Also handles DraggedFilesIn/Over/Out/DroppedFiles protocol messages relayed by
 * an embedding host (e.g. VS Code), which can't carry MIME info, so those keep
 * the overlay + the by-type fallback routing.
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

    // Loose-file fallback (drops outside any list, + host-relayed protocol
    // drops). A single .zip is a whole-project import; otherwise route by type so
    // the file lands in the folder whose pane shows it.
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
      if (items.length === 1 && /\.zip$/i.test(items[0]?.name ?? "")) {
        const item = items[0]!;
        await Workspace.window.importLocalProject(
          item.name,
          await item.getBuffer(),
        );
        return;
      }
      const targetRel = (name: string) => {
        const valid = getValidFileName(name);
        return valid.endsWith(".sd") ? `scripts/${valid}` : `assets/${valid}`;
      };
      await importDroppedFiles(
        projectId,
        items.map((it) => ({ rel: targetRel(it.name), getBuffer: it.getBuffer })),
      );
    };

    // Only react to drags carrying OS files. An INTERNAL element drag (e.g.
    // dragging a row to move it within the file tree) advertises `text/plain`,
    // not `Files`, so it must not trigger the overlay or steal the drop.
    const carriesFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    // Best-effort "single .zip" check from the only thing readable mid-drag —
    // each item's MIME `type` (filenames are hidden until drop). A zip with an
    // empty/unknown MIME falls through (no overlay), but the drop still imports
    // it as a project by filename. Drives the full-page overlay: zips only.
    const isZipDrag = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (!dt) return false;
      const items = Array.from(dt.items).filter((i) => i.kind === "file");
      return items.length === 1 && /zip/i.test(items[0]?.type ?? "");
    };

    // The overlay is kept alive by the continuous `dragover` stream and cleared by
    // a short idle timeout. This is robust against BOTH the interior-boundary
    // flicker (every element the cursor crosses fires a spurious `dragleave`, which
    // a naive setDragging(false) would flash off) AND an abandoned drag (ESC /
    // leaving the window fire no `drop`) — dragover simply stops and the timer
    // clears it. So there's no native `dragleave` handler at all.
    let overlayTimer = 0;
    const refreshOverlay = (e: DragEvent) => {
      const zip = isZipDrag(e);
      setDragging(zip);
      if (overlayTimer) clearTimeout(overlayTimer);
      overlayTimer = zip
        ? window.setTimeout(() => setDragging(false), 150)
        : 0;
    };
    const onDragEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      refreshOverlay(e);
    };
    const onDragOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      // preventDefault keeps window a valid drop target for files that miss every
      // list (so the browser doesn't navigate to the dropped file).
      e.preventDefault();
      refreshOverlay(e);
    };
    const onDrop = async (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files || []);
      await handleDrop(
        files.map((f) => ({ name: f.name, getBuffer: () => f.arrayBuffer() })),
      );
    };
    // Capture phase so the overlay always clears even when a list claims the drop
    // and stops it from bubbling up to the window `drop` handler above.
    const clearOverlay = () => {
      if (overlayTimer) clearTimeout(overlayTimer);
      overlayTimer = 0;
      setDragging(false);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("drop", clearOverlay, true);

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
            // getBuffer so handleDrop runs its uniform pipeline.
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
      if (overlayTimer) clearTimeout(overlayTimer);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("drop", clearOverlay, true);
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
