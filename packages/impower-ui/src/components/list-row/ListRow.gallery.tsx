import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import {
  ChevronIcon,
  FileIcon,
  FolderIcon,
  MoreVerticalIcon,
  PinIcon,
  SceneIcon,
} from "../icon/icons.generated";
import { useState } from "preact/hooks";
import PlayButton from "../play-button/PlayButton";
import Thumbnail from "../thumbnail/Thumbnail";
import { SAMPLE_PICTURE } from "../thumbnail/Thumbnail.gallery";
import ListRow, { ListRowBadge, type ListRowSize } from "./ListRow";

const SIZES: Record<ListRowSize, string> = {
  default: "Default: 60px with a 21px glyph",
  library: "Library: the Scripts and Assets pages' rows, 62px with an 8px inset and 10px gap below desktop, 60px with 12px and 13px on desktop",
  compact: "Compact: 44px",
  block: "Block: 64px with a 12px help line, the Add panel's rows",
  dense: "Dense: 52px with an 18px glyph, the asset inspector's uses list, its gap 10px below desktop",
  file: "File: 52px with an 18px glyph in a 28px column and 13px names, the asset inspector's Files list",
  outline: "Outline: 48px with a 17px glyph and 13px labels below desktop, 14px on desktop, the Scripts page's In this script rows",
  rail: "Rail: 44px with a 17px glyph and 12px labels, the docked Outline rail's rows",
};

const menu = (
  <Button variant="quiet" size="icon" glyph="md" aria-label="Options" class="text-muted">
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
      <GalleryRow label="Indented as a whole row (the Outline rail): rail rows at depths 0, 1 and 2 with the accent highlight, each nested row moved 18px with a 1px guide at its left edge that crosses the 2px gap to the next row of its group; the current nested row's border in the accent, its label and glyph and those of the rows containing it in the accent">
        <div class="flex w-[231px] flex-col gap-0.5 pr-3.5 pl-[26px] *:h-11">
          <ListRow size="rail" indent="row" tone="muted" highlight="accent" containsCurrent after={{ depth: 1, space: 2 }} icon={<SceneIcon />} label="the_rumour" onClick={() => {}} />
          <ListRow size="rail" indent="row" tone="muted" highlight="accent" depth={1} containsCurrent after={{ depth: 2, space: 2 }} icon={<FileIcon />} label="What should Imani bring?" onClick={() => {}} />
          <ListRow size="rail" indent="row" tone="muted" highlight="accent" depth={2} current="location" after={{ depth: 2, space: 2 }} icon={<FileIcon />} label="notebook" onClick={() => {}} />
          <ListRow size="rail" indent="row" tone="muted" highlight="accent" depth={2} icon={<FileIcon />} label="snacks" onClick={() => {}} />
        </div>
      </GalleryRow>
      <GalleryRow label="A gutter badge left of the rows (the Outline rail's problem badge): one column whatever the depth, 26px or 22px in the compact layout, with a 14px mark, 44px wide under a coarse pointer; an error, a warning and a note beside a row without one, every glyph and label in its place">
        <div class="w-[231px] pr-3.5 pl-(--list-row-gutter) [:root[data-pointer=coarse]_&]:pl-11">
          {(["error", "warning", "note"] as const).map((severity, depth) => (
            <ListRow
              key={severity}
              size="rail"
              indent="row"
              tone="muted"
              depth={depth}
              gutter={
                <ListRowBadge
                  placement="gutter"
                  label={`1 ${severity} in the_rumour`}
                  severity={severity}
                  onClick={() => {}}
                />
              }
              icon={<SceneIcon />}
              label="the_rumour"
              onClick={() => {}}
            />
          ))}
          <ListRow size="rail" indent="row" tone="muted" depth={1} icon={<FileIcon />} label="meet_downtown" onClick={() => {}} />
        </div>
      </GalleryRow>
      <GalleryRow label="A trailing badge before the row's menu (the Scripts page's problem badge): a 44px target with a 14px mark, an error, a warning and a note, beside a row without one; the label and the menu keep their places">
        <div class="w-[360px] space-y-1">
          {(["error", "warning", "note"] as const).map((severity) => (
            <ListRow
              key={severity}
              size="library"
              icon={<FileIcon />}
              label={severity === "error" ? "chapter_2.sd" : severity === "note" ? "epilogue.sd" : "chapter_1_with_a_long_name_that_truncates.sd"}
              description="Modified just now · 48 B"
              actions={
                <>
                  <ListRowBadge
                    placement="trailing"
                    severity={severity}
                    label={`1 ${severity} in chapter`}
                    onClick={() => {}}
                  />
                  {menu}
                </>
              }
              onClick={() => {}}
            />
          ))}
          <ListRow size="library" icon={<FileIcon />} label="main.sd" description="Modified just now · 48 B" actions={menu} onClick={() => {}} />
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
      <GalleryRow label="Long labels in a narrow cell: a string and a plain node both end in the row's fade; a node passed with overflow self claims it clips its own content (here its own ellipsis), so a self node that does not clip is the caller's defect">
        <div class="grid w-full grid-cols-3 gap-2">
          <ListRow
            icon={<FileIcon />}
            label="backdrop_with_a_very_long_descriptive_name_01"
            onClick={() => {}}
          />
          <ListRow
            icon={<FileIcon />}
            label={<strong class="block font-semibold">backdrop_with_a_very_long_descriptive_name_01</strong>}
            onClick={() => {}}
          />
          <ListRow
            icon={<FileIcon />}
            overflow="self"
            label={<span class="block truncate">backdrop_with_a_very_long_descriptive_name_01</span>}
            onClick={() => {}}
          />
        </div>
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
      <GalleryRow label="A control before the row's button (an audio row's Play), then the same rows while selecting, the mark in the control's place">
        <div class="space-y-0">
          {(["available", "active"] as const).map((selection) => (
            <ListRow
              key={selection}
              size="library"
              control={<PlayButton name="door_knock" playing={selection === "available"} />}
              selection={selection}
              selected={false}
              selectLabel="Select door_knock"
              onSelectedChange={() => {}}
              label="door_knock"
              description={selection === "available" ? "0:02 / 0:05" : "Modified 5m · 48 kB"}
              actions={menu}
              onClick={() => {}}
            />
          ))}
        </div>
      </GalleryRow>
      <PressedDemo />
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

function PressedDemo() {
  const [pressed, setPressed] = useState<string | null>("ava~face.happy.png");
  return (
    <GalleryRow label="Pressed, one row at a time (the asset inspector's Files list soloing a layer): a toggle button tinted with the accent rule, its thumbnail on the stage surface at the dense row's height; press a row again to release it">
      <div class="space-y-0">
        {(
          [
            ["ava.png", "Base · 80 kB"],
            ["ava~face.happy.png", "Layer · face.happy · 22 kB"],
          ] as const
        ).map(([name, description]) => (
          <div key={name} class="h-14">
            <ListRow
              size="dense"
              pressed={pressed === name}
              aria-label={`Show ${name} alone`}
              icon={<Thumbnail surface="stage" fit="contain" src={SAMPLE_PICTURE} />}
              label={name}
              description={description}
              actions={menu}
              onClick={() => setPressed((p) => (p === name ? null : name))}
            />
          </div>
        ))}
      </div>
    </GalleryRow>
  );
}

export const listRowGallery: GalleryEntry = {
  title: "ListRow",
  exports: ["ListRow", "ListRowBadge"],
  Demo: ListRowDemo,
};
