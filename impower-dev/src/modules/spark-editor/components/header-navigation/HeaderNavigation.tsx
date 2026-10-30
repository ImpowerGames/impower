import {
  ArrowBackUp,
  ArrowForwardUp,
  Button,
} from "@impower/impower-ui/components";
import { useEffect } from "preact/hooks";
import { canRedo, canUndo, redo, undo } from "../../utils/undoManager";
import HeaderMenuButton from "../header-menu-button/HeaderMenuButton";
import HeaderSyncToolbar from "../header-sync-toolbar/HeaderSyncToolbar";
import HeaderTitleButton from "../header-title-button/HeaderTitleButton";
import HeaderTitleCaption from "../header-title-caption/HeaderTitleCaption";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import PreviewToggleButton from "../preview-toggle-button/PreviewToggleButton";

function isEditableFocus(): boolean {
  let el: Element | null = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  if (!el) {
    return false;
  }
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    return true;
  }
  if ((el as HTMLElement).isContentEditable) {
    return true;
  }
  return !!el.closest?.(".cm-editor");
}

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");

function replayUndoShortcut(isRedo: boolean): void {
  let el: Element | null = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  const init: KeyboardEventInit = {
    key: "z",
    code: "KeyZ",
    shiftKey: isRedo,
    bubbles: true,
    composed: true,
    cancelable: true,
  };
  if (IS_MAC) {
    init.metaKey = true;
  } else {
    init.ctrlKey = true;
  }
  (el ?? document.body).dispatchEvent(new KeyboardEvent("keydown", init));
}

export default function HeaderNavigation() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        const { Workspace } = await import("../../workspace/Workspace");
        await Workspace.window.syncProject();
        return;
      }
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === "z" || key === "y")) {
        if (isEditableFocus()) {
          return;
        }
        const isRedo = key === "y" || (key === "z" && e.shiftKey);
        if (isRedo ? !canRedo.value : !canUndo.value) {
          return;
        }
        e.preventDefault();
        if (isRedo) {
          await redo();
        } else {
          await undo();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div class="relative z-10">

      <button class="absolute inset-0 m-0 border-0 bg-transparent p-0" />
      <div class="relative z-[2] flex h-14 flex-row items-center justify-center bg-engine-800">
        <div class="flex w-full flex-row items-center">
          <HeaderMenuButton />
          <div class="flex flex-1 flex-col items-start">
            <HeaderTitleButton />
            <HeaderTitleCaption />
          </div>
          <HeaderSyncToolbar />

          <div class="flex flex-row items-center min-[960px]:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Undo"
              onPointerDown={(e) => {
                e.preventDefault();
                replayUndoShortcut(false);
              }}
              class="rounded-full text-foreground/60 hover:text-foreground"
            >
              <ArrowBackUp class="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Redo"
              onPointerDown={(e) => {
                e.preventDefault();
                replayUndoShortcut(true);
              }}
              class="rounded-full text-foreground/60 hover:text-foreground"
            >
              <ArrowForwardUp class="size-5" />
            </Button>
          </div>

          <div class="flex flex-row items-center min-[960px]:hidden">
            <PreviewToggleButton />
          </div>
        </div>

        <div class="absolute inset-x-0 bottom-0 h-px bg-foreground/[0.06]" />

        <ImportProgressBar />
      </div>
    </div>
  );
}
