import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import workspace from "../../workspace/WorkspaceStore";
import PreviewGame from "../preview-game/PreviewGame";
import PreviewScreenplay from "../preview-screenplay/PreviewScreenplay";
import PreviewTopBar from "../preview-top-bar/PreviewTopBar";

export const propDefaults = {};
export type PreviewProps = Partial<typeof propDefaults>;

const stageClass = (mode: string, choosing: boolean) => {
  if (mode === "game") {
    return "contents";
  }
  return choosing
    ? "absolute inset-x-0 top-[52px] bottom-0 z-[2] flex flex-col bg-preview-mat"
    : "hidden";
};

export default function Preview(_props: PreviewProps) {
  const mode = workspaceSettings.preferences.value.previewMode;
  const game = workspace.state.value.preview?.modes?.game;
  const choosing = !!game?.running && !!game?.choosing;
  return (
    <div class="@container relative flex min-h-0 flex-1 flex-col">
      <PreviewTopBar />
      <div class={stageClass(mode, choosing)} data-choosing={mode !== "game" && choosing ? "" : undefined}>
        <PreviewGame />
      </div>
      {mode === "screenplay" ? <PreviewScreenplay /> : null}
    </div>
  );
}
