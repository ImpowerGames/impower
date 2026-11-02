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

                <button
                  type="button"
                  aria-label="Settings"
                  class="relative -mr-6 inline-flex size-10 cursor-pointer items-center justify-center overflow-hidden rounded-full text-foreground/50 hover:bg-foreground/5 hover:text-foreground active:bg-foreground/[0.12]"
                  onClick={(e) => {
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
