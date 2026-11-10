import {
  Button,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
  MoreVerticalIcon,
  PencilIcon,
  TrashIcon,
} from "@impower/impower-ui/components";

export type AssetRowAction = "rename" | "delete";

export type AssetRowMenuProps = {
  name: string;
  onAction: (action: AssetRowAction) => void;
};

export default function AssetRowMenu({ name, onAction }: AssetRowMenuProps) {
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button variant="quiet" size="icon" aria-label={`Options for ${name}`} class="flex-none text-muted">
          <MoreVerticalIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" class="min-w-[196px]">
        <DropdownItem onSelect={() => onAction("rename")}>
          <PencilIcon class="text-muted" />
          Rename
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem class="text-error" onSelect={() => onAction("delete")}>
          <TrashIcon />
          Delete
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}
