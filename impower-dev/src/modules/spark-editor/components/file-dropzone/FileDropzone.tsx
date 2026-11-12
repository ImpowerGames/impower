import { DropZone } from "@impower/impower-ui/components";
import { useEffect, useState } from "preact/hooks";
import { isAssetType } from "../../utils/assetTypes";
import { showSnackbar } from "../../utils/snackbar";
import { addAssetFiles, isProjectZipDrop, openDroppedZip, type AddedFile } from "../../workspace/addAssetFiles";
import { routeOfState } from "../../workspace/routes";
import workspace from "../../workspace/WorkspaceStore";
import { carriesFiles, droppedFiles, FILE_DROP_HIDE_MS, FILE_DROP_TARGET } from "../../utils/fileDrops";

export const propDefaults = {};
export type FileDropzoneProps = Partial<typeof propDefaults>;

export const DROP_NOTES = {
  files: ["Drop to add to Assets", "Each file goes to the folder of its type."],
  zip: ["Drop to replace this project", "A backup replaces every script and asset, after asking."],
} as const;

const draggedZip = (event: DragEvent) => {
  const items = Array.from(event.dataTransfer?.items ?? []);
  return items.length === 1 && items[0]!.kind === "file" && /zip/i.test(items[0]!.type);
};

const viewedFolder = (): string => {
  const state = workspace.state.peek();
  const type = isAssetType(state.lists?.assetsType) ? state.lists.assetsType : "image";
  return state.lists?.assetsFolders?.[type] ?? "";
};

export const deliverDrop = async (files: AddedFile[]): Promise<void> => {
  if (!files.length || !workspace.signals.projectId.peek()) {
    return;
  }
  const onAssets = routeOfState(workspace.state.peek()) === "collection";
  const folder = onAssets ? viewedFolder() : "";
  const zip = isProjectZipDrop(files);
  const { Workspace } = await import("../../workspace/Workspace");
  try {
    if (zip) {
      if ((await openDroppedZip(files[0]!)) === "refused" && !onAssets) {
        Workspace.window.navigateTo("collection");
      }
      return;
    }
    if (!onAssets) {
      Workspace.window.navigateTo("collection");
    }
    const landed = await addAssetFiles(files, folder, { dropped: true });
    if (landed.length) {
      workspace.assetsReveal.value = landed;
    }
  } catch (error) {
    showSnackbar({ message: error instanceof Error ? error.message : String(error) });
  }
};

export default function FileDropzone(_props: FileDropzoneProps) {
  const [note, setNote] = useState<keyof typeof DROP_NOTES | null>(null);

  useEffect(() => {
    let timer = 0;
    let disposeProtocol: (() => void) | undefined;
    let disposed = false;
    const hide = () => {
      clearTimeout(timer);
      timer = 0;
      setNote(null);
    };
    const show = (kind: keyof typeof DROP_NOTES) => {
      setNote(kind);
      clearTimeout(timer);
      timer = window.setTimeout(hide, FILE_DROP_HIDE_MS);
    };
    const onPage = (event: DragEvent) =>
      event.target instanceof Element && !!event.target.closest(`[${FILE_DROP_TARGET}]`);

    const onDragOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (onPage(event)) {
        hide();
        return;
      }
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      show(draggedZip(event) ? "zip" : "files");
    };
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      hide();
      if (!onPage(event)) {
        void deliverDrop(droppedFiles(event));
      }
    };

    window.addEventListener("dragenter", onDragOver);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);

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
        if (disposed) return;
        const disposers = [
          onProtocolMessage(DraggedFilesInMessage.type, () => show("files")),
          onProtocolMessage(DraggedFilesOutMessage.type, () => hide()),
          onProtocolMessage(DraggedFilesOverMessage.type, () => show("files")),
          onProtocolMessage(DroppedFilesMessage.type, (message) => {
            hide();
            void deliverDrop(
              message.params.files.map((file) => ({
                name: file.name,
                size: file.buffer.byteLength,
                getBuffer: () => Promise.resolve(file.buffer),
              })),
            );
          }),
        ];
        disposeProtocol = () => disposers.forEach((dispose) => dispose());
      },
    );

    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("dragenter", onDragOver);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      disposeProtocol?.();
    };
  }, []);

  if (!note) {
    return null;
  }
  const [title, detail] = DROP_NOTES[note];
  return <DropZone scope="window" title={title} detail={detail} />;
}
