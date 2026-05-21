import { useEffect } from "preact/hooks";
import HeaderMenuButton from "../header-menu-button/HeaderMenuButton";
import HeaderSyncToolbar from "../header-sync-toolbar/HeaderSyncToolbar";
import HeaderTitleButton from "../header-title-button/HeaderTitleButton";
import HeaderTitleCaption from "../header-title-caption/HeaderTitleCaption";

/**
 * Top header bar shell. Listens for Ctrl+S to trigger
 * `Workspace.window.syncProject()`, mirroring the legacy
 * `header-navigation.ts` behavior.
 *
 * Layout:
 *   [menu] [title + caption stack] [sync toolbar] [preview-toggle (mobile)]
 *   ─────────────────────────────────────────────────────── (6% fg divider)
 */
export default function HeaderNavigation() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        const { Workspace } = await import("../../workspace/Workspace");
        await Workspace.window.syncProject();
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
          {/* sparkle's <s-hidden hide-above="lg"> hid the preview toggle at
              >=1280px (sparkle's lg breakpoint). Tailwind's `lg:` is 1024px
              by default, so we use an arbitrary `min-[1280px]:hidden` to
              match the original breakpoint exactly. */}
          <div class="flex flex-row items-center min-[1280px]:hidden">
            {/* @ts-expect-error legacy custom element */}
            <se-preview-toggle-button id="previewButton" />
          </div>
        </div>
        {/* 1px divider hugging the bottom edge — sparkle used s-divider with
            bg-color="fg-06" (6% opacity). */}
        <div class="absolute inset-x-0 bottom-0 h-px bg-foreground/[0.06]" />
      </div>
    </div>
  );
}
