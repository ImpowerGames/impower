import { layoutState, type Layout } from "@impower/impower-ui/layout";
import { computed, signal, type ReadonlySignal } from "@preact/signals";
import {
  fillsPane,
  type Preferences,
  type ProjectSettings,
} from "./settings/settingsSchema";

export type PreviewAspectRatio = ProjectSettings["previewAspectRatio"];

export const STRIP_ASPECT_RATIO = "16:9" satisfies PreviewAspectRatio;

export function effectiveAspectRatio(
  layout: Layout,
  stored: PreviewAspectRatio,
): PreviewAspectRatio {
  return layout === "compact" && stored === "auto"
    ? STRIP_ASPECT_RATIO
    : stored;
}

const layout = signal<Layout>(layoutState.current());
layoutState.subscribe((next) => {
  layout.value = next;
});

export function previewAspectRatioFor(
  settings: ReadonlySignal<Pick<ProjectSettings, "previewAspectRatio">>,
  preferences: ReadonlySignal<Pick<Preferences, "previewMode">>,
): ReadonlySignal<Pick<ProjectSettings, "previewAspectRatio">> {
  return computed(() => ({
    previewAspectRatio: fillsPane(preferences.value.previewMode)
      ? "auto"
      : effectiveAspectRatio(layout.value, settings.value.previewAspectRatio),
  }));
}
