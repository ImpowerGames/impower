import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./Popover";

function Body({ title, close }: { title: string; close: () => void }) {
  return (
    <>
      <div class="flex min-h-[52px] items-center justify-between border-b border-edge pl-4 pr-1 text-[15px] font-semibold">
        {title}
        <Button variant="quiet" onClick={close}>
          Close
        </Button>
      </div>
      <p class="p-4 text-sm text-muted">The popover holds whatever its owner puts in it.</p>
    </>
  );
}

function PopoverDemo() {
  const [auto, setAuto] = useState(false);
  const [panel, setPanel] = useState(false);
  return (
    <div class="space-y-6">
      <GalleryRow label="Size auto: as wide as what it holds; press to open">
        <Popover open={auto} onOpenChange={setAuto}>
          <PopoverTrigger asChild>
            <Button>Open popover</Button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start">
            <Body title="Auto" close={() => setAuto(false)} />
          </PopoverContent>
        </Popover>
      </GalleryRow>
      <GalleryRow label="Size panel: 360px, anchored to the bar that holds its trigger">
        <Popover open={panel} onOpenChange={setPanel}>
          <PopoverAnchor asChild>
            <div class="flex h-12 items-center gap-2 rounded-control border border-edge px-2">
              <PopoverTrigger asChild>
                <Button variant="quiet">Writing tools</Button>
              </PopoverTrigger>
            </div>
          </PopoverAnchor>
          <PopoverContent size="panel" side="bottom" align="start">
            <Body title="Panel" close={() => setPanel(false)} />
          </PopoverContent>
        </Popover>
      </GalleryRow>
    </div>
  );
}

export const popoverGallery: GalleryEntry = {
  title: "Popover",
  exports: ["Popover", "PopoverTrigger", "PopoverAnchor", "PopoverContent"],
  Demo: PopoverDemo,
};
