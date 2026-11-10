import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { BookIcon } from "../icon/icons.generated";
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
        icon={<BookIcon class="size-5 flex-none text-accent" />}
        tabs={TABS}
        value={value}
        onValueChange={setValue}
        showTabs={showTabs}
        onBack={() => {}}
      />
    </div>
  );
}

function TabbedPageDemo() {
  return (
    <div class="space-y-6">
      <GalleryRow label="Phone: header with its back action, the page tab row and the chosen tab's body">
        <Demo showTabs />
      </GalleryRow>
      <GalleryRow label="Without tabs: the first tab's body under the header">
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
