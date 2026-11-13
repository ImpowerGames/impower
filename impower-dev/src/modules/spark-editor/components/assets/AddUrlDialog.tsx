import {
  Button,
  CloseIcon,
  Dialog,
  DialogActions,
  DialogTitle,
  LinkIcon,
  TextField,
} from "@impower/impower-ui/components";
import { useEffect, useRef, useState } from "preact/hooks";

export type AddUrlDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (url: string, name: string) => void;
};

const deriveName = (url: string): string => {
  const path = url.split(/[?#]/)[0] ?? "";
  const base = path.split("/").filter(Boolean).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).trim();
};

export default function AddUrlDialog({
  open,
  onClose,
  onSubmit,
}: AddUrlDialogProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const urlRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setName("");
    setNameEdited(false);
  }, [open]);

  const trimmedUrl = url.trim();
  const displayName = nameEdited ? name : deriveName(url);
  const canSubmit = !!trimmedUrl;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmedUrl, displayName.trim() || "asset");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      initialFocus={urlRef}
    >
      <div class="mb-4 flex flex-row items-center gap-2">
        <LinkIcon class="size-5 text-foreground/70" />
        <DialogTitle class="flex-1">Add URL</DialogTitle>
        <Button
          variant="quiet"
          aria-label="Close"
          onClick={onClose}
          size="icon"
          class="text-muted"
        >
          <CloseIcon class="size-4" />
        </Button>
      </div>

      <label for="add-url-address" class="mb-1 block text-xs font-medium text-foreground/60">
        URL
      </label>
      <TextField
        ref={urlRef}
        purpose="url"
        size="tall"
        width="full"
        id="add-url-address"
        value={url}
        onValueChange={setUrl}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="https://cdn.example.com/image.png"
        class="mb-3"
      />

      <label for="add-url-name" class="mb-1 block text-xs font-medium text-foreground/60">
        Name
      </label>
      <TextField
        purpose="literal"
        size="tall"
        width="full"
        id="add-url-name"
        value={displayName}
        onValueChange={(next) => {
          setNameEdited(true);
          setName(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="asset"
        class="mb-5"
      />

      <DialogActions>
        <Button
          variant="quiet"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!canSubmit}
          onClick={submit}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
