import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import { FileIcon } from "../icon/icons.generated";
import ListRow from "../list-row/ListRow";
import VirtualList, { type VirtualListSize } from "./VirtualList";

const ITEMS = Array.from({ length: 1000 }, (_, i) => `script_${i + 1}.sd`);

const SIZES: Record<VirtualListSize, string> = {
  default: "Default rows, 1000 items: only the rows in view are mounted",
  compact: "Compact rows, 1000 items",
};

function VirtualListDemo() {
  const [reveal, setReveal] = useState<number | undefined>(undefined);
  const [request, setRequest] = useState(0);
  return (
    <div class="max-w-xl space-y-6">
      <GalleryRow label="revealIndex scrolls a row into view, and each new revealRequest scrolls to it again: press to reveal row 500, scroll away and press again">
        <div class="space-y-2">
          <Button
            onClick={() => {
              setReveal(499);
              setRequest((current) => current + 1);
            }}
          >
            Reveal script_500.sd
          </Button>
          <VirtualList
            size="compact"
            label="Reveal demo"
            class="h-40 rounded-card border border-edge"
            items={ITEMS}
            revealIndex={reveal}
            revealRequest={request}
            getKey={(item) => item}
            renderItem={(item, index) => (
              <ListRow size="compact" current={index === reveal ? "location" : false} icon={<FileIcon />} label={item} onClick={() => {}} />
            )}
          />
        </div>
      </GalleryRow>
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
