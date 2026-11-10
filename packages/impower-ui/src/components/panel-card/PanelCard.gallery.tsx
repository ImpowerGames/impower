import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { ClearIcon, CopyIcon, DownloadIcon } from "../icon/icons.generated";
import {
  PANEL_CARD_HEIGHT,
  PanelCardAction,
  PanelCardHead,
  PanelCardRow,
  type PanelCardRowPart,
} from "./PanelCard";

const PARTS: Record<PanelCardRowPart, string> = {
  body: "body",
  end: "end",
};

function PanelCardDemo() {
  const [open, setOpen] = useState({ script: true, played: false });
  return (
    <div class="max-w-md space-y-4">
      <GalleryRow label={`A head per card (open and folded), body rows (${PARTS.body}) and its ${PARTS.end} row; heads are ${PANEL_CARD_HEIGHT.head}px, ends ${PANEL_CARD_HEIGHT.end}px`}>
        <div>
          <div class="h-[50px]">
            <PanelCardHead
              title="In the script"
              count={{ text: "(2 problems · 1 note)", spoken: "2 problems and 1 note" }}
              open={open.script}
              onOpenChange={(next) => setOpen((current) => ({ ...current, script: next }))}
            />
          </div>
          {open.script ? (
            <>
              <div class="h-11">
                <PanelCardRow part="body">
                  <p class="m-0 px-2 py-3 text-[13px]/[1.5] text-muted">No problems.</p>
                </PanelCardRow>
              </div>
              <div class="h-[15px]">
                <PanelCardRow part="end" />
              </div>
            </>
          ) : null}
          <div class="h-[50px]">
            <PanelCardHead
              title="While playing"
              open={open.played}
              onOpenChange={(next) => setOpen((current) => ({ ...current, played: next }))}
              actions={
                <>
                  <PanelCardAction label="Clear the played messages" icon={<ClearIcon />} onClick={() => {}} disabled />
                  <PanelCardAction label="Copy the played messages" icon={<CopyIcon />} onClick={() => {}} />
                  <PanelCardAction label="Save the played messages as a text file" icon={<DownloadIcon />} onClick={() => {}} />
                </>
              }
            />
          </div>
        </div>
      </GalleryRow>
    </div>
  );
}

export const panelCardGallery: GalleryEntry = {
  title: "PanelCard",
  exports: [
    "PanelCardHead",
    "PanelCardRow",
    "PanelCardAction",
    "panelCardHeadVariants",
    "panelCardRowVariants",
    "PANEL_CARD_HEIGHT",
  ],
  Demo: PanelCardDemo,
};
