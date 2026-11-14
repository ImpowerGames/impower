import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import FolderCover from "../folder-cover/FolderCover";
import { MoreVerticalIcon } from "../icon/icons.generated";
import { SAMPLE_PICTURE } from "../thumbnail/Thumbnail.gallery";
import Thumbnail from "../thumbnail/Thumbnail";
import VariantsBadge from "../variants-badge/VariantsBadge";
import VirtualList from "../virtual-list/VirtualList";
import Tile, { TILE_GAP, TILE_MEDIA_FIT, TILE_MIN_WIDTH, tileHeight, type TileShape } from "./Tile";

const SHAPES: TileShape[] = ["landscape", "portrait"];

const picture = (width: number, height: number, body: string) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );

const TALL_FIGURE = picture(
  60,
  150,
  '<circle cx="30" cy="18" r="14" fill="#c98b5e"/><rect x="12" y="34" width="36" height="58" rx="8" fill="#e8e1cf"/><rect x="14" y="92" width="14" height="58" fill="#5a6f8a"/><rect x="32" y="92" width="14" height="58" fill="#5a6f8a"/>',
);

const VERY_WIDE = picture(
  400,
  100,
  '<rect width="400" height="100" fill="#6b8f4f"/><circle cx="40" cy="50" r="30" fill="#f2c26b"/><circle cx="360" cy="50" r="30" fill="#c0504d"/>',
);

const FIT_SAMPLES = [
  { name: "Lineups", src: VERY_WIDE },
  { name: "wide", src: SAMPLE_PICTURE },
  { name: "tall", src: TALL_FIGURE },
  { name: "very_wide", src: VERY_WIDE },
];

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
        <GalleryRow
          key={`fit-${shape}`}
          label={`${shape}: TILE_MEDIA_FIT with a one-picture folder cover, a wide picture, a tall figure and a very wide picture`}
        >
          <div class="grid grid-cols-4 gap-3">
            {FIT_SAMPLES.map((sample, index) => (
              <div key={sample.name} style={{ height: `${tileHeight(shape, 176)}px` }}>
                <Tile
                  shape={shape}
                  kind={index === 0 ? "folder" : "file"}
                  media={
                    index === 0 ? (
                      <FolderCover fit={TILE_MEDIA_FIT[shape]} sources={[sample.src]} />
                    ) : (
                      <Thumbnail size="fill" fit={TILE_MEDIA_FIT[shape]} src={sample.src} />
                    )
                  }
                  label={sample.name}
                  description={index === 0 ? "1 image" : "Modified 2d · 40 kb"}
                  aria-label={`Open ${sample.name}`}
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
  exports: ["Tile", "tileVariants", "tileOpenVariants", "tileActionsVariants", "tileMarkVariants", "tileMediaVariants", "tileLabelVariants", "tileHeight", "TILE_GAP", "TILE_MEDIA_FIT", "TILE_MIN_WIDTH"],
  Demo: TileDemo,
};
