import { Download } from "@impower/impower-ui/components";
import { useEffect, useRef, useState } from "preact/hooks";
import getValidFileName from "../../utils/getValidFileName";
import { importDroppedFiles } from "../../utils/importDroppedFiles";

export const propDefaults = {};
export type FileDropzoneProps = Partial<typeof propDefaults>;

/**
 * Window-level file-drop catcher. Two jobs:
 *
 *  1. ZIP = whole-project import. A single `.zip` dragged anywhere imports the
 *     project on drop.
 *  2. Loose files = fallback. A drop ONTO a file list is claimed by that list
 *     (it routes the files into the hovered folder / current scope — see
 *     useExternalFileDrop). This window handler only catches loose-file drops
 *     that land OUTSIDE any list (e.g. on the editor or preview pane), routing
 *     them by type: scripts -> `scripts/`, everything else -> `assets/`.
 *
 * Detection spans the whole window; only the OVERLAY is scoped. It shows for
 * any file drag, so dragging onto the editor gives feedback rather than
 * nothing, but stays hidden while the drag is over a `[data-file-drop-target]`
 * list — that list rings the target folder itself, and two affordances at once
 * reads as a bug.
 *
 * The wording is the same whichever kind of drag it is. Distinguishing them
 * was tried and reverted: host-relayed drags (the game preview iframe) carry
 * no MIME info, so they could only ever guess, and the label flipped between
 * panes for the same file. One consistent phrase beats a label that is
 * sometimes precise and sometimes wrong, and it reads correctly either way —
 * importing a project, or importing files into your project.
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

    // Host-relayed drags (the game-preview iframe, or an embedding editor).
    // These carry no MIME info, so they always present as a project import.
    //
    // They get the same self-clearing timeout as the window path: a relayed
    // "over" can stop arriving without a matching "out" -- the drag ends
    // inside the iframe, or the host stops relaying -- and without this the
    // overlay stays up forever with no drag behind it.
    const relayDragging = () => {
      setDragging(true);
      if (overlayTimer) clearTimeout(overlayTimer);
      overlayTimer = window.setTimeout(() => setDragging(false), 150);
    };
    const dragEnter = () => relayDragging();
    const dragLeave = () => {
      if (overlayTimer) clearTimeout(overlayTimer);
      overlayTimer = 0;
      setDragging(false);
    };
    const dragOver = () => relayDragging();

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
        items.map((it) => ({
          rel: targetRel(it.name),
          getBuffer: it.getBuffer,
        })),
      );
    };

    // Only react to drags carrying OS files. An INTERNAL element drag (e.g.
    // dragging a row to move it within the file tree) advertises `text/plain`,
    // not `Files`, so it must not trigger the overlay or steal the drop.
    const carriesFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    // The overlay is kept alive by the continuous `dragover` stream and cleared by
    // a short idle timeout. This is robust against BOTH the interior-boundary
    // flicker (every element the cursor crosses fires a spurious `dragleave`, which
    // a naive setDragging(false) would flash off) AND an abandoned drag (ESC /
    // leaving the window fire no `drop`) — dragover simply stops and the timer
    // clears it. So there's no native `dragleave` handler at all.
    let overlayTimer = 0;
    // A drag sitting over a file list belongs to that list's own highlight.
    const overFileList = (e: DragEvent) =>
      e.target instanceof Element &&
      !!e.target.closest("[data-file-drop-target]");

    const refreshOverlay = (e: DragEvent) => {
      const show = !overFileList(e);
      setDragging(show);
      if (overlayTimer) clearTimeout(overlayTimer);
      // dragover stops firing the moment the pointer leaves the window, so the
      // overlay has to time itself out rather than wait for a dragleave.
      overlayTimer = show
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

  // The overlay sits above every other layer: the z-10 chrome (header, sticky
  // tab bars, split divider), dialogs (z-50), toasts (z-[60]), and
  // CodeMirror's own panels and gutters (z-index 300/200). At z-[2] it cleared
  // none of them, so a drag left the page looking half-covered instead of
  // presenting one drop target.
  //
  // 400 rather than something just past the app's own z-[60] ceiling because
  // CodeMirror's `.cm-panels-bottom` is z-index 300 and NOTHING between it and
  // <body> establishes a stacking context, so that 300 competes here at the
  // root rather than staying inside the editor. (That leak is worth fixing at
  // the source -- it also puts the status bar above this app's dialogs -- but
  // containing it is a wider change than this overlay.)
  //
  // `absolute inset-0` fills whichever container this is mounted in --
  // currently MainWindow's middle region, so the overlay covers the content
  // area and leaves the header above and tab bar below visible. Scoping it by
  // MOUNT POINT rather than by offsetting a full-viewport overlay means there
  // is no header height duplicated here to drift out of sync.
  //
  // `pointer-events-none` so the drag and drop events still reach the
  // window-level handlers underneath.
  return (
    <div class="pointer-events-none absolute inset-0 z-[400] flex flex-col">
      {dragging && (
        <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-engine-900 text-foreground text-xl font-semibold">
          <Download class="size-16" stroke-width="1" />
          Import Project Files
        </div>
      )}
    </div>
  );
}
