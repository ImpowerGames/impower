import { Button, Pencil } from "@impower/impower-ui/components";
import { createPortal } from "preact/compat";
import { useEffect } from "preact/hooks";
import { useMountTransition } from "../../hooks/useMountTransition";

export type RenameReferencesDialogProps = {
  open: boolean;
  /** Current name (no extension). */
  fromName: string;
  /** Proposed new name (no extension). */
  toName: string;
  /** How many references across how many scripts point at this asset. */
  referenceCount: number;
  scriptCount: number;
  /** Rename AND rewrite every reference. */
  onUpdateAndRename: () => void;
  /** Rename only — leave references pointing at the old name (they break). */
  onRenameOnly: () => void;
  /** Dismiss without renaming. */
  onCancel: () => void;
};

/**
 * Shown after the user commits a new name for an asset that IS referenced by
 * scripts: offers to rewrite those references along with the rename (the
 * default), rename anyway (breaking them), or cancel. Portaled to <body> so the
 * virtualized row beneath can't clip it.
 */
export default function RenameReferencesDialog({
  open,
  fromName,
  toName,
  referenceCount,
  scriptCount,
  onUpdateAndRename,
  onRenameOnly,
  onCancel,
}: RenameReferencesDialogProps) {
  const { mounted, visible } = useMountTransition(open, 200);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const refs = `${referenceCount} reference${referenceCount === 1 ? "" : "s"}`;
  const scripts = `${scriptCount} script${scriptCount === 1 ? "" : "s"}`;

  return createPortal(
    <div
      class={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onClick={onCancel}
      role="presentation"
    >
      <div
        class={`w-full max-w-sm select-none rounded-lg bg-engine-800 p-5 text-foreground shadow-2xl ring-1 ring-foreground/10 transition-all duration-200 ease-out ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Update references"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="mb-3 flex flex-row items-center gap-2">
          <Pencil class="size-5 text-foreground/70" />
          <h2 class="flex-1 text-base font-semibold">Update references?</h2>
        </div>
        <p class="mb-5 text-sm text-foreground/70">
          <span class="font-medium text-foreground">{fromName}</span> is used in{" "}
          {scripts} ({refs}). Rename it to{" "}
          <span class="font-medium text-foreground">{toName}</span> and update{" "}
          {referenceCount === 1 ? "it" : "them"}?
        </p>
        <div class="flex flex-row justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onRenameOnly}
            class="h-9 px-3 text-sm font-normal text-foreground/70 hover:text-foreground"
          >
            Rename only
          </Button>
          <Button
            variant="primary"
            onClick={onUpdateAndRename}
            class="h-9 px-4 text-sm font-normal"
          >
            Update &amp; rename
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
