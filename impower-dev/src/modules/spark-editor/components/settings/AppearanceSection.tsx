import {
  ChoiceGroup,
  ChoiceRow,
  SettingsGroup,
  SettingsList,
  SettingsSection,
  ThemeSwatch,
  type ChoiceRowOption,
} from "@impower/impower-ui/components";
import { ADJUSTABLE_THEMES, type Surfaces, type SyntaxPalette } from "../../workspace/settings/applyTheme";
import { useSettings } from "../../workspace/settings/useSettings";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import type { SettingsSectionInfo } from "./sections";
import { THEME_CHOICES, themeNote } from "./themeChoices";
import { useSectionReset } from "./useSectionReset";

const SURFACE_OPTIONS: readonly ChoiceRowOption<Surfaces>[] = [
  { value: "unified", label: "Unified", detail: "One background for navigation, writing and preview." },
  { value: "layered", label: "Lighter navigation", detail: "Darker writing and preview panes, lighter navigation." },
];

const SYNTAX_OPTIONS: readonly ChoiceRowOption<SyntaxPalette>[] = [
  { value: "original", label: "Original", detail: "Exact colors from impower.dev." },
  { value: "softened", label: "Softened", detail: "20% less color intensity. Same distinctions." },
];

const themeOptions = () =>
  THEME_CHOICES.map((choice) => ({
  value: choice.value,
  label: choice.label,
  detail: choice.detail,
  media: <ThemeSwatch theme={choice.swatch} pairedTheme={choice.pairedSwatch} />,
}));

export default function AppearanceSection({ section }: { section: SettingsSectionInfo }) {
  const { preferences, setPreference } = useSettings();
  const resolved = workspaceSettings.theme.value;
  const reset = useSectionReset({ preferences: ["theme", "surfaces", "syntaxPalette"] });
  const adjustable = ADJUSTABLE_THEMES.includes(resolved);
  const note = themeNote(preferences.theme, resolved);
  return (
    <SettingsSection id={section.id} title={section.title} {...reset}>
      <SettingsGroup legend="Theme">
        <ChoiceGroup
          variant="tiles"
          name="editor-theme"
          aria-label="Theme"
          options={themeOptions()}
          value={preferences.theme}
          onValueChange={(theme) => setPreference("theme", theme)}
        />
        {note && (
          <p data-theme-note class="mt-2.5 mb-0 text-[13px]/[1.5] text-muted">
            {note}
          </p>
        )}
      </SettingsGroup>
      <SettingsGroup hidden={!adjustable}>
        <SettingsList>
          <ChoiceRow
            id="theme-surfaces"
            name="Surfaces"
            group="editor-surfaces"
            setting="surfaces"
            options={SURFACE_OPTIONS}
            value={preferences.surfaces}
            onValueChange={(surfaces) => setPreference("surfaces", surfaces)}
          />
          <ChoiceRow
            id="theme-palette"
            name="Syntax colors"
            group="syntax-palette"
            setting="syntaxPalette"
            options={SYNTAX_OPTIONS}
            value={preferences.syntaxPalette}
            onValueChange={(syntax) => setPreference("syntaxPalette", syntax)}
          />
        </SettingsList>
      </SettingsGroup>
    </SettingsSection>
  );
}
