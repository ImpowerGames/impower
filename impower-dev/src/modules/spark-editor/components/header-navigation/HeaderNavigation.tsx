import {
  ArrowBackUp,
  ArrowForwardUp,
  Button,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import HeaderMenuButton from "../header-menu-button/HeaderMenuButton";
import { SyncButton } from "../drive-sync";
import HeaderTitleButton from "../header-title-button/HeaderTitleButton";
import HeaderTitleCaption from "../header-title-caption/HeaderTitleCaption";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import PreviewToggleButton from "../preview-toggle-button/PreviewToggleButton";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");

function replayUndoShortcut(isRedo: boolean): void {
  let el: Element | null = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  const redoByY = isRedo && !IS_MAC;
  const init: KeyboardEventInit = {
    key: redoByY ? "y" : "z",
    code: redoByY ? "KeyY" : "KeyZ",
    shiftKey: isRedo && IS_MAC,
    metaKey: IS_MAC,
    ctrlKey: !IS_MAC,
    bubbles: true,
    composed: true,
    cancelable: true,
  };
  (el ?? document.body).dispatchEvent(new KeyboardEvent("keydown", init));
}

export default function HeaderNavigation() {
  const layout = useLayout();
  const phone = layout === "phone";
  return (
    <div class="relative z-10">
      <div class="relative z-[2] flex h-14 flex-row items-center justify-center bg-bg">
        <div class="flex w-full flex-row items-center">
          <HeaderMenuButton />
          <div class="flex flex-1 flex-col items-start">
            <HeaderTitleButton />
            <HeaderTitleCaption />
          </div>
          <SyncButton />

          {layout !== "desktop" && (
            <div class="flex flex-row items-center">
              <Button
                variant="quiet"
                size="icon"
                aria-label="Undo"
                onPointerDown={(e) => {
                  e.preventDefault();
                  replayUndoShortcut(false);
                }}
                class="text-muted"
              >
                <ArrowBackUp class="size-5" />
              </Button>
              <Button
                variant="quiet"
                size="icon"
                aria-label="Redo"
                onPointerDown={(e) => {
                  e.preventDefault();
                  replayUndoShortcut(true);
                }}
                class="text-muted"
              >
                <ArrowForwardUp class="size-5" />
              </Button>
            </div>
          )}

          {phone && (
            <div class="flex flex-row items-center">
              <PreviewToggleButton />
            </div>
          )}
        </div>

        <div class="absolute inset-x-0 bottom-0 h-px bg-foreground/[0.06]" />

        <ImportProgressBar />
      </div>
    </div>
  );
}
