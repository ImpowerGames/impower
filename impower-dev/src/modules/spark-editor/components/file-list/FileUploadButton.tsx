import { Button, Upload } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useRef } from "preact/hooks";
import getValidFileName from "../../utils/getValidFileName";
import workspace from "../../workspace/WorkspaceStore";

export type FileUploadButtonProps = {
  /** `accept=""` for the underlying file input. */
  accept: string;
  /** Allow multiple file selection. */
  multiple?: boolean;
  /** Label shown on the button face. */
  children: string;
  /** Collapse to an icon-only circle docked right (when the list is scrolled). */
  collapsed?: boolean;
};

/**
 * "Upload Files" button used by the Files assets pane. Wraps a hidden
 * `<input type="file">` in a styled `<Button variant="fab">`. Disabled
 * while the workspace is in any sync phase.
 */
export default function FileUploadButton({
  accept,
  multiple = true,
  children,
  collapsed = false,
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const disabledSig = useComputed(() => {
    const status = workspace.signals.syncStatus.value;
    return (
      status === "syncing" ||
      status === "loading" ||
      status === "importing" ||
      status === "exporting"
    );
  });

  async function onChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const fileList = input.files;
    if (!fileList) return;
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const files = await Promise.all(
      Array.from(fileList).map(async (file) => ({
        uri: Workspace.fs.getFileUri(projectId, getValidFileName(file.name)),
        data: await file.arrayBuffer(),
      })),
    );
    await Workspace.fs.createFiles({ files });
    await Workspace.window.recordAssetChange();
    input.value = "";
  }

  return (
    <div class="mx-4 my-6 flex">
      <Button
        variant="fab"
        disabled={disabledSig.value}
        onClick={() => inputRef.current?.click()}
        class={`ml-auto h-12 gap-0 overflow-hidden rounded-full text-base font-normal transition-[width,padding] duration-200 ease-out ${
          collapsed ? "w-12 px-0" : "w-full px-5"
        }`}
      >
        <Upload class="size-5 shrink-0" />
        <span
          class={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ease-out ${
            collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-[12rem] opacity-100"
          }`}
        >
          {children}
        </span>
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        class="hidden"
        onChange={onChange}
      />
    </div>
  );
}
