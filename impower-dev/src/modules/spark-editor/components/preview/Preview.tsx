import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import PreviewGame from "../preview-game/PreviewGame";
import PreviewScreenplay from "../preview-screenplay/PreviewScreenplay";
import PreviewTopBar from "../preview-top-bar/PreviewTopBar";

export const propDefaults = {};
export type PreviewProps = Partial<typeof propDefaults>;

export default function Preview(_props: PreviewProps) {
  const mode = workspaceSettings.preferences.value.previewMode;
  return (
    <div class="@container flex min-h-0 flex-1 flex-col">
      <PreviewTopBar />
      {mode === "game" ? <PreviewGame /> : <PreviewScreenplay />}
    </div>
  );
}
