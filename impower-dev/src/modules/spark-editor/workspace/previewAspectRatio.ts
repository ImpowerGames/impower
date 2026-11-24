import { computed, type ReadonlySignal } from "@preact/signals";
import {
  fillsPane,
  type Preferences,
  type ProjectSettings,
} from "./settings/settingsSchema";

export function previewAspectRatioFor(
  settings: ReadonlySignal<Pick<ProjectSettings, "previewAspectRatio">>,
  preferences: ReadonlySignal<Pick<Preferences, "previewMode">>,
): ReadonlySignal<Pick<ProjectSettings, "previewAspectRatio">> {
  return computed(() => ({
    previewAspectRatio: fillsPane(preferences.value.previewMode)
      ? "auto"
      : settings.value.previewAspectRatio,
  }));
}
