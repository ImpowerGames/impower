import {
  Button,
  ChevronRight,
  Dialog,
  DialogTitle,
  Search,
  X,
} from "@impower/impower-ui/components";

export type UsageLocation = {
  uri: string;
  label: string;
  line: number;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
};

export type FileUsagesPanelProps = {
  open: boolean;
  returnFocus?: () => HTMLElement | null;
  assetName: string;
  locations: UsageLocation[];
  onJump: (uri: string, range: UsageLocation["range"]) => void;
  onClose: () => void;
};

export default function FileUsagesPanel({
  open,
  returnFocus,
  assetName,
  locations,
  onJump,
  onClose,
}: FileUsagesPanelProps) {
  const count = locations.length;

  return (
    <Dialog
      open={open}
      returnFocus={returnFocus}
      onOpenChange={(next) => !next && onClose()}
      size="md"
      flush
      class="max-h-[70vh]"
    >
      <div class="flex flex-none flex-row items-center gap-2 px-4 py-3">
        <Search class="size-5 flex-none text-foreground/70" />
        <DialogTitle class="min-w-0 flex-1 truncate">
          {count === 0
            ? "No usages"
            : `Used in ${count} place${count === 1 ? "" : "s"}`}
        </DialogTitle>
        <Button
          variant="ghost"
          aria-label="Close"
          onClick={onClose}
          class="size-7 flex-none rounded-full p-0 text-foreground/60 hover:text-foreground"
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
    </Dialog>
  );
}
