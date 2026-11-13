import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { layoutMinWidths } from "../../layout/breakpoints";
import { useLayout } from "../../hooks/useLayout";
import Button from "../button/Button";
import {
  MoreVerticalIcon,
  PencilIcon,
  TrashIcon,
} from "../icon/icons.generated";
import {
  DropdownCheckboxItem,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownItemText,
  DropdownRadioItem,
  type DropdownRadioItemIndicator,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from "./Dropdown";

function MenuItems() {
  const [wrap, setWrap] = useState(true);
  const [minimap, setMinimap] = useState(false);
  return (
    <>
      <DropdownLabel>
        <div class="text-sm font-semibold">Heading</div>
        <div class="text-xs text-muted">A label above the items, not selectable</div>
      </DropdownLabel>
      <DropdownItem>
        <PencilIcon /> Rename
      </DropdownItem>
      <DropdownItem disabled>
        <TrashIcon /> Delete (disabled)
      </DropdownItem>
      <DropdownSeparator />
      <DropdownCheckboxItem checked={wrap} onCheckedChange={setWrap}>
        Word wrap {wrap ? "(checked)" : "(unchecked)"}
      </DropdownCheckboxItem>
      <DropdownCheckboxItem checked={minimap} onCheckedChange={setMinimap}>
        Minimap {minimap ? "(checked)" : "(unchecked)"}
      </DropdownCheckboxItem>
      <DropdownSeparator />
      <DropdownLabel variant="heading">Heading variant</DropdownLabel>
      <RadioItems indicator="start" />
      <DropdownSeparator />
      <HintedItems />
    </>
  );
}

const RATIO_ROWS = [
  ["auto", "Auto", "fill pane"],
  ["16:9", "16:9", "Landscape"],
  ["1:1", "1:1", "Square"],
  ["9:16", "9:16", "Portrait"],
] as const;

function RadioItems({
  indicator,
  disabled,
}: {
  indicator: DropdownRadioItemIndicator;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<string>("auto");
  return (
    <DropdownRadioGroup
      label="Game aspect ratio"
      value={value}
      onValueChange={setValue}
    >
      {RATIO_ROWS.map(([id, name, hint]) => (
        <DropdownRadioItem
          key={id}
          value={id}
          indicator={indicator}
          disabled={disabled}
        >
          <span>{name}</span>
          <small class="text-xs font-normal text-muted">{hint}</small>
        </DropdownRadioItem>
      ))}
    </DropdownRadioGroup>
  );
}

const FACES = [
  ["happy", "Happy", "Default"],
  ["angry", "Angry", undefined],
  ["sad", "Sad", undefined],
] as const;

function HintedItems() {
  const [value, setValue] = useState<string>("happy");
  return (
    <DropdownRadioGroup label="Face" value={value} onValueChange={setValue}>
      {FACES.map(([id, name, hint]) => (
        <DropdownRadioItem key={id} value={id} indicator="end">
          <DropdownItemText hint={hint}>{name}</DropdownItemText>
        </DropdownRadioItem>
      ))}
    </DropdownRadioGroup>
  );
}

const INDICATORS: Record<DropdownRadioItemIndicator, string> = {
  start: "Radio items with the check at the start (the aspect-ratio menu)",
  end: "Radio items with the check at the end (the viewing-mode menu)",
};

function DropdownDemo() {
  const layout = useLayout();
  const [pinned, setPinned] = useState(() => layout !== "phone");
  return (
    <div class="space-y-6">
      <GalleryRow
        label={`Closed; press to open. Below ${layoutMinWidths.compact}px wide (the phone layout) the menu opens as a bottom sheet.`}
      >
        <DropdownRoot>
          <DropdownTrigger asChild>
            <Button>Open menu</Button>
          </DropdownTrigger>
          <DropdownContent align="start">
            <MenuItems />
          </DropdownContent>
        </DropdownRoot>
      </GalleryRow>
      <GalleryRow label="Icon trigger, content aligned to the end">
        <DropdownRoot>
          <DropdownTrigger asChild>
            <Button variant="quiet" size="icon" aria-label="More options">
              <MoreVerticalIcon />
            </Button>
          </DropdownTrigger>
          <DropdownContent align="end">
            <MenuItems />
          </DropdownContent>
        </DropdownRoot>
      </GalleryRow>
      {(Object.keys(INDICATORS) as DropdownRadioItemIndicator[]).map(
        (indicator) => (
          <GalleryRow key={indicator} label={INDICATORS[indicator]}>
            <DropdownRoot>
              <DropdownTrigger asChild>
                <Button>Choose a ratio</Button>
              </DropdownTrigger>
              <DropdownContent align="start">
                <RadioItems indicator={indicator} />
              </DropdownContent>
            </DropdownRoot>
          </GalleryRow>
        ),
      )}
      <GalleryRow label="Two-line items: a hint beneath the label (the variant menus' Default)">
        <DropdownRoot>
          <DropdownTrigger asChild>
            <Button>Choose a face</Button>
          </DropdownTrigger>
          <DropdownContent align="start" class="min-w-[180px]">
            <HintedItems />
          </DropdownContent>
        </DropdownRoot>
      </GalleryRow>
      <GalleryRow label="Disabled radio items (the aspect-ratio group in Interactive Fiction)">
        <DropdownRoot>
          <DropdownTrigger asChild>
            <Button>Choose a ratio</Button>
          </DropdownTrigger>
          <DropdownContent align="start">
            <RadioItems indicator="start" disabled />
          </DropdownContent>
        </DropdownRoot>
      </GalleryRow>
      <GalleryRow label="Open on load in the menu layout: label, item, disabled item, separator, checked and unchecked checkbox items, radio items, two-line radio items">
        <div class="h-64">
          <DropdownRoot open={pinned} onOpenChange={setPinned} modal={false}>
            <DropdownTrigger asChild>
              <Button>Open on load</Button>
            </DropdownTrigger>
            <DropdownContent align="start" side="bottom">
              <MenuItems />
            </DropdownContent>
          </DropdownRoot>
        </div>
      </GalleryRow>
    </div>
  );
}

export const dropdownGallery: GalleryEntry = {
  title: "Dropdown",
  exports: [
    "DropdownRoot",
    "DropdownTrigger",
    "DropdownSeparator",
    "DropdownContent",
    "DropdownItem",
    "DropdownItemText",
    "DropdownCheckboxItem",
    "DropdownLabel",
    "DropdownRadioGroup",
    "DropdownRadioItem",
    "dropdownRadioItemVariants",
  ],
  Demo: DropdownDemo,
};
