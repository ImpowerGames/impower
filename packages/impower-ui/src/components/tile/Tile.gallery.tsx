import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import FolderCover from "../folder-cover/FolderCover";
import { MoreVerticalIcon } from "../icon/icons.generated";
import { SAMPLE_PICTURE } from "../thumbnail/Thumbnail.gallery";
import Thumbnail from "../thumbnail/Thumbnail";
import VariantsBadge from "../variants-badge/VariantsBadge";
import VirtualList from "../virtual-list/VirtualList";
import Tile, { TILE_GAP, TILE_MIN_WIDTH, tileHeight, type TileShape } from "./Tile";

const SHAPES: TileShape[] = ["landscape", "portrait"];

const ITEMS = Array.from({ length: 200 }, (_, i) => i);

const SELECTION_STATES = [
  { label: "available (hover)", selection: "available", dropTarget: false },
  { label: "selecting", selection: "active", dropTarget: false },
  { label: "selected", selection: "active", dropTarget: false },
  { label: "drop target", selection: "none", dropTarget: true },
] as const;

function SelectionDemo({ shape }: { shape: TileShape }) {
  const [picked, setPicked] = useState<number[]>([2]);
  return (
    <div class="grid grid-cols-4 gap-3">
      {SELECTION_STATES.map((state, index) => (
        <div key={state.label} style={{ height: `${tileHeight(shape, 176)}px` }}>
          <Tile
            shape={shape}
            kind={state.dropTarget ? "folder" : "file"}
            media={state.dropTarget ? <FolderCover sources={[SAMPLE_PICTURE]} /> : <Thumbnail size="fill" src={SAMPLE_PICTURE} />}
            label={state.label}
            description="Modified 2d · 40 kb"
            aria-label={`Open ${state.label}`}
            selection={state.selection}
            selected={picked.includes(index)}
            selectLabel={`Select ${state.label}`}
            onSelectedChange={() => setPicked((now) => (now.includes(index) ? now.filter((i) => i !== index) : [...now, index]))}
            dropTarget={state.dropTarget}
            onClick={() => {}}
          />
        </div>
      ))}
    </div>
  );
}

const menu = (name: string) => (
  <Button variant="quiet" size="icon" aria-label={`Options for ${name}`}>
    <MoreVerticalIcon />
  </Button>
);

function TileDemo() {
  return (
    <div class="space-y-6">
      {SHAPES.map((shape) => (
        <GalleryRow key={shape} label={`${shape}: a folder, a picture, a stacked picture with its badge, the current one with its accent edge and its menu shown`}>
          <div class="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} style={{ height: `${tileHeight(shape, 176)}px` }}>
                <Tile
                  shape={shape}
                  kind={index === 0 ? "folder" : "file"}
                  current={index === 3}
                  media={index === 0 ? <FolderCover sources={[SAMPLE_PICTURE, SAMPLE_PICTURE]} /> : <Thumbnail size="fill" src={SAMPLE_PICTURE} />}
                  badge={index === 2 ? <VariantsBadge count={4} /> : undefined}
                  label={index === 0 ? "Extras" : `picture_${index}`}
                  description={index === 0 ? "2 images" : "Modified 2d · 40 kb"}
                  aria-label={`Open picture_${index}`}
                  actions={menu(`picture_${index}`)}
                  onClick={() => {}}
                />
              </div>
            ))}
          </div>
        </GalleryRow>
      ))}
      {SHAPES.map((shape) => (
        <GalleryRow key={`select-${shape}`} label={`${shape}: the selection mark on hover, while selecting, when selected, and a folder as a drop target`}>
          <SelectionDemo shape={shape} />
        </GalleryRow>
      ))}
      <GalleryRow label="A VirtualList in grid mode, 200 landscape tiles: only the rows in view are mounted">
        <VirtualList
          label="Tiles"
          class="h-80 rounded-card border border-edge p-2"
          items={ITEMS}
          getKey={(item) => String(item)}
          grid={{ minWidth: TILE_MIN_WIDTH.landscape, gap: TILE_GAP, height: (width) => tileHeight("landscape", width) }}
          renderItem={(item) => (
            <Tile
              shape="landscape"
              media={<Thumbnail size="fill" src={SAMPLE_PICTURE} />}
              label={`picture_${item}`}
              description="Modified 2d · 40 kb"
              onClick={() => {}}
            />
          )}
        />
      </GalleryRow>
    </div>
  );
}

export const tileGallery: GalleryEntry = {
  title: "Tile",
  exports: ["Tile", "tileVariants", "tileOpenVariants", "tileActionsVariants", "tileMarkVariants", "tileMediaVariants", "tileLabelVariants", "tileHeight", "TILE_GAP", "TILE_MIN_WIDTH"],
  Demo: TileDemo,
};
