import {
  Button,
  ComputerIcon,
  DeviceIcon,
  SettingsIcon,
  SparkIcon,
} from "@impower/impower-ui/components";
import type {
  IconComponent,
} from "@impower/impower-ui/components";
import OptionButton from "../option-button/OptionButton";

export const propDefaults = {};
export type ShareGameProps = Partial<typeof propDefaults>;

type Target = {
  label: string;
  ext: string;
  icon: IconComponent;
};

const TARGETS: Target[] = [
  { label: "Spark Cartridge", ext: ".s.png", icon: SparkIcon },
  { label: "HTML5 App", ext: ".zip", icon: ComputerIcon },
  { label: "Android App", ext: ".apk", icon: DeviceIcon },
  { label: "iOS App", ext: ".ipa", icon: DeviceIcon },
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
                  class="relative -mr-6 inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-muted control-overlay"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <SettingsIcon class="size-5" />
                </button>
              </span>
            </OptionButton>
          );
        })}
      </nav>
      <div class="px-6 pt-6">
        <Button class="w-full">
          Publish Online
        </Button>
      </div>
    </div>
  );
}
