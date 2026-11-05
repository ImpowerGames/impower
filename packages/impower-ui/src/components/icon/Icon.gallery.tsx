import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import * as aliases from "./icons.aliases";
import * as icons from "./icons.generated";

const ICONS = Object.entries(icons) as [string, icons.IconComponent][];

function IconDemo() {
  return (
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
  );
}

export const iconGallery: GalleryEntry = {
  title: "Icons",
  exports: [...ICONS.map(([name]) => name), ...Object.keys(aliases)],
  Demo: IconDemo,
};
