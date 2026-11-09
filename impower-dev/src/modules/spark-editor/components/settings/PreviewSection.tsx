import {
  ChoiceRow,
  SettingsGroup,
  SettingsList,
  SettingsSection,
  SwitchRow,
  type ChoiceRowOption,
} from "@impower/impower-ui/components";
import type { PreferenceKey, Preferences } from "../../workspace/settings/settingsSchema";
import { useSettings } from "../../workspace/settings/useSettings";
import type { SettingsSectionInfo } from "./sections";
import { useSectionReset } from "./useSectionReset";

type PreviewSwitchKey =
  | "screenplayPaperTexture"
  | "previewFollowsCursor"
  | "previewIdleAnimations"
  | "previewTypingPauses"
  | "previewScreenplaySync";

const PAPER_OPTIONS: readonly ChoiceRowOption<Preferences["screenplayPaper"]>[] = [
  { value: "paper", label: "Paper", detail: "Black ink on a white page." },
  { value: "theme", label: "Match my theme", detail: "The colors of your writing page." },
];

const PREVIEW_SWITCHES: readonly { key: PreviewSwitchKey; name: string; detail: string }[] = [
  { key: "screenplayPaperTexture", name: "Screenplay paper texture", detail: "Display a faint paper grain." },
  { key: "previewFollowsCursor", name: "Game preview follows cursor", detail: "The game shows the line the caret is on." },
  {
    key: "previewIdleAnimations",
    name: "Show idle animations",
    detail:
      "Portraits, ui, and text with idle motion keep moving in the preview. Otherwise, they are shown in their resting state.",
  },
  {
    key: "previewTypingPauses",
    name: "Color typing pauses",
    detail: "Mark the pauses and beeps of the typewriter while the game plays, to tune its timing.",
  },
  {
    key: "previewScreenplaySync",
    name: "Sync screenplay and editor scroll position",
    detail: "The screenplay preview scrolls to show the same line visible in the script editor.",
  },
];

export const PREVIEW_PREFERENCES: readonly PreferenceKey[] = [
  "screenplayPaper",
  ...PREVIEW_SWITCHES.map((spec) => spec.key),
];

export default function PreviewSection({ section }: { section: SettingsSectionInfo }) {
  const { preferences, setPreference } = useSettings();
  const reset = useSectionReset({ preferences: PREVIEW_PREFERENCES });
  return (
    <SettingsSection id={section.id} title={section.title} detail={section.detail} {...reset}>
      <SettingsGroup>
        <SettingsList>
          <ChoiceRow
            id="preview-page"
            name="Screenplay paper color"
            group="screenplay-page"
            setting="screenplayPaper"
            options={PAPER_OPTIONS}
            value={preferences.screenplayPaper}
            onValueChange={(paper) => setPreference("screenplayPaper", paper)}
          />
          {PREVIEW_SWITCHES.map((spec) => (
            <SwitchRow
              key={spec.key}
              id={`preview-${spec.key}`}
              name={spec.name}
              detail={spec.detail}
              setting={spec.key}
              checked={preferences[spec.key]}
              onCheckedChange={(checked) => setPreference(spec.key, checked)}
            />
          ))}
        </SettingsList>
      </SettingsGroup>
    </SettingsSection>
  );
}
