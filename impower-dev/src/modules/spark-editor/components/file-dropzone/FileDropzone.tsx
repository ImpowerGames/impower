import { Download } from "@impower/impower-ui/components";
import { useEffect, useRef, useState } from "preact/hooks";
import getValidFileName from "../../utils/getValidFileName";
import { importDroppedFiles } from "../../utils/importDroppedFiles";

export const propDefaults = {};
export type FileDropzoneProps = Partial<typeof propDefaults>;

export default function FileDropzone(_props: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;

  useEffect(() => {
    let disposeProtocol: (() => void) | undefined;

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

    const carriesFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    let overlayTimer = 0;
    const overFileList = (e: DragEvent) =>
      e.target instanceof Element &&
      !!e.target.closest("[data-file-drop-target]");

    const refreshOverlay = (e: DragEvent) => {
      const show = !overFileList(e);
      setDragging(show);
      if (overlayTimer) clearTimeout(overlayTimer);
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
    const clearOverlay = () => {
      if (overlayTimer) clearTimeout(overlayTimer);
      overlayTimer = 0;
      setDragging(false);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("drop", clearOverlay, true);

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
