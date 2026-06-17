import { Download } from "@impower/impower-ui/components";
import { useEffect, useRef, useState } from "preact/hooks";
import getValidFileName from "../../utils/getValidFileName";

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
 *   2. DragFilesEnter / Over / Leave / DropFiles protocol messages
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

    const handleDrop = async (
      files: { name: string; buffer: ArrayBuffer }[],
    ) => {
      setDragging(false);
      const { Workspace } = await import("../../workspace/Workspace");
      const store = (
        await import("../../workspace/WorkspaceStore")
      ).default.state.value;
      const projectId = store?.project?.id;
      if (!projectId) return;
      if (!files || files.length === 0) return;
      if (files.length === 1 && files[0]?.name.endsWith(".zip")) {
        const file = files[0];
        await Workspace.window.importLocalProject(file.name, file.buffer);
      } else {
        const created = files.map((file) => {
          const validFileName = getValidFileName(file.name);
          return {
            uri: Workspace.fs.getFileUri(projectId, validFileName),
            data: file.buffer,
          };
        });
        await Workspace.fs.createFiles({ files: created });
        await Workspace.window.recordAssetChange();
      }
    };

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragEnter();
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragLeave();
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragOver();
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer?.files || []);
      const fileArray = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          buffer: await f.arrayBuffer(),
        })),
      );
      handleDrop(fileArray);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);

    // Lazy-load protocol message types — workspace transports them when a
    // hosting parent (e.g. an embedding window) relays drag state to us.
    Promise.all([
      import("@impower/spark-editor-protocol/src/protocols/MessageProtocol"),
      import(
        "@impower/spark-editor-protocol/src/protocols/window/DragFilesEnterMessage"
      ),
      import(
        "@impower/spark-editor-protocol/src/protocols/window/DragFilesLeaveMessage"
      ),
      import(
        "@impower/spark-editor-protocol/src/protocols/window/DragFilesOverMessage"
      ),
      import(
        "@impower/spark-editor-protocol/src/protocols/window/DropFilesMessage"
      ),
    ]).then(
      ([
        { onProtocolMessage },
        { DragFilesEnterMessage },
        { DragFilesLeaveMessage },
        { DragFilesOverMessage },
        { DropFilesMessage },
      ]) => {
        const disposers = [
          onProtocolMessage(DragFilesEnterMessage.type, () => dragEnter()),
          onProtocolMessage(DragFilesLeaveMessage.type, () => dragLeave()),
          onProtocolMessage(DragFilesOverMessage.type, () => dragOver()),
          onProtocolMessage(DropFilesMessage.type, (m) => handleDrop(m.params.files)),
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
