import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import {
  ChevronIcon,
  ErrorIcon,
  FileIcon,
  FolderIcon,
  MoreVerticalIcon,
  PinIcon,
  SceneIcon,
  WarningIcon,
} from "../icon/icons.generated";
import { useState } from "preact/hooks";
import ListRow, { ListRowBadge, type ListRowSize } from "./ListRow";

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
      <GalleryRow label="A badge in the glyph's place, its own button (the Outline's problem badge), in each size, beside a row with its glyph">
        <div class="w-[300px] space-y-1">
          {(Object.keys(SIZES) as ListRowSize[]).map((size) => (
            <ListRow
              key={size}
              size={size}
              leading={
                <ListRowBadge
                  size={size}
                  label="2 errors in the_rumour"
                  icon={<ErrorIcon class="text-error" />}
                  onClick={() => {}}
                />
              }
              label="the_rumour"
              onClick={() => {}}
            />
          ))}
          <ListRow
            size="compact"
            tone="muted"
            leading={
              <ListRowBadge
                size="compact"
                label="1 warning in notebook"
                icon={<WarningIcon class="text-warning" />}
                onClick={() => {}}
              />
            }
            label="notebook"
            onClick={() => {}}
          />
          <ListRow size="compact" tone="muted" icon={<SceneIcon />} label="meet_downtown" onClick={() => {}} />
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
      <GalleryRow label="A long description wrapping instead of fading, in a narrow cell">
        <div class="w-44">
          <ListRow
            descriptionFit="wrap"
            icon={<FileIcon />}
            label="subway"
            description="That name is already in use in this folder."
          />
        </div>
      </GalleryRow>
      <GalleryRow label="Not interactive, without a description: a row holding a field">
        <ListRow icon={<FileIcon />} label="A name being typed" />
      </GalleryRow>
      <SelectionDemo />
    </div>
  );
}

function SelectionDemo() {
  const [picked, setPicked] = useState<string[]>(["chapter_two.sd"]);
  const toggle = (name: string) =>
    setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]));
  return (
    <>
      {(Object.keys(SIZES) as ListRowSize[]).map((size) => (
        <GalleryRow
          key={size}
          label={`Selection available, ${size}: on a pointer that hovers, the mark takes the icon's place under the pointer`}
        >
          <ListRow
            size={size}
            selection="available"
            selectLabel="Select chapter_one.sd"
            icon={<FileIcon />}
            label="chapter_one.sd"
            description="Modified 5m · 2 kB"
            actions={menu}
            onClick={() => {}}
          />
        </GalleryRow>
      ))}
      <GalleryRow label="Selecting: every row shows its mark in its icon's place, picked rows tinted">
        <div class="space-y-0">
          {["chapter_one.sd", "chapter_two.sd"].map((name) => (
            <ListRow
              key={name}
              selection="active"
              selected={picked.includes(name)}
              selectLabel={`Select ${name}`}
              onSelectedChange={() => toggle(name)}
              icon={<FileIcon />}
              label={name}
              description="Modified 5m · 2 kB"
              actions={menu}
              onClick={() => toggle(name)}
            />
          ))}
        </div>
      </GalleryRow>
      <GalleryRow label="A drop target: a folder row with a dragged row over it">
        <ListRow
          dropTarget
          icon={<FolderIcon />}
          label="Drafts"
          description="3 scripts"
          trailing={<ChevronIcon />}
          actions={menu}
          onClick={() => {}}
        />
      </GalleryRow>
    </>
  );
}

export const listRowGallery: GalleryEntry = {
  title: "ListRow",
  exports: ["ListRow", "ListRowBadge"],
  Demo: ListRowDemo,
};
