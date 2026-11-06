import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import type { RailIndexGroup } from "../rail-index/RailIndex";
import JumpChips, { type JumpChipSize } from "./JumpChips";

const SIZES: Record<JumpChipSize, string> = {
  default: "Default",
};

const GROUPS: readonly RailIndexGroup[] = [
  {
    id: "chips-preferences",
    label: "Editor preferences",
    items: [
      { id: "chips-appearance", label: "Appearance" },
      { id: "chips-editor", label: "Script editor" },
      { id: "chips-shortcuts", label: "Keyboard shortcuts" },
    ],
  },
  {
    id: "chips-project",
    label: "Project preferences",
    items: [
      { id: "chips-metadata", label: "Metadata" },
      { id: "chips-save", label: "Save & sync" },
    ],
  },
];

function JumpChipsDemo() {
  const [last, setLast] = useState("none yet");
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as JumpChipSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]}, scrolling sideways at 360px; last jump: ${last}`}>
          <div class="w-[360px] max-w-full">
            <JumpChips size={size} label="Settings sections" groups={GROUPS} onJump={setLast} />
          </div>
        </GalleryRow>
      ))}
    </div>
  );
}

export const jumpChipsGallery: GalleryEntry = {
  title: "JumpChips",
  exports: ["JumpChips", "jumpChipVariants"],
  Demo: JumpChipsDemo,
};
