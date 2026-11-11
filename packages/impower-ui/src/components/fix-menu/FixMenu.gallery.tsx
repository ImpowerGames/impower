import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import FixMenu, { type FixMenuSize } from "./FixMenu";

const ONE = [{ name: "Remove the note" }];

const SEVERAL = [
  { name: "Use alice instead" },
  { name: "Use alicia instead" },
];

const SIZES: Record<FixMenuSize, string> = {
  default: "Default: a 44px button, the dialog and the popover",
  compact: "Compact: the Button compact size, as a panel row sets it",
};

function FixMenuDemo() {
  const [chosen, setChosen] = useState("Nothing chosen yet");
  const choose = (action: { name: string }) => setChosen(action.name);
  return (
    <div class="space-y-6">
      {(Object.keys(SIZES) as FixMenuSize[]).map((size) => (
        <GalleryRow key={size} label={SIZES[size]}>
          <div class="flex items-center gap-3">
            <FixMenu size={size} actions={ONE} onChoose={choose} />
            <FixMenu size={size} actions={SEVERAL} onChoose={choose} />
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label="Busy: a chosen fix still opening its script; it keeps focus and ignores another press">
        <div class="flex items-center gap-3">
          <FixMenu busy actions={ONE} onChoose={choose} />
          <FixMenu busy actions={SEVERAL} onChoose={choose} />
        </div>
      </GalleryRow>
      <GalleryRow label="No actions: draws nothing">
        <FixMenu actions={[]} onChoose={choose} />
      </GalleryRow>
      <p class="text-sm text-muted">{chosen}</p>
    </div>
  );
}

export const fixMenuGallery: GalleryEntry = {
  title: "FixMenu",
  exports: ["FixMenu", "FIX_MENU_LABEL"],
  Demo: FixMenuDemo,
};
