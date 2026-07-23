import { Button, ChevronRight, Search, X } from "@impower/impower-ui/components";
import { createPortal } from "preact/compat";
import { useEffect } from "preact/hooks";
import { useMountTransition } from "../../hooks/useMountTransition";

export type UsageLocation = {
  uri: string;
  /** Display path of the referencing script (e.g. `scripts/intro.sd`). */
  label: string;
  /** 1-based line number. */
  line: number;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
};

export type FileUsagesPanelProps = {
  open: boolean;
  /** The asset whose usages are listed. */
  assetName: string;
  locations: UsageLocation[];
  /** Open the script at the usage and select the range. */
  onJump: (
    uri: string,
    range: UsageLocation["range"],
  ) => void;
  onClose: () => void;
};

/**
 * "Used in (N)" — lists every script location that references an asset, each a
 * tappable row that jumps to the editor at that spot. Portaled modal so the
 * virtualized list beneath can't clip it.
 */
export default function FileUsagesPanel({
  open,
  assetName,
  locations,
  onJump,
  onClose,
}: FileUsagesPanelProps) {
  const { mounted, visible } = useMountTransition(open, 200);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const count = locations.length;

  return createPortal(
    <div
      class={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        class={`flex max-h-[70vh] w-full max-w-md select-none flex-col overflow-hidden rounded-lg bg-engine-800 text-foreground shadow-2xl ring-1 ring-foreground/10 transition-all duration-200 ease-out ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Usages"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex flex-none flex-row items-center gap-2 px-4 py-3">
          <Search class="size-5 flex-none text-foreground/70" />
          <h2 class="min-w-0 flex-1 truncate text-base font-semibold">
            {count === 0
              ? "No usages"
              : `Used in ${count} place${count === 1 ? "" : "s"}`}
          </h2>
          <Button
            variant="ghost"
            aria-label="Close"
            onClick={onClose}
            class="size-7 flex-none rounded-full p-0 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
          >
            <X class="size-4" />
          </Button>
        </div>
        {count === 0 ? (
          <div class="px-4 pb-5 text-sm text-foreground/60">
            Nothing references{" "}
            <span class="font-medium text-foreground">{assetName}</span> yet.
          </div>
        ) : (
          <div class="min-h-0 flex-1 overflow-y-auto pb-2">
            {locations.map((loc) => (
              <Button
                key={`${loc.uri}:${loc.line}:${loc.range.start.character}`}
                variant="ghost"
                onClick={() => {
                  onJump(loc.uri, loc.range);
                  onClose();
                }}
                class="h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-left font-normal"
              >
                <span class="min-w-0 flex-1 truncate text-sm text-foreground/80">
                  {loc.label}
                </span>
                <span class="flex-none text-xs tabular-nums text-foreground/40">
                  :{loc.line}
                </span>
                <ChevronRight class="size-4 flex-none text-foreground/30" />
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
