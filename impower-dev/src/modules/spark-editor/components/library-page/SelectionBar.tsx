import {
  Button,
  CloseIcon,
  DownloadIcon,
  FolderIcon,
  TrashIcon,
} from "@impower/impower-ui/components";
import type { JSX } from "preact";

export type SelectionAction = "move" | "download" | "delete";

export type SelectionBarProps = {
  count: number;
  onSelectAll: () => void;
  onAction: (action: SelectionAction) => void;
  onClose: () => void;
};

const ACTIONS: { action: SelectionAction; label: string; icon: JSX.Element }[] = [
  { action: "move", label: "Move…", icon: <FolderIcon /> },
  { action: "download", label: "Download", icon: <DownloadIcon /> },
  { action: "delete", label: "Delete…", icon: <TrashIcon /> },
];

export default function SelectionBar({ count, onSelectAll, onAction, onClose }: SelectionBarProps) {
  return (
    <div class="flex min-w-0 flex-1 items-center gap-1.5">
      <Button variant="quiet" size="icon" aria-label="Stop selecting" title="Stop selecting" class="flex-none text-muted" onClick={onClose}>
        <CloseIcon />
      </Button>
      <span role="status" class="text-[13px] font-semibold whitespace-nowrap">
        {count ? `${count} selected` : "Select items"}
      </span>
      <Button variant="quiet" size="compact" class="flex-none font-semibold" onClick={onSelectAll}>
        Select all
      </Button>
      <span class="ml-auto flex gap-1.5">
        {ACTIONS.map(({ action, label, icon }) => (
          <Button
            key={action}
            variant="quiet"
            size="compact"
            class="font-semibold"
            disabled={!count}
            onClick={() => onAction(action)}
          >
            {icon}
            <span class="@max-[480px]:sr-only">{label}</span>
          </Button>
        ))}
      </span>
    </div>
  );
}
