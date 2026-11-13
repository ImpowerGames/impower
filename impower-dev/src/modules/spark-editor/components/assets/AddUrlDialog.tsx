import {
  Button,
  CloseIcon,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
  TextField,
} from "@impower/impower-ui/components";
import { useEffect, useRef, useState } from "preact/hooks";

export type AddUrlDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (url: string, name: string) => void;
};

export const ADDRESS_REQUIRED_MESSAGE =
  "Enter a full address starting with http:// or https://.";

const deriveName = (url: string): string => {
  const path = url.split(/[?#]/)[0] ?? "";
  const base = path.split("/").filter(Boolean).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).trim();
};

const isWebAddress = (url: string) => /^https?:\/\/\S+$/.test(url);

const labelClass = "mt-[14px] mb-[5px] block text-[13px]/[1.5] text-muted";

export default function AddUrlDialog({
  open,
  onClose,
  onSubmit,
}: AddUrlDialogProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [error, setError] = useState("");
  const urlRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setName("");
    setNameEdited(false);
    setError("");
  }, [open]);

  const trimmedUrl = url.trim();
  const displayName = nameEdited ? name : deriveName(url);

  const submit = () => {
    if (!isWebAddress(trimmedUrl)) {
      setError(ADDRESS_REQUIRED_MESSAGE);
      return;
    }
    onSubmit(trimmedUrl, displayName.trim() || deriveName(trimmedUrl) || "link");
    onClose();
  };

  const submitOnEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      initialFocus={urlRef}
      size="form"
    >
      <div class="mb-[18px] flex flex-row items-center gap-3">
        <DialogTitle class="flex-1 text-[20px] font-semibold">Add a link</DialogTitle>
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

      <DialogDescription class="text-[12px]/[1.6] text-muted">
        A link keeps a file that lives on the web, such as a picture you host
        elsewhere. It is listed with files of its kind.
      </DialogDescription>

      <label for="add-url-address" class={labelClass}>
        Address
      </label>
      <TextField
        id="add-url-address"
        ref={urlRef}
        purpose="url"
        size="dialog"
        width="full"
        value={url}
        onValueChange={setUrl}
        onKeyDown={submitOnEnter}
        placeholder="https://"
      />

      <label for="add-url-name" class={labelClass}>
        Name
      </label>
      <TextField
        id="add-url-name"
        purpose="literal"
        size="dialog"
        width="full"
        suffix=".url"
        value={displayName}
        onValueChange={(next) => {
          setNameEdited(true);
          setName(next);
        }}
        onKeyDown={submitOnEnter}
      />

      {error && (
        <p role="alert" class="mt-3 text-[13px] text-error">
          {error}
        </p>
      )}

      <DialogActions class="mt-6 gap-2.5">
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit}>
          Add link
        </Button>
      </DialogActions>
    </Dialog>
  );
}
