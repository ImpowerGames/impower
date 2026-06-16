import workspace from "../../workspace/WorkspaceStore";
import PreviewGame from "../preview-game/PreviewGame";
import PreviewScreenplay from "../preview-screenplay/PreviewScreenplay";

export const propDefaults = {};
export type PreviewProps = Partial<typeof propDefaults>;

/**
 * Right-pane wrapper that switches between the game preview and the
 * screenplay preview based on `workspace.signals.previewMode`.
 */
export default function Preview(_props: PreviewProps) {
  const mode = workspace.signals.previewMode.value;
  if (mode === "game") return <PreviewGame />;
  if (mode === "screenplay") return <PreviewScreenplay />;
  return null;
}
