import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import {
  ChevronIcon,
  FileIcon,
  FolderIcon,
  MoreVerticalIcon,
  PinIcon,
} from "../icon/icons.generated";
import ListRow, { type ListRowSize } from "./ListRow";

const SIZES: Record<ListRowSize, string> = {
  default: "Default: 60px, the Scripts and Assets pages' rows",
  compact: "Compact: 44px",
};

const menu = (
  <Button variant="quiet" size="icon" aria-label="Options" class="text-muted">
    <MoreVerticalIcon />
  </Button>
);

function ListRowDemo() {
  return (
    <div class="max-w-xl space-y-6">
      {(Object.keys(SIZES) as ListRowSize[]).map((size) => (
        <GalleryRow key={size} label={SIZES[size]}>
          <ListRow
            size={size}
            icon={<FileIcon />}
            label="chapter_one.sd"
            description="Modified 5m · 2 kB"
            actions={menu}
            onClick={() => {}}
          />
        </GalleryRow>
      ))}
      <GalleryRow label="Current, with the accent rule at its left edge">
        <ListRow
          current
          icon={<PinIcon />}
          label="Main"
          description="Entry script · 2 kB"
          actions={menu}
          onClick={() => {}}
        />
      </GalleryRow>
      <GalleryRow label="A folder, with a trailing chevron">
        <ListRow
          icon={<FolderIcon />}
          label="Drafts"
          description="3 scripts"
          trailing={<ChevronIcon />}
          actions={menu}
          onClick={() => {}}
        />
      </GalleryRow>
      <GalleryRow label="Not interactive, without a description: a row holding a field">
        <ListRow icon={<FileIcon />} label="A name being typed" />
      </GalleryRow>
    </div>
  );
}

export const listRowGallery: GalleryEntry = {
  title: "ListRow",
  exports: ["ListRow"],
  Demo: ListRowDemo,
};
