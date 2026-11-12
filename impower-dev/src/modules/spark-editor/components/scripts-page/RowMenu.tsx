import {
  Button,
  DownloadIcon,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
  DuplicateIcon,
  FolderIcon,
  MoreVerticalIcon,
  PencilIcon,
  TrashIcon,
} from "@impower/impower-ui/components";

export type RowAction = "rename" | "move" | "duplicate" | "download" | "delete";

export type RowMenuProps = {
  name: string;
  main: boolean;
  onAction: (action: RowAction) => void;
};

export default function RowMenu({ name, main, onAction }: RowMenuProps) {
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          size="icon"
          aria-label={`Options for ${name}`}
          class="flex-none text-muted"
        >
          <MoreVerticalIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" class="min-w-[196px]">
        {!main && (
          <DropdownItem returnFocus={false} onSelect={() => onAction("rename")}>
            <PencilIcon class="text-muted" />
            Rename
          </DropdownItem>
        )}
        {!main && (
          <DropdownItem onSelect={() => onAction("move")}>
            <FolderIcon class="text-muted" />
            Move…
          </DropdownItem>
        )}
        <DropdownItem onSelect={() => onAction("duplicate")}>
          <DuplicateIcon class="text-muted" />
          Duplicate
        </DropdownItem>
        <DropdownItem onSelect={() => onAction("download")}>
          <DownloadIcon class="text-muted" />
          Download
        </DropdownItem>
        {!main && <DropdownSeparator />}
        {!main && (
          <DropdownItem class="text-error" onSelect={() => onAction("delete")}>
            <TrashIcon />
            Delete
          </DropdownItem>
        )}
      </DropdownContent>
    </DropdownRoot>
  );
}
