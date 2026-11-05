import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { layoutMinWidths } from "../../layout/breakpoints";
import Button from "../button/Button";
import {
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
  Sheet,
  type DialogSize,
} from "./Dialog";

const SIZE_LABELS: Record<DialogSize, string> = {
  sm: "Small (sm)",
  md: "Medium (md)",
  lg: "Large (lg)",
};

type Demo =
  | { kind: "dialog"; size: DialogSize }
  | { kind: "flush" }
  | { kind: "locked" }
  | { kind: "responsive" }
  | { kind: "sheet" };

function Body({ close }: { close: () => void }) {
  return (
    <>
      <DialogTitle class="mb-2">Replace the file?</DialogTitle>
      <DialogDescription class="mb-5">
        The old file moves to the recycle bin.
      </DialogDescription>
      <DialogActions>
        <Button variant="ghost" class="h-9 px-3 font-normal" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" class="h-9 px-4 font-normal" onClick={close}>
          Replace
        </Button>
      </DialogActions>
    </>
  );
}

function FlushBody({ close }: { close: () => void }) {
  return (
    <>
      <div class="flex flex-row items-center gap-2 px-4 py-3">
        <DialogTitle class="flex-1">Used in 3 places</DialogTitle>
        <Button variant="ghost" class="h-8 px-3 font-normal" onClick={close}>
          Close
        </Button>
      </div>
      <div class="pb-2">
        {["main.sd", "scripts/intro.sd", "scripts/end.sd"].map((name) => (
          <div key={name} class="px-4 py-2 text-sm text-ink/80">
            {name}
          </div>
        ))}
      </div>
    </>
  );
}

function Trigger({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <Button variant="outline" aria-haspopup="dialog" onClick={onOpen}>
      {label}
    </Button>
  );
}

function DialogDemo() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const close = () => setDemo(null);
  const onOpenChange = (open: boolean) => {
    if (!open) {
      close();
    }
  };
  const is = (kind: Demo["kind"], size?: DialogSize) =>
    demo?.kind === kind &&
    (size === undefined || (demo.kind === "dialog" && demo.size === size));

  return (
    <div class="space-y-6">
      <GalleryRow label="Width presets: a centred card with a title, body and actions row; backdrop click and Escape close it">
        <div class="flex flex-wrap gap-3">
          {(Object.keys(SIZE_LABELS) as DialogSize[]).map((size) => (
            <Trigger
              key={size}
              label={SIZE_LABELS[size]}
              onOpen={() => setDemo({ kind: "dialog", size })}
            />
          ))}
        </div>
      </GalleryRow>
      <GalleryRow label="Flush: no padding, for a header and a scrolling list">
        <Trigger label="Flush list" onOpen={() => setDemo({ kind: "flush" })} />
      </GalleryRow>
      <GalleryRow label="dismissable={false}: backdrop click and Escape are ignored; only an action closes it">
        <Trigger
          label="Not dismissable"
          onOpen={() => setDemo({ kind: "locked" })}
        />
      </GalleryRow>
      <GalleryRow
        label={`responsive: a centred card at ${layoutMinWidths.compact}px and wider, a bottom Sheet below (the phone layout)`}
      >
        <Trigger
          label="Responsive"
          onOpen={() => setDemo({ kind: "responsive" })}
        />
      </GalleryRow>
      <GalleryRow label="Sheet: rises from the bottom edge, full width">
        <Trigger label="Sheet" onOpen={() => setDemo({ kind: "sheet" })} />
      </GalleryRow>

      {(Object.keys(SIZE_LABELS) as DialogSize[]).map((size) => (
        <Dialog
          key={size}
          size={size}
          open={is("dialog", size)}
          onOpenChange={onOpenChange}
        >
          <Body close={close} />
        </Dialog>
      ))}
      <Dialog
        size="md"
        flush
        class="max-h-[70vh]"
        open={is("flush")}
        onOpenChange={onOpenChange}
      >
        <FlushBody close={close} />
      </Dialog>
      <Dialog
        dismissable={false}
        open={is("locked")}
        onOpenChange={onOpenChange}
      >
        <Body close={close} />
      </Dialog>
      <Dialog responsive open={is("responsive")} onOpenChange={onOpenChange}>
        <Body close={close} />
      </Dialog>
      <Sheet open={is("sheet")} onOpenChange={onOpenChange}>
        <Body close={close} />
      </Sheet>
    </div>
  );
}

export const dialogGallery: GalleryEntry = {
  title: "Dialog",
  exports: [
    "Dialog",
    "Sheet",
    "DialogTitle",
    "DialogDescription",
    "DialogActions",
  ],
  Demo: DialogDemo,
};
