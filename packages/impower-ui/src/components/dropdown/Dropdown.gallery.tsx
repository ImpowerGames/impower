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
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from "./Dropdown";

function MenuItems() {
  const [wrap, setWrap] = useState(true);
  const [minimap, setMinimap] = useState(false);
  return (
    <>
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
    </>
  );
}

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
      <GalleryRow label="Open on load in the menu layout: item, disabled item, separator, checked and unchecked checkbox items">
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
    "DropdownCheckboxItem",
  ],
  Demo: DropdownDemo,
};
