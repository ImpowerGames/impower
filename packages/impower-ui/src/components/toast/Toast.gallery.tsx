import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import Toast from "./Toast";

const MESSAGES = {
  undo: "Moved “Opening scene” to the recycle bin",
  plain: "Saved a copy of the project",
  long: "This browser may clear the project’s files when space runs low. Export a copy to keep one safe.",
  reminder: "9 days since your last backup.",
} as const;

type Shown = keyof typeof MESSAGES | null;

const ACTIONS: Partial<Record<keyof typeof MESSAGES, string>> = {
  undo: "Undo",
  reminder: "Export",
};

function ToastDemo() {
  const [shown, setShownState] = useState<Shown>(null);
  const [last, setLast] = useState<keyof typeof MESSAGES>("undo");
  const setShown = (next: Shown) => {
    if (next) {
      setLast(next);
    }
    setShownState(next);
  };
  const [acted, setActed] = useState(0);
  return (
    <div class="space-y-4">
      <GalleryRow label="Hangs under the title bar; the action fires its callback; the close shows under a fine pointer and a swipe up dismisses on touch; a named dismiss shows on every pointer">
        <div class="flex flex-wrap items-center gap-2">
          <Button onClick={() => setShown("undo")}>With an Undo action</Button>
          <Button onClick={() => setShown("plain")}>Message only</Button>
          <Button onClick={() => setShown("long")}>Long message, wrapping</Button>
          <Button onClick={() => setShown("reminder")}>Named dismiss</Button>
          <span class="text-sm text-muted">Action pressed {acted} times</span>
        </div>
      </GalleryRow>
      <Toast
        open={shown !== null}
        message={MESSAGES[last]}
        wrap={last === "long"}
        actionLabel={ACTIONS[last]}
        dismissLabel={last === "reminder" ? "Remind me later" : undefined}
        onAction={() => {
          setActed((count) => count + 1);
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
