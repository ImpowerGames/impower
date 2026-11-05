import { effect, type ReadonlySignal } from "@preact/signals";
import type { ProjectSettings } from "../../workspace/settings/settingsSchema";

type AspectRatio = ProjectSettings["previewAspectRatio"];

export const createAspectRatioSync = (
  settings: ReadonlySignal<Pick<ProjectSettings, "previewAspectRatio">>,
  request: (aspectRatio: AspectRatio) => void,
) => {
  let stop: (() => void) | undefined;
  return {
    initialized() {
      stop?.();
      let sent: AspectRatio | undefined;
      stop = effect(() => {
        const { previewAspectRatio } = settings.value;
        if (previewAspectRatio !== sent) {
          sent = previewAspectRatio;
          request(previewAspectRatio);
        }
      });
    },
    dispose() {
      stop?.();
      stop = undefined;
    },
  };
};
