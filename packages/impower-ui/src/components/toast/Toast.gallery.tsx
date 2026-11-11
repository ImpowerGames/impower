import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import Toast from "./Toast";

const MESSAGES = {
  undo: "Moved “Opening scene” to the recycle bin",
  plain: "Saved a copy of the project",
  long: "This browser may clear the project’s files when space runs low. Export a copy to keep one safe.",
} as const;

type Shown = keyof typeof MESSAGES | null;

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
    </div>
  );
}

export const toastGallery: GalleryEntry = {
  title: "Toast",
  exports: ["Toast", "toastVariants"],
  Demo: ToastDemo,
};
