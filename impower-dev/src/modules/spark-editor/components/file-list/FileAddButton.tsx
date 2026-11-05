import {
  Button,
  PlusIcon,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import getUniqueFileName from "../../utils/getUniqueFileName";
import workspace from "../../workspace/WorkspaceStore";

export type FileAddButtonProps = {
  defaultFilename: string;
  children: string;
  collapsed?: boolean;
  targetDir?: string;
  deferred?: boolean;
};

export default function FileAddButton({
  defaultFilename,
  children,
  collapsed = false,
  targetDir = "",
  deferred = false,
}: FileAddButtonProps) {
  const disabledSig = useComputed(() => {
    const status = workspace.signals.syncStatus.value;
    return (
      status === "syncing" ||
      status === "loading" ||
      status === "importing" ||
      status === "exporting"
    );
  });

  async function onClick() {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    if (deferred) {
      const dot = defaultFilename.lastIndexOf(".");
      const ext = dot >= 0 ? defaultFilename.slice(dot + 1) : "";
      const { requestNewEntry } = await import("../../utils/newEntryDraft");
      requestNewEntry(targetDir, ext);
      return;
    }
    const { Workspace } = await import("../../workspace/Workspace");
    const files = await Workspace.fs.getFiles(projectId);
    const filenames = Object.keys(files).map((uri) =>
      Workspace.fs.getFilename(uri),
    );
    const uniqueFilename = getUniqueFileName(filenames, defaultFilename);
    const rel = targetDir ? `${targetDir}/${uniqueFilename}` : uniqueFilename;
    await Workspace.fs.createFiles({
      files: [
        {
          uri: Workspace.fs.getFileUri(projectId, rel),
          data: new ArrayBuffer(0),
        },
      ],
    });
    await Workspace.window.recordScriptChange();
  }

  return (
    <div class="mx-4 my-6 flex flex-col">

      <Button
        variant="primary"
        disabled={disabledSig.value}
        onClick={onClick}
        size={collapsed ? "icon" : "default"}
        class={collapsed ? "ml-auto" : "w-full"}
      >
        <PlusIcon />
        <span class={collapsed ? "sr-only" : undefined}>
          {children}
        </span>
      </Button>
    </div>
  );
}
