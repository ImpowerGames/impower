import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import ActionSheet, { type ActionSheetItem } from "./ActionSheet";

type Demo = "edit" | "tones";

function ActionSheetDemo() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const close = () => setDemo(null);
  const item = (label: string, extra: Partial<ActionSheetItem> = {}) =>
    ({ label, onSelect: close, ...extra }) as ActionSheetItem;

  return (
    <div class="space-y-6">
      <GalleryRow label="Default tone, a disabled item and separators: the editor's context menu on a coarse pointer">
        <Button aria-haspopup="menu" onClick={() => setDemo("edit")}>
          Edit actions
        </Button>
      </GalleryRow>
      <GalleryRow label="tone: default and destructive">
        <Button aria-haspopup="menu" onClick={() => setDemo("tones")}>
          Tones
        </Button>
      </GalleryRow>
      <ActionSheet
        open={demo === "edit"}
        onOpenChange={(open) => !open && close()}
        title="Edit"
        items={[
          item("Cut", { disabled: true }),
          item("Copy", { disabled: true }),
          item("Paste"),
          item("Select all"),
          { type: "separator" },
          item("Rename"),
          item("Find references"),
          item("Go to definition"),
        ]}
      />
      <ActionSheet
        open={demo === "tones"}
        onOpenChange={(open) => !open && close()}
        title="Script"
        items={[item("Duplicate"), item("Delete", { tone: "destructive" })]}
      />
    </div>
  );
}

export const actionSheetGallery: GalleryEntry = {
  title: "ActionSheet",
  exports: ["ActionSheet"],
  Demo: ActionSheetDemo,
};
