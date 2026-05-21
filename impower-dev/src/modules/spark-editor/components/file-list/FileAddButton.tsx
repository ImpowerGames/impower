import { Button, Plus } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import getUniqueFileName from "../../utils/getUniqueFileName";
import workspace from "../../workspace/WorkspaceStore";
import { Workspace } from "../../workspace/Workspace";

export type FileAddButtonProps = {
  /** Pattern for the new filename (e.g. `"asset00.url"` or `"script00.sd"`). */
  defaultFilename: string;
  /** Label shown on the button face. */
  children: string;
  /**
   * Optional CSS `view-transition-name` for shared-element transitions.
   * When set, the button is pulled out of the root view-transition
   * snapshot and gets its own animation group — the browser interpolates
   * between this button's bounding box and any other element on the next
   * page with the same name, so the FAB visually stays in place across
   * a slide/fade.
   */
  viewTransitionName?: string;
};

/**
 * "Add" button used by the URLs assets pane and Logic > Scripts. Creates
 * an empty file with a name derived from `defaultFilename` (suffixed to
 * avoid collisions). Disabled while the workspace is in any sync phase.
 */
export default function FileAddButton({
  defaultFilename,
  children,
  viewTransitionName,
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
    const files = await Workspace.fs.getFiles(projectId);
    const filenames = Object.keys(files).map((uri) =>
      Workspace.fs.getFilename(uri),
    );
    const uniqueFilename = getUniqueFileName(filenames, defaultFilename);
    await Workspace.fs.createFiles({
      files: [
        {
          uri: Workspace.fs.getFileUri(projectId, uniqueFilename),
          data: new ArrayBuffer(0),
        },
      ],
    });
    await Workspace.window.recordScriptChange();
  }

  return (
    <div
      class="mx-4 my-6 flex justify-center"
      style={viewTransitionName ? { viewTransitionName } : undefined}
    >
      <Button
        variant="fab"
        size="fab"
        disabled={disabledSig.value}
        onClick={onClick}
      >
        <Plus class="size-5" />
        {children}
      </Button>
    </div>
  );
}
