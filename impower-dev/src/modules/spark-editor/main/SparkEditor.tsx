import FileDropzone from "../components/file-dropzone/FileDropzone";
import MainWindow from "../components/main-window/MainWindow";

// Host CSS — spark-editor is the page root; make it a full-bleed flex
// column so its children can fill the viewport.
const HOST_STYLE = `
  spark-editor {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 0%;
    width: 100%;
    /* Constrain to viewport so flex:1 children can scroll their own overflow.
       min-height: 100vh would let the host grow with overflowing content,
       breaking the FileList scroller (long lists pushed the FAB and
       bottom-nav off-screen instead of scrolling within the panel). */
    height: 100vh;
    min-height: 0;
    background: var(--theme-color-panel, #1f1f1f);
  }
`;

export const propDefaults = {};
export type SparkEditorProps = Partial<typeof propDefaults>;

/**
 * Page-root host element. Wraps the main editor window plus the window-
 * level file-dropzone overlay. shadow:false — i.e. its children live in
 * light DOM (the legacy version used a shadow root that the SSR walker
 * mirrored into light DOM, producing a duplicate MainWindow subtree).
 */
export default function SparkEditor(_props: SparkEditorProps) {
  return (
    <>
      <style>{HOST_STYLE}</style>
      <MainWindow />
      <FileDropzone />
    </>
  );
}
