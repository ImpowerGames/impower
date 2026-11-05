import {
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  Link,
  X,
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

  const inputClass =
    "h-9 w-full select-text rounded-md bg-foreground/5 px-3 text-sm text-foreground outline-none placeholder:text-foreground/40 focus:bg-foreground/10";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      initialFocus={urlRef}
    >
      <div class="mb-4 flex flex-row items-center gap-2">
        <Link class="size-5 text-foreground/70" />
        <DialogTitle class="flex-1">Add URL</DialogTitle>
        <Button
          variant="quiet"
          aria-label="Close"
          onClick={onClose}
          size="icon"
          class="text-muted"
        >
          <X class="size-4" />
        </Button>
      </div>

      <label class="mb-1 block text-xs font-medium text-foreground/60">
        URL
      </label>
      <input
        ref={urlRef}
        value={url}
        onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="https://cdn.example.com/image.png"
        class={`mb-3 ${inputClass}`}
      />

      <label class="mb-1 block text-xs font-medium text-foreground/60">
        Name
      </label>
      <input
        value={displayName}
        onInput={(e) => {
          setNameEdited(true);
          setName((e.target as HTMLInputElement).value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="asset"
        class={`mb-5 ${inputClass}`}
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
