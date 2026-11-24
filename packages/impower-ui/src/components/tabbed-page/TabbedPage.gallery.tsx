import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import { CloseIcon } from "../icon/icons.generated";
import TabbedPage from "./TabbedPage";

const TABS = [
  { value: "all", label: "All items", content: <p class="p-4 text-muted">Every item in the project.</p> },
  { value: "here", label: "In this item", content: <p class="p-4 text-muted">The parts of the open item.</p> },
];

function Demo({ showTabs }: { showTabs: boolean }) {
  const [value, setValue] = useState("all");
  return (
    <div class="flex h-64 w-[360px] flex-col rounded border border-surface-border">
      <TabbedPage
        title="Items"
        tabs={TABS}
        value={value}
        onValueChange={setValue}
        showTabs={showTabs}
        tabAction={
          <Button variant="quiet" size="glyph" class="flex-none text-muted" aria-label="Close" title="Close">
            <CloseIcon />
          </Button>
        }
      />
    </div>
  );
}

function TabbedPageDemo() {
  return (
    <div class="space-y-6">
      <GalleryRow label="The page tab row starts the page, its action at the end, then the chosen tab's body">
        <Demo showTabs />
      </GalleryRow>
      <GalleryRow label="Without tabs: the first tab's body starts the page">
        <Demo showTabs={false} />
      </GalleryRow>
    </div>
  );
}

export const tabbedPageGallery: GalleryEntry = {
  title: "TabbedPage",
  exports: ["TabbedPage"],
  Demo: TabbedPageDemo,
};
