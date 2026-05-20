// Host CSS — spark-editor is the page root; make it a full-bleed flex
// column so its children can fill the viewport. Mirrors the legacy
// `<s-box position="relative" bg-color="panel" grow>` wrapper.
const HOST_STYLE = `
  spark-editor {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 0%;
    width: 100%;
    min-height: 100vh;
    background: var(--theme-color-panel, #1f1f1f);
  }
`;

export const propDefaults = {};
export type SparkEditorProps = Partial<typeof propDefaults>;

/**
 * Page-root host element. Wraps the main editor window plus two
 * window-level overlays (interaction-blocker, file-dropzone).
 *
 * Rendered as a Preact custom element with shadow:false — i.e. its
 * children live in light DOM. The legacy spec-component version used a
 * shadow root, which the SSR walker mirrored into light DOM, producing
 * a duplicate `<se-main-window>` subtree (two iframes, two store
 * subscriptions). With light-DOM-only rendering there's a single tree.
 */
export default function SparkEditor(_props: SparkEditorProps) {
  return (
    <>
      <style>{HOST_STYLE}</style>
      {/* @ts-expect-error legacy custom element */}
      <se-main-window />
      {/* @ts-expect-error legacy custom element */}
      <se-interaction-blocker hidden />
      {/* @ts-expect-error legacy custom element */}
      <se-file-dropzone />
    </>
  );
}
