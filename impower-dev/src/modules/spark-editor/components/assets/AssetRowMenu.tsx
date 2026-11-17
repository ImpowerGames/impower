import {
  Button,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
  DownloadIcon,
  FolderIcon,
  type IconComponent,
  MoreVerticalIcon,
  PencilPlainIcon,
  PlusIcon,
  SelectIcon,
  TrashIcon,
  UploadIcon,
  VariantsIcon,
  type ButtonGlyph,
} from "@impower/impower-ui/components";

export type AssetRowAction =
  | "open"
  | "select"
  | "variants"
  | "upload"
  | "newFolder"
  | "rename"
  | "move"
  | "download"
  | "delete";

export type AssetMenuEntry = AssetRowAction | "separator";

type EntrySpec = {
  label: string;
  Icon: IconComponent;
  kept?: boolean;
  danger?: boolean;
  returnFocus?: boolean;
};

const ENTRIES: Record<AssetRowAction, EntrySpec> = {
  open: { label: "Open", Icon: FolderIcon },
  select: { label: "Select", Icon: SelectIcon },
  variants: { label: "Variants", Icon: VariantsIcon },
  upload: { label: "Upload here…", Icon: UploadIcon },
  newFolder: { label: "New folder inside…", Icon: PlusIcon, returnFocus: false },
  rename: { label: "Rename", Icon: PencilPlainIcon, kept: true, returnFocus: false },
  move: { label: "Move…", Icon: FolderIcon, kept: true },
  download: { label: "Download", Icon: DownloadIcon },
  delete: { label: "Delete", Icon: TrashIcon, danger: true },
};

const THING_ENTRIES: readonly AssetMenuEntry[] = ["select", "variants", "rename", "move", "delete"];

const FOLDER_ENTRIES: readonly AssetMenuEntry[] = [
  "open",
  "select",
  "upload",
  "newFolder",
  "separator",
  "rename",
  "move",
  "delete",
];

export const INSPECTOR_ACTIONS: readonly AssetMenuEntry[] = ["rename", "move", "download", "separator", "delete"];

export const rowEntries = (row: { kind: string; paths?: readonly string[] }): readonly AssetMenuEntry[] =>
  row.kind === "folder" ? FOLDER_ENTRIES : row.paths ? THING_ENTRIES : THING_ENTRIES.filter((entry) => entry !== "variants");

export type AssetRowMenuTone = "muted" | "ink";

const TRIGGER_TONE: Record<AssetRowMenuTone, string> = {
  muted: "flex-none text-muted",
  ink: "flex-none text-ink",
};

export type AssetRowMenuProps = {
  tone?: AssetRowMenuTone;
  name: string;
  kept?: string;
  entries: readonly AssetMenuEntry[];
  glyph?: ButtonGlyph;
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

export default function AssetRowMenu({ name, kept, entries, glyph = "md", tone = "muted", onAction }: AssetRowMenuProps) {
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button variant="quiet" size="icon" glyph={glyph} aria-label={`Options for ${name}`} class={TRIGGER_TONE[tone]}>
          <MoreVerticalIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent elevation="library" align="end" class="min-w-[196px]">
        {entries.map((entry, index) => {
          if (entry === "separator") {
            return <DropdownSeparator key={`separator-${index}`} />;
          }
          const { label, Icon, danger, returnFocus } = ENTRIES[entry];
          const reason = ENTRIES[entry].kept ? kept : undefined;
          return (
            <DropdownItem
              key={entry}
              returnFocus={returnFocus}
              disabled={!!reason}
              class={danger ? "text-error" : reason ? "py-2" : undefined}
              onSelect={() => onAction(entry)}
            >
              <Icon class="shrink-0 text-muted" />
              <Kept label={label} reason={reason} />
            </DropdownItem>
          );
        })}
      </DropdownContent>
    </DropdownRoot>
  );
}
