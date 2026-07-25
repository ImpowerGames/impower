import { Button, Check } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { useMountTransition } from "../../hooks/useMountTransition";
import {
  conflictRequest,
  type ConflictAction,
  type ConflictRequest,
} from "../../utils/uploadConflicts";

/**
 * Global host for the upload "file already exists" prompt. Reads the
 * `conflictRequest` signal (set by resolveUploadConflicts mid-upload), shows a
 * Replace / Keep both / Skip choice with an optional "apply to all", and
 * resolves the awaiting promise. Portaled to <body>; mounted once in SparkEditor.
 */
export default function ConflictDialogHost() {
  const req = useComputed(() => conflictRequest.value).value;
  const [shown, setShown] = useState<ConflictRequest | null>(req);
  const [applyAll, setApplyAll] = useState(false);
  // Synchronous latch so a double-click can't resolve the same prompt twice.
  const busyRef = useRef(false);

  useEffect(() => {
    if (req) {
      setShown(req);
      setApplyAll(false);
      busyRef.current = false;
    }
  }, [req]);

  const { mounted, visible } = useMountTransition(!!req, 200);

  const choose = (action: ConflictAction) => {
    if (busyRef.current || !shown) return;
    busyRef.current = true;
    shown.resolve({ action, applyToAll: applyAll });
    conflictRequest.value = null;
  };

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape = Skip (the safe, non-destructive default).
      if (e.key === "Escape") choose("skip");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req, applyAll]);

  if (!mounted || !shown || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      class={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onClick={() => choose("skip")}
      role="presentation"
    >
      <div
        class={`w-full max-w-sm select-none rounded-lg bg-engine-800 p-5 text-foreground shadow-2xl ring-1 ring-foreground/10 transition-all duration-200 ease-out ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="File already exists"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="mb-2 text-base font-semibold">File already exists</h2>
        <p class="mb-4 text-sm text-foreground/70">
          <span class="font-medium text-foreground">{shown.name}</span> already
          exists{shown.location ? ` in ${shown.location}` : ""}. Replace it
          (the old file moves to the recycle bin), keep both, or skip it?
        </p>

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

        <div class="flex flex-row flex-wrap justify-end gap-2">
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
