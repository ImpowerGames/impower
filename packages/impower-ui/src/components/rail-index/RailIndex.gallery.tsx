import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import RailIndex, { type RailIndexGroup } from "./RailIndex";

const GROUPS: readonly RailIndexGroup[] = [
  {
    id: "gallery-preferences",
    label: "Editor preferences",
    items: [
      { id: "gallery-appearance", label: "Appearance" },
      { id: "gallery-editor", label: "Script editor" },
    ],
  },
  {
    id: "gallery-project",
    label: "Project preferences",
    items: [
      { id: "gallery-metadata", label: "Metadata" },
      { id: "gallery-save", label: "Save & sync" },
    ],
  },
  { id: "gallery-alone", label: "A heading with no sections", items: [] },
];

function RailIndexDemo() {
  const [current, setCurrent] = useState("gallery-editor");
  return (
    <GalleryRow label={`Top and nested rows, marking ${current}; jump to move the mark`}>
      <div class="flex h-80 w-[232px] flex-col border border-solid border-edge bg-bg">
        <RailIndex title="Settings" label="Settings sections" groups={GROUPS} current={current} onJump={setCurrent} />
      </div>
    </GalleryRow>
  );
}

export const railIndexGallery: GalleryEntry = {
  title: "RailIndex",
  exports: ["RailIndex", "railIndexRowVariants", "railIndexJumpVariants"],
  Demo: RailIndexDemo,
};
