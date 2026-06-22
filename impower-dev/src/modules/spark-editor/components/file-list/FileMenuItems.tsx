import {
  Download,
  DropdownItem,
  Files,
  Pencil,
  Search,
  Trash,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";

export type FileMenuItemsProps = {
  onRename: () => void;
  onDelete: () => void;
  /** Assets only — lists scripts referencing it. */
  onFindUsages?: () => void;
  /** Files only — copies it under a unique name. */
  onDuplicate?: () => void;
  /** Files only — saves it to the user's device. */
  onDownload?: () => void;
};

/**
 * The shared item list for a file row's actions — rendered both in the 3-dots
 * dropdown (FileOptionsButton) and the desktop right-click context menu
 * (FileItem). All items disable while the workspace is syncing/loading.
 */
export default function FileMenuItems({
  onRename,
  onDelete,
  onFindUsages,
  onDuplicate,
  onDownload,
}: FileMenuItemsProps) {
  const disabled = useComputed(() => {
    const status = workspace.signals.syncStatus.value;
    return (
      status === "syncing" ||
      status === "loading" ||
      status === "importing" ||
      status === "exporting"
    );
  }).value;
  return (
    <>
      <DropdownItem disabled={disabled} onSelect={() => onRename()}>
        <Pencil class="size-4" />
        Rename
      </DropdownItem>
      {onFindUsages && (
        <DropdownItem disabled={disabled} onSelect={() => onFindUsages()}>
          <Search class="size-4" />
          Find usages
        </DropdownItem>
      )}
      {onDuplicate && (
        <DropdownItem disabled={disabled} onSelect={() => onDuplicate()}>
          <Files class="size-4" />
          Duplicate
        </DropdownItem>
      )}
      {onDownload && (
        <DropdownItem disabled={disabled} onSelect={() => onDownload()}>
          <Download class="size-4" />
          Download
        </DropdownItem>
      )}
      <DropdownItem disabled={disabled} onSelect={() => onDelete()}>
        <Trash class="size-4" />
        Delete
      </DropdownItem>
    </>
  );
}
