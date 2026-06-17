import { Button, Plus } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import getUniqueFileName from "../../utils/getUniqueFileName";
import workspace from "../../workspace/WorkspaceStore";

export type FileAddButtonProps = {
  /** Pattern for the new filename (e.g. `"asset00.url"` or `"script00.sd"`). */
  defaultFilename: string;
  /** Label shown on the button face. */
  children: string;
  /**
   * Collapse to an icon-only circle docked to the right. Driven by the file
   * list's scroll position (collapsed once the list is scrolled off the top),
   * mirroring main's `<s-collapsible collapsed="scrolled">`.
   */
  collapsed?: boolean;
};

/**
 * "Add" button used by the URLs assets pane and Logic > Scripts. Creates
 * an empty file with a name derived from `defaultFilename` (suffixed to
 * avoid collisions). Disabled while the workspace is in any sync phase.
 */
export default function FileAddButton({
  defaultFilename,
  children,
  collapsed = false,
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
    const { Workspace } = await import("../../workspace/Workspace");
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
    <div class="mx-4 my-6 flex flex-col">
      {/* `ml-auto` docks the button right; when collapsed it shrinks to a 48px
          circle (w-12, px-0) showing only the icon, while the label fades +
          collapses its width to 0 so the icon stays centered. */}
      <Button
        variant="fab"
        disabled={disabledSig.value}
        onClick={onClick}
        class={`ml-auto h-12 gap-0 overflow-hidden rounded-full text-base font-normal transition-[width,padding] duration-200 ease-out ${
          collapsed ? "w-12 px-0" : "w-full px-5"
        }`}
      >
        <Plus class="size-5 shrink-0" />
        <span
          class={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ease-out ${
            collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-[12rem] opacity-100"
          }`}
        >
          {children}
        </span>
      </Button>
    </div>
  );
}
