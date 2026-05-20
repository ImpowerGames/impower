import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type PreviewProps = Partial<typeof propDefaults>;

// Host element layout — preact-custom-element shadow:false leaves <se-preview>
// at inline default, which collapses inside the SplitPane.end flex container.
const HOST_STYLE = `
  se-preview {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
`;

/**
 * Right-pane wrapper that switches between the game preview and the
 * screenplay preview based on `workspace.signals.previewMode`. The heavy
 * runners (`<se-preview-game>`, `<se-preview-screenplay>`) stay as legacy
 * spec-components for now — they're emitted as children and the browser
 * upgrades them post-hydration.
 */
export default function Preview(_props: PreviewProps) {
  const mode = workspace.signals.previewMode.value;
  return (
    <>
      <style>{HOST_STYLE}</style>
      {/* @ts-expect-error legacy custom element */}
      {mode === "game" && <se-preview-game />}
      {/* @ts-expect-error legacy custom element */}
      {mode === "screenplay" && <se-preview-screenplay />}
    </>
  );
}
