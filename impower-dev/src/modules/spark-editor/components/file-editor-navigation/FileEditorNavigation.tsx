import { ArrowLeft, Button } from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";

export const propDefaults = {};
export type FileEditorNavigationProps = Partial<typeof propDefaults> & {
  /**
   * Fires when the user clicks the back arrow. Replaces the legacy
   * `changing` event with `detail.key === "close-file-editor"` — the
   * parent passes a closed-file-editor callback directly instead of
   * filtering bubbled events.
   */
  onBack?: () => void;
  /**
   * Title content (typically a `<input>` for filename rename). Rendered
   * centered between the back button and a matching right-side spacer.
   */
  children?: ComponentChildren;
};

/**
 * Sticky top header for the "viewing a file in its own editor" mode
 * (Logic > Scripts > [open script]). Back arrow on the left, title slot
 * centered, equal-width spacer on the right so the title stays visually
 * centered. Mirrors the legacy `<se-file-editor-navigation>`. Imported
 * directly as a Preact component — no custom-element registration
 * because nothing in the page needs the `<se-file-editor-navigation>`
 * tag form anymore.
 */
export default function FileEditorNavigation({
  onBack,
  children,
}: FileEditorNavigationProps) {
  return (
    <>
      <div class="sticky top-0 z-10 bg-engine-900">
        <div class="relative flex h-12 flex-row items-stretch">
          <Button
            variant="ghost"
            size="icon-lg"
            class="text-foreground/50"
            aria-label="Back"
            onClick={() => onBack?.()}
          >
            <ArrowLeft class="size-5" />
          </Button>
          {/* Title area — `absolute inset-0` + flex centering so the title
              (the rename field) is centered both axes in the header row and
              long filenames truncate with ellipsis instead of pushing the
              back button. */}
          <div class="relative flex flex-1 flex-row items-center justify-center px-4 text-base">
            <div class="absolute inset-0 flex items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap text-center">
              {children}
            </div>
          </div>
          {/* Right spacer matches the legacy 56px width — keeps the
              title centered relative to the row regardless of the
              48px back button on the left. */}
          <div class="w-14 flex-none" />
        </div>
      </div>
    </>
  );
}
