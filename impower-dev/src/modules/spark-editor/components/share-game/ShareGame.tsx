import {
  BrandAndroid,
  BrandApple,
  BrandHtml5,
  Button,
  Gear,
  Ripple,
  SquareLetterS,
} from "@impower/impower-ui/components";
import type { IconComponent } from "@impower/impower-ui/components";
import OptionButton from "../option-button/OptionButton";

export const propDefaults = {};
export type ShareGameProps = Partial<typeof propDefaults>;

type Target = {
  label: string;
  ext: string;
  icon: IconComponent;
};

const TARGETS: Target[] = [
  { label: "Spark Cartridge", ext: ".s.png", icon: SquareLetterS },
  { label: "HTML5 App", ext: ".zip", icon: BrandHtml5 },
  { label: "Android App", ext: ".apk", icon: BrandAndroid },
  { label: "iOS App", ext: ".ipa", icon: BrandApple },
];

/**
 * "Game" panel of the Share pane: list of build/publish targets followed
 * by a "Publish Online" call-to-action.
 *
 * Click handlers are intentionally not wired yet — the legacy spec-component
 * version didn't dispatch any actions either; both panels were placeholders
 * for the eventual publish flows.
 */
export default function ShareGame(_props: ShareGameProps) {
  return (
    <div class="absolute inset-0 flex flex-col overflow-y-auto [scrollbar-gutter:stable] py-4">
      <nav class="flex flex-col">
        {TARGETS.map((t) => {
          const Icon = t.icon;
          return (
            <OptionButton>
              <span class="flex flex-row items-center gap-4">
                <Icon class="size-5" />
                <span>{t.label}</span>
              </span>
              <span class="flex flex-row items-center gap-4 opacity-50">
                {t.ext}
                {/* Raw <button> here (not <Button>) because this lives
                    inside an OptionButton row, which is itself a button —
                    nesting our Button primitive would compound the
                    invalid-HTML situation. <Ripple /> is added manually
                    to keep the press feedback consistent. */}
                <button
                  type="button"
                  aria-label="Settings"
                  // `size-10` (40px) matches main's `variant="icon"` gear; a
                  // 48px (size-12) button padded the centered 20px glyph 4px
                  // further from the .s.png label than main.
                  class="relative -mr-6 inline-flex size-10 cursor-pointer pointer-events-auto items-center justify-center overflow-hidden rounded-full text-foreground/50 hover:bg-foreground/5 hover:text-foreground active:bg-foreground/[0.12]"
                  onClick={(e) => {
                    // Don't propagate to the option-button row.
                    e.stopPropagation();
                  }}
                >
                  <Gear class="size-5" />
                  <Ripple />
                </button>
              </span>
            </OptionButton>
          );
        })}
      </nav>
      <div class="px-6 pt-6">
        <Button variant="outline" size="lg" class="w-full">
          Publish Online
        </Button>
      </div>
    </div>
  );
}
