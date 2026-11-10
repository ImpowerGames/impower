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

export type AssetRowMenuRow = {
  name: string;
  paths?: readonly string[];
};

export const assetRowActions = (row: AssetRowMenuRow): AssetRowAction[] =>
  row.paths ? ["delete"] : ["rename", "delete"];

export type AssetRowMenuProps = {
  row: AssetRowMenuRow;
  onAction: (action: AssetRowAction) => void;
};

export default function AssetRowMenu({ row, onAction }: AssetRowMenuProps) {
  const actions = assetRowActions(row);
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button variant="quiet" size="icon" aria-label={`Options for ${row.name}`} class="flex-none text-muted">
          <MoreVerticalIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" class="min-w-[196px]">
        {actions.includes("rename") && (
          <>
            <DropdownItem onSelect={() => onAction("rename")}>
              <PencilIcon class="text-muted" />
              Rename
            </DropdownItem>
            <DropdownSeparator />
          </>
        )}
        <DropdownItem class="text-error" onSelect={() => onAction("delete")}>
          <TrashIcon />
          Delete
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}
