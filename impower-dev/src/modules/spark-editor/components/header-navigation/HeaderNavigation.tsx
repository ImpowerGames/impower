import { useEffect } from "preact/hooks";
import { redo, undo } from "../../utils/undoManager";
import HeaderMenuButton from "../header-menu-button/HeaderMenuButton";
import HeaderSyncToolbar from "../header-sync-toolbar/HeaderSyncToolbar";
import HeaderTitleButton from "../header-title-button/HeaderTitleButton";
import HeaderTitleCaption from "../header-title-caption/HeaderTitleCaption";
import ImportProgressBar from "../import-progress-bar/ImportProgressBar";
import PreviewToggleButton from "../preview-toggle-button/PreviewToggleButton";

/**
 * Top header bar shell. Listens for Ctrl+S to trigger
 * `Workspace.window.syncProject()`, mirroring the legacy
 * `header-navigation.ts` behavior.
 *
 * Layout:
 *   [menu] [title + caption stack] [sync toolbar] [preview-toggle (mobile)]
 *   ─────────────────────────────────────────────────────── (6% fg divider)
 */
// True when focus is in an editable surface (a text input/textarea, a
// contenteditable, or the CodeMirror editor) — where Ctrl+Z must stay the
// editor's own text undo, not our file-op undo. Descends through shadow roots
// since the script editor lives in one.
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

export default function HeaderNavigation() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        const { Workspace } = await import("../../workspace/Workspace");
        await Workspace.window.syncProject();
        return;
      }
      // File-op undo/redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z). Skipped while a
      // text editor or input has focus — CodeMirror and the inline rename own
      // their own undo there; we only invert file operations from elsewhere.
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === "z" || key === "y")) {
        if (isEditableFocus()) {
          return;
        }
        e.preventDefault();
        if (key === "y" || (key === "z" && e.shiftKey)) {
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
      {/* Invisible click-blocker covering the header area, ported from the
          original .blocker button. Sits beneath the actual header chrome
          (DOM order: blocker is rendered first, so its z is below). */}
      <button class="absolute inset-0 m-0 border-0 bg-transparent p-0" />
      <div class="relative z-[2] flex h-14 flex-row items-center justify-center bg-engine-800">
        <div class="flex w-full flex-row items-center">
          <HeaderMenuButton />
          <div class="flex flex-1 flex-col items-start">
            <HeaderTitleButton />
            <HeaderTitleCaption />
          </div>
          <HeaderSyncToolbar />
          {/* The preview toggle only needs to be visible while the
              SplitPane has collapsed and is showing a single pane at a
              time. Above 960px the split fits both panels side-by-side
              (see <MainWindow>'s `collapseBelow={960}`), so the toggle
              is meaningless and we hide it. Keep these two breakpoints
              in sync — otherwise the toggle shows even when both panels
              are already visible. */}
          <div class="flex flex-row items-center min-[960px]:hidden">
            <PreviewToggleButton />
          </div>
        </div>
        {/* 1px divider hugging the bottom edge — sparkle used s-divider with
            bg-color="fg-06" (6% opacity). */}
        <div class="absolute inset-x-0 bottom-0 h-px bg-foreground/[0.06]" />
        {/* Determinate import progress overlays the divider while assets are
            being uploaded/dropped (driven by the workspace importProgress
            signal). Renders nothing otherwise. */}
        <ImportProgressBar />
      </div>
    </div>
  );
}
