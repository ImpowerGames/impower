import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import ActionSheet, { type ActionSheetItem } from "./ActionSheet";

type Demo = "edit";

function ActionSheetDemo() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const close = () => setDemo(null);
  const item = (label: string, extra: Partial<ActionSheetItem> = {}) =>
    ({ label, onSelect: close, ...extra }) as ActionSheetItem;

  return (
    <div class="space-y-6">
      <GalleryRow label="Items, a disabled item and separators: the editor's context menu on a coarse pointer">
        <Button aria-haspopup="menu" onClick={() => setDemo("edit")}>
          Edit actions
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
    </div>
  );
}

export const actionSheetGallery: GalleryEntry = {
  title: "ActionSheet",
  exports: ["ActionSheet"],
  Demo: ActionSheetDemo,
};
