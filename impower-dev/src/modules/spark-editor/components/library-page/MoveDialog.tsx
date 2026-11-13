import {
  Button,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
  FolderIcon,
  FolderPlusIcon,
  ListRow,
  RootIcon,
} from "@impower/impower-ui/components";
import { useState } from "preact/hooks";
import NameRow from "./NameRow";

export type MoveDialogProps = {
  paths: readonly string[] | null;
  label: string;
  root: string;
  folders: readonly string[];
  from: string | null;
  folderLabel: (folder: string) => string;
  onMove: (paths: readonly string[], folder: string) => Promise<void>;
  onCreateFolder: (parent: string, name: string) => Promise<string>;
  onClose: () => void;
};

export default function MoveDialog({
  paths,
  label,
  root,
  folders,
  from,
  folderLabel,
  onMove,
  onCreateFolder,
  onClose,
}: MoveDialogProps) {
  const [target, setTarget] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const chosen = target ?? from ?? root;

  const close = () => {
    setTarget(null);
    setCreating(false);
    setError("");
    onClose();
  };

  return (
    <Dialog
      open={!!paths}
      onOpenChange={(open) => !open && close()}
      size="md"
      flush
      class="max-h-[80%]"
    >
      <div class="flex flex-none flex-col gap-1 px-5 pt-5 pb-3">
        <DialogTitle>Move {label}</DialogTitle>
        <DialogDescription>To {folderLabel(chosen)}</DialogDescription>
      </div>
      <div role="listbox" aria-label="Folders" class="min-h-0 flex-1 overflow-y-auto border-y border-edge px-3 py-2">
        {creating && (
          <NameRow
            icon={<FolderIcon />}
            label="New folder name"
            onCancel={() => setCreating(false)}
            onCommit={async (name) => {
              const created = await onCreateFolder(chosen, name);
              setCreating(false);
              setTarget(created);
            }}
          />
        )}
        {folders.map((folder) => (
          <ListRow
            key={folder || "root"}
            size="compact"
            role="option"
            aria-selected={folder === chosen}
            current={folder === chosen}
            icon={folder === root ? <RootIcon /> : <FolderIcon />}
            label={folderLabel(folder)}
            onClick={() => setTarget(folder)}
          />
        ))}
      </div>
      {error && (
        <p role="alert" class="px-5 pt-3 text-sm text-error">
          {error}
        </p>
      )}
      <DialogActions class="items-center p-4">
        <Button variant="quiet" class="mr-auto text-accent" onClick={() => setCreating(true)}>
          <FolderPlusIcon />
          New folder
        </Button>
        <Button variant="quiet" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={chosen === from}
          onClick={async () => {
            try {
              await onMove(paths!, chosen);
              close();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Move here
        </Button>
      </DialogActions>
    </Dialog>
  );
}
