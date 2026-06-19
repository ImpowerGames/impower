import { Button, Link, X } from "@impower/impower-ui/components";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";

export type AddUrlDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called with the entered URL + chosen asset name when the user confirms. */
  onSubmit: (url: string, name: string) => void;
};

/**
 * Default asset name from a URL: the last path segment with its extension
 * dropped (`https://cdn/x/hero.png?v=1` -> `hero`). Query/hash are ignored.
 */
const deriveName = (url: string): string => {
  const path = url.split(/[?#]/)[0] ?? "";
  const base = path.split("/").filter(Boolean).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).trim();
};

/**
 * Modal for adding a remote/CDN asset by URL. On confirm it writes a
 * `<name>.url` file whose contents are the URL — the engine resolves `.url`
 * files straight to their remote `src` (see opfs-workspace `updateFileCache`),
 * so the asset renders in-game like a local import. The name auto-fills from the
 * URL until the user edits it. Portaled to <body> so the Assets Router's slide
 * transform doesn't clip the fixed overlay.
 */
export default function AddUrlDialog({
  open,
  onClose,
  onSubmit,
}: AddUrlDialogProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const urlRef = useRef<HTMLInputElement | null>(null);

  // Reset fields and focus the URL input each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setUrl("");
    setName("");
    setNameEdited(false);
    const id = requestAnimationFrame(() => urlRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const trimmedUrl = url.trim();
  const displayName = nameEdited ? name : deriveName(url);
  const canSubmit = !!trimmedUrl;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmedUrl, displayName.trim() || "asset");
    onClose();
  };

  const inputClass =
    "h-9 w-full rounded-md bg-foreground/5 px-3 text-sm text-foreground outline-none placeholder:text-foreground/40 focus:bg-foreground/10";

  return createPortal(
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        class="w-full max-w-sm rounded-lg bg-engine-800 p-5 text-foreground shadow-2xl ring-1 ring-foreground/10"
        role="dialog"
        aria-modal="true"
        aria-label="Add URL"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="mb-4 flex flex-row items-center gap-2">
          <Link class="size-5 text-foreground/70" />
          <h2 class="flex-1 text-base font-semibold">Add URL</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            class="flex size-7 items-center justify-center rounded-full text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
          >
            <X class="size-4" />
          </button>
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

        <div class="flex flex-row justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            class="h-9 px-4 text-sm font-normal text-foreground/70 hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={submit}
            class="h-9 px-4 text-sm font-normal"
          >
            Add
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
