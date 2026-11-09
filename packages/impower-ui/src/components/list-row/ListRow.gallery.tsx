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
  block: "Block: 64px with a 12px help line, the Add panel's rows",
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
      <GalleryRow label="Nested, muted tone (the Outline): compact rows at depths 1 and 2 with their guide lines; labels muted, the ancestor that contains the current row in the accent, the current nested row in ink with its guide segment in the accent, read as the location">
        <div class="space-y-0">
          <ListRow size="compact" tone="muted" containsCurrent icon={<FolderIcon />} label="the_rumour" onClick={() => {}} />
          <ListRow size="compact" tone="muted" depth={1} containsCurrent icon={<FileIcon />} label="What should Imani bring?" onClick={() => {}} />
          <ListRow size="compact" tone="muted" depth={2} current="location" icon={<FileIcon />} label="notebook" onClick={() => {}} />
          <ListRow size="compact" tone="muted" depth={2} icon={<FileIcon />} label="snacks" onClick={() => {}} />
        </div>
      </GalleryRow>
      <GalleryRow label="A long label clamped to two lines instead of fading">
        <ListRow
          size="compact"
          overflow="clamp"
          icon={<FileIcon />}
          label="Choose: what should Imani bring to the meeting downtown, the notebook or the snacks, before the others arrive?"
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
