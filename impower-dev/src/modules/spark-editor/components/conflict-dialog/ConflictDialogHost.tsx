import {
  Button,
  CheckIcon,
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
          class="relative mb-4 flex min-h-11 w-full flex-row items-center gap-2 rounded-control text-left text-sm text-foreground/70 control-overlay"
        >
          <span
            class={`flex size-5 flex-none items-center justify-center rounded border-2 motion-safe:transition-colors ${
              applyAll
                ? "border-accent bg-accent text-accent-ink"
                : "border-foreground/40"
            }`}
          >
            {applyAll && <CheckIcon class="size-3.5" />}
          </span>
          Apply to all {shown.remaining} conflicts
        </button>
      )}

      <DialogActions class="flex-wrap">
        <Button
          variant="quiet"
          onClick={() => choose("skip")}
        >
          Skip
        </Button>
        <Button
          variant="quiet"
          onClick={() => choose("keepboth")}
        >
          Keep both
        </Button>
        <Button
          variant="primary"
          onClick={() => choose("replace")}
        >
          Replace
        </Button>
      </DialogActions>
    </Dialog>
  );
}
