import {
  DownloadIcon,
  DropdownItem,
  PencilIcon,
  SearchIcon,
  TrashIcon,
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
        <PencilIcon class="size-4" />
        Rename
      </DropdownItem>
      {onFindUsages && (
        <DropdownItem disabled={disabled} onSelect={() => onFindUsages()}>
          <SearchIcon class="size-4" />
          Find usages
        </DropdownItem>
      )}
      {onDownload && (
        <DropdownItem disabled={disabled} onSelect={() => onDownload()}>
          <DownloadIcon class="size-4" />
          Download
        </DropdownItem>
      )}
      <DropdownItem disabled={disabled} onSelect={() => onDelete()}>
        <TrashIcon class="size-4" />
        Delete
      </DropdownItem>
    </>
  );
}
