import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import { Dialog, DialogActions, DialogTitle } from "../dialog/Dialog";
import Toast from "./Toast";

const MESSAGES = {
  undo: "Moved “Opening scene” to the recycle bin",
  plain: "Saved a copy of the project",
  long: "This browser may clear the project’s files when space runs low. Export a copy to keep one safe.",
} as const;

type Shown = keyof typeof MESSAGES | null;

function ToastOverDialog() {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const [name, setName] = useState("alcie");
  return (
    <GalleryRow label="Over a dialog: the toast mounts inside the open dialog, so Tab reaches Undo within its focus scope; it returns to the page when the dialog closes">
      <div class="flex flex-wrap items-center gap-2">
        <Button aria-haspopup="dialog" onClick={() => setOpen(true)}>
          Open a dialog with a fix
        </Button>
        <span class="text-sm text-muted">Portrait: {name}</span>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTitle>Problems to fix</DialogTitle>
        <p class="my-3 text-sm">Cannot find image named {name}</p>
        <DialogActions>
          <Button
            disabled={name === "alice"}
            onClick={() => {
              setName("alice");
              setToast(true);
            }}
          >
            Use alice instead
          </Button>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Toast
        open={toast}
        message="Changed to alice."
        actionLabel="Undo"
        onAction={() => {
          setName("alcie");
          setToast(false);
        }}
        onDismiss={() => setToast(false)}
      />
    </GalleryRow>
  );
}

function ToastDemo() {
  const [shown, setShownState] = useState<Shown>(null);
  const [last, setLast] = useState<keyof typeof MESSAGES>("undo");
  const setShown = (next: Shown) => {
    if (next) {
      setLast(next);
    }
    setShownState(next);
  };
  const [undone, setUndone] = useState(0);
  return (
    <div class="space-y-4">
      <GalleryRow label="Hangs under the title bar; Undo fires its action; the close shows under a fine pointer and a swipe up dismisses on touch">
        <div class="flex flex-wrap items-center gap-2">
          <Button onClick={() => setShown("undo")}>With an Undo action</Button>
          <Button onClick={() => setShown("plain")}>Message only</Button>
          <Button onClick={() => setShown("long")}>Long message, wrapping</Button>
          <span class="text-sm text-muted">Undone {undone} times</span>
        </div>
      </GalleryRow>
      <Toast
        open={shown !== null}
        message={MESSAGES[last]}
        wrap={last === "long"}
        actionLabel={last === "undo" ? "Undo" : undefined}
        onAction={() => {
          setUndone((count) => count + 1);
          setShown(null);
        }}
        onDismiss={() => setShown(null)}
      />
      <ToastOverDialog />
    </div>
  );
}

export const toastGallery: GalleryEntry = {
  title: "Toast",
  exports: ["Toast", "toastVariants"],
  Demo: ToastDemo,
};
