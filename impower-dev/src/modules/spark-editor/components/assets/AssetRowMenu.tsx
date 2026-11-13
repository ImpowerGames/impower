import {
  Button,
  CheckIcon,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
  DownloadIcon,
  FolderIcon,
  MoreVerticalIcon,
  PencilIcon,
  TrashIcon,
} from "@impower/impower-ui/components";

export type AssetRowAction = "select" | "rename" | "move" | "download" | "delete";

export const ROW_ACTIONS: readonly AssetRowAction[] = ["select", "rename", "move", "delete"];

export const INSPECTOR_ACTIONS: readonly AssetRowAction[] = ["rename", "move", "download", "delete"];

export type AssetRowMenuProps = {
  name: string;
  kept?: string;
  actions?: readonly AssetRowAction[];
  onAction: (action: AssetRowAction) => void;
};

function Kept({ label, reason }: { label: string; reason?: string }) {
  return reason ? (
    <span class="flex max-w-60 min-w-0 flex-1 flex-col whitespace-normal">
      <span>{label}</span>
      <small class="text-xs/[1.5] text-muted">{reason}</small>
    </span>
  ) : (
    <>{label}</>
  );
}

export default function AssetRowMenu({ name, kept, actions = ROW_ACTIONS, onAction }: AssetRowMenuProps) {
  const offers = (action: AssetRowAction) => actions.includes(action);
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button variant="quiet" size="icon" aria-label={`Options for ${name}`} class="flex-none text-muted">
          <MoreVerticalIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" class="min-w-[196px]">
        {offers("select") && (
          <DropdownItem onSelect={() => onAction("select")}>
            <CheckIcon class="text-muted" />
            Select
          </DropdownItem>
        )}
        {offers("rename") && (
          <DropdownItem
            returnFocus={false}
            disabled={!!kept}
            class={kept ? "py-2" : undefined}
            onSelect={() => onAction("rename")}
          >
            <PencilIcon class="shrink-0 text-muted" />
            <Kept label="Rename" reason={kept} />
          </DropdownItem>
        )}
        {offers("move") && (
          <DropdownItem disabled={!!kept} class={kept ? "py-2" : undefined} onSelect={() => onAction("move")}>
            <FolderIcon class="shrink-0 text-muted" />
            <Kept label="Move…" reason={kept} />
          </DropdownItem>
        )}
        {offers("download") && (
          <DropdownItem onSelect={() => onAction("download")}>
            <DownloadIcon class="text-muted" />
            Download
          </DropdownItem>
        )}
        {offers("delete") && (
          <>
            <DropdownSeparator />
            <DropdownItem class="text-error" onSelect={() => onAction("delete")}>
              <TrashIcon />
              Delete
            </DropdownItem>
          </>
        )}
      </DropdownContent>
    </DropdownRoot>
  );
}
