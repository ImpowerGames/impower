import {
  Button,
  DownloadIcon,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
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
        <DropdownItem
          returnFocus={false}
          disabled={main}
          onSelect={() => onAction("rename")}
        >
          <PencilPlainIcon class="text-muted" />
          Rename
        </DropdownItem>
        <DropdownItem disabled={main} onSelect={() => onAction("move")}>
          <FolderIcon class="text-muted" />
          Move
        </DropdownItem>
        <DropdownItem onSelect={() => onAction("download")}>
          <DownloadIcon class="text-muted" />
          Download
        </DropdownItem>
        <DropdownItem
          class="text-error"
          disabled={main}
          onSelect={() => onAction("delete")}
        >
          <TrashIcon class="text-muted" />
          Delete
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}
