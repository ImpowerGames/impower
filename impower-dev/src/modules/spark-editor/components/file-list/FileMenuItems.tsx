import {
  Download,
  DropdownItem,
  Pencil,
  Search,
  Trash,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";

export type FileMenuItemsProps = {
  onRename: () => void;
  onDelete: () => void;
  onFindUsages?: () => void;
  onDownload?: () => void;
};

export default function FileMenuItems({
  onRename,
  onDelete,
  onFindUsages,
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
