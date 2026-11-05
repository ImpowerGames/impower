import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { FileIcon } from "../icon/icons.generated";
import ListRow from "../list-row/ListRow";
import VirtualList, { type VirtualListSize } from "./VirtualList";

const ITEMS = Array.from({ length: 1000 }, (_, i) => `script_${i + 1}.sd`);

const SIZES: Record<VirtualListSize, string> = {
  default: "Default rows, 1000 items: only the rows in view are mounted",
  compact: "Compact rows, 1000 items",
};

function VirtualListDemo() {
  return (
    <div class="max-w-xl space-y-6">
      {(Object.keys(SIZES) as VirtualListSize[]).map((size) => (
        <GalleryRow key={size} label={SIZES[size]}>
          <VirtualList
            size={size}
            label={`${size} rows`}
            class="h-64 rounded-card border border-edge"
            items={ITEMS}
            getKey={(item) => item}
            renderItem={(item) => (
              <ListRow
                size={size}
                icon={<FileIcon />}
                label={item}
                description={size === "default" ? "Modified 5m · 2 kB" : undefined}
                onClick={() => {}}
              />
            )}
          />
        </GalleryRow>
      ))}
    </div>
  );
}

export const virtualListGallery: GalleryEntry = {
  title: "VirtualList",
  exports: ["VirtualList"],
  Demo: VirtualListDemo,
};
