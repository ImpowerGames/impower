import {
  Button,
  Check,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  conflictRequest,
  type ConflictAction,
  type ConflictRequest,
} from "../../utils/uploadConflicts";

export default function ConflictDialogHost() {
  const req = useComputed(() => conflictRequest.value).value;
  const [shown, setShown] = useState<ConflictRequest | null>(req);
  const [applyAll, setApplyAll] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (req) {
      setShown(req);
      setApplyAll(false);
      busyRef.current = false;
    }
  }, [req]);

  const choose = (action: ConflictAction) => {
    if (busyRef.current || !shown) return;
    busyRef.current = true;
    shown.resolve({ action, applyToAll: applyAll });
    conflictRequest.value = null;
  };

  if (!shown) {
    return null;
  }

  return (
    <Dialog open={!!req} onOpenChange={(next) => !next && choose("skip")}>
      <DialogTitle class="mb-2">File already exists</DialogTitle>
      <DialogDescription class="mb-4">
        <span class="font-medium text-foreground">{shown.name}</span> already
        exists{shown.location ? ` in ${shown.location}` : ""}. Replace it (the
        old file moves to the recycle bin), keep both, or skip it?
      </DialogDescription>

      {shown.remaining > 1 && (
        <button
          type="button"
          onClick={() => setApplyAll((v) => !v)}
          class="mb-4 flex w-full flex-row items-center gap-2 text-left text-sm text-foreground/70 hover:text-foreground"
        >
          <span
            class={`flex size-5 flex-none items-center justify-center rounded border-2 transition-colors ${
              applyAll
                ? "border-primary bg-primary text-white"
                : "border-foreground/40"
            }`}
          >
            {applyAll && <Check class="size-3.5" />}
          </span>
          Apply to all {shown.remaining} conflicts
        </button>
      )}

      <DialogActions class="flex-wrap">
        <Button
          variant="ghost"
          onClick={() => choose("skip")}
          class="h-9 px-3 text-sm font-normal text-foreground/70 hover:text-foreground"
        >
          Skip
        </Button>
        <Button
          variant="ghost"
          onClick={() => choose("keepboth")}
          class="h-9 px-3 text-sm font-normal"
        >
          Keep both
        </Button>
        <Button
          variant="primary"
          onClick={() => choose("replace")}
          class="h-9 px-4 text-sm font-normal"
        >
          Replace
        </Button>
      </DialogActions>
    </Dialog>
  );
}
