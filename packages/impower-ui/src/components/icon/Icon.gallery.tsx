import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import * as aliases from "./icons.aliases";
import * as icons from "./icons.generated";

const ICONS = Object.entries(icons) as [string, icons.IconComponent][];

function IconDemo() {
  return (
    <>
    <GalleryRow label="Pin states: pin (hollow, muted) and pin-fill (filled, accent) at identical bounds">
      <div class="flex items-center gap-4" data-testid="pin-states">
        {(["size-4", "size-6"] as const).map((size) => (
          <div key={size} class="flex items-center gap-2 text-xs">
            <icons.PinIcon class={`${size} text-muted`} />
            <icons.PinFillIcon class={`${size} text-accent`} />
            <span>{size}</span>
          </div>
        ))}
      </div>
    </GalleryRow>
    <GalleryRow label={`Every generated icon (${ICONS.length}), drawn in currentColor at size-6`}>
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
        {ICONS.map(([name, Icon]) => (
          <li
            key={name}
            class="flex items-center gap-2 rounded border border-surface-border bg-surface px-2 py-1.5 text-xs"
          >
            <Icon class="size-6 shrink-0" />
            <span class="truncate">{name}</span>
          </li>
        ))}
      </ul>
    </GalleryRow>
    </>
  );
}

export const iconGallery: GalleryEntry = {
  title: "Icons",
  exports: [...ICONS.map(([name]) => name), ...Object.keys(aliases)],
  Demo: IconDemo,
};
