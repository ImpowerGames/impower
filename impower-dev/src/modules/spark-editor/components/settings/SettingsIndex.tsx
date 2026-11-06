import { RailIndex } from "@impower/impower-ui/components";
import { SETTINGS_INDEX } from "./sections";
import { currentSection, jumpToSection } from "./settingsNavigation";

export default function SettingsIndex() {
  return (
    <div class="flex min-h-0 flex-1 flex-col group-data-[sidebar=collapsed]/sidebar:hidden">
      <RailIndex
        title="Settings"
        label="Settings sections"
        groups={SETTINGS_INDEX}
        current={currentSection.value}
        onJump={(id) => jumpToSection(id)}
      />
    </div>
  );
}
