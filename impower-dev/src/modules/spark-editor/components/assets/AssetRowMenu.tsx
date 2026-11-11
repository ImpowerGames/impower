import {
  Button,
  CheckIcon,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
  FolderIcon,
  MoreVerticalIcon,
  PencilIcon,
  TrashIcon,
} from "@impower/impower-ui/components";

export type AssetRowAction = "select" | "rename" | "move" | "delete";

export type AssetRowMenuProps = {
  name: string;
  kept?: string;
  onAction: (action: AssetRowAction) => void;
};

function Kept({ label, reason }: { label: string; reason?: string }) {
  return reason ? (
    <span class="flex min-w-0 flex-1 flex-col whitespace-normal">
      <span>{label}</span>
      <small class="text-xs/[1.5] text-muted">{reason}</small>
    </span>
  ) : (
    <>{label}</>
  );
}

export default function AssetRowMenu({ name, kept, onAction }: AssetRowMenuProps) {
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button variant="quiet" size="icon" aria-label={`Options for ${name}`} class="flex-none text-muted">
          <MoreVerticalIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" class="min-w-[196px]">
        <DropdownItem onSelect={() => onAction("select")}>
          <CheckIcon class="text-muted" />
          Select
        </DropdownItem>
        <DropdownItem disabled={!!kept} class={kept ? "py-2" : undefined} onSelect={() => onAction("rename")}>
          <PencilIcon class="shrink-0 text-muted" />
          <Kept label="Rename" reason={kept} />
        </DropdownItem>
        <DropdownItem disabled={!!kept} class={kept ? "py-2" : undefined} onSelect={() => onAction("move")}>
          <FolderIcon class="shrink-0 text-muted" />
          <Kept label="Move…" reason={kept} />
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
