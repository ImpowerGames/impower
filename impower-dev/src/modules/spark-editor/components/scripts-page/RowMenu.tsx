import {
  Button,
  DownloadIcon,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
  DuplicateIcon,
  FolderIcon,
  MoreVerticalIcon,
  PencilPlainIcon,
  SelectIcon,
  TrashIcon,
} from "@impower/impower-ui/components";

export type RowAction =
  | "select"
  | "rename"
  | "move"
  | "duplicate"
  | "download"
  | "delete";

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
          glyph="md"
          aria-label={`Options for ${name}`}
          class="flex-none text-muted"
        >
          <MoreVerticalIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent elevation="library" align="end" class="min-w-[196px]">
        {!main && (
          <DropdownItem onSelect={() => onAction("select")}>
            <SelectIcon class="text-muted" />
            Select
          </DropdownItem>
        )}
        {!main && (
          <DropdownItem returnFocus={false} onSelect={() => onAction("rename")}>
            <PencilPlainIcon class="text-muted" />
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
        {!main && (
          <DropdownItem class="text-error" onSelect={() => onAction("delete")}>
            <TrashIcon class="text-muted" />
            Delete
          </DropdownItem>
        )}
      </DropdownContent>
    </DropdownRoot>
  );
}
