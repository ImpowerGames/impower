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
import {
  browseParent,
  folderLabel,
  isInside,
  nameOf,
  scriptFolders,
  scriptsHome,
  type ScriptListing,
} from "../../workspace/scriptsListing";
import NameRow from "./NameRow";

export type MoveDialogProps = {
  path: string | null;
  listing: ScriptListing;
  onMove: (path: string, folder: string) => Promise<void>;
  onCreateFolder: (parent: string, name: string) => Promise<string>;
  onClose: () => void;
};

export default function MoveDialog({
  path,
  listing,
  onMove,
  onCreateFolder,
  onClose,
}: MoveDialogProps) {
  const home = scriptsHome(listing);
  const from = path ? browseParent(path, home) : "";
  const [target, setTarget] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const chosen = target ?? from;
  const movingFolder = !!path && !Object.hasOwn(listing.files, path);
  const folders = [
    "",
    ...scriptFolders(listing).filter((f) => !(movingFolder && isInside(f, path!))),
  ];

  const close = () => {
    setTarget(null);
    setCreating(false);
    setError("");
    onClose();
  };

  return (
    <Dialog
      open={!!path}
      onOpenChange={(open) => !open && close()}
      size="md"
      flush
      class="max-h-[80vh]"
    >
      <div class="flex flex-none flex-col gap-1 px-5 pt-5 pb-3">
        <DialogTitle>Move {path ? nameOf(path) : ""}</DialogTitle>
        <DialogDescription>To {folderLabel(chosen, home)}</DialogDescription>
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
            icon={folder ? <FolderIcon /> : <RootIcon />}
            label={folderLabel(folder, home)}
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
              await onMove(path!, chosen);
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
