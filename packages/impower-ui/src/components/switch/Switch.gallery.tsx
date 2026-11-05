import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Switch, { type SwitchSize } from "./Switch";

const SIZES: Record<SwitchSize, string> = {
  default: "Default",
};

function SwitchDemo() {
  const [on, setOn] = useState(true);
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as SwitchSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]}: off, on, disabled off, disabled on`}>
          <div class="flex items-center gap-6">
            <Switch size={size} aria-label="Off" defaultChecked={false} data-gallery-control />
            <Switch size={size} aria-label="On" defaultChecked data-gallery-control />
            <Switch size={size} aria-label="Disabled off" disabled data-gallery-control />
            <Switch size={size} aria-label="Disabled on" disabled defaultChecked data-gallery-control />
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label="Controlled">
        <label class="flex items-center gap-3 text-sm">
          <Switch checked={on} onCheckedChange={setOn} />
          {on ? "On" : "Off"}
        </label>
      </GalleryRow>
    </div>
  );
}

export const switchGallery: GalleryEntry = {
  title: "Switch",
  exports: ["Switch", "switchVariants"],
  Demo: SwitchDemo,
};
