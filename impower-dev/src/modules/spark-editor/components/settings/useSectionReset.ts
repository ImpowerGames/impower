import { useComputed } from "@preact/signals";
import {
  PREFERENCES_SCHEMA,
  PROJECT_SETTINGS_SCHEMA,
  type PreferenceKey,
  type ProjectSettingKey,
} from "../../workspace/settings/settingsSchema";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";

export type SectionSettings = {
  readonly preferences?: readonly PreferenceKey[];
  readonly project?: readonly ProjectSettingKey[];
};

export function useSectionReset({ preferences = [], project = [] }: SectionSettings): {
  changed: boolean;
  onReset: () => void;
} {
  const changed = useComputed(() => {
    const ownPreferences = workspaceSettings.preferences.value;
    const ownProject = workspaceSettings.projectSettings.value;
    return (
      preferences.some((key) => ownPreferences[key] !== PREFERENCES_SCHEMA[key].default) ||
      project.some((key) => ownProject[key] !== PROJECT_SETTINGS_SCHEMA[key].default)
    );
  }).value;
  return {
    changed,
    onReset: () => {
      workspaceSettings.resetPreferences(preferences);
      workspaceSettings.resetProjectSettings(project);
    },
  };
}
