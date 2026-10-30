import ConflictDialogHost from "../components/conflict-dialog/ConflictDialogHost";
import MainWindow from "../components/main-window/MainWindow";
import SnackbarHost from "../components/snackbar-host/SnackbarHost";
import TrashPanel from "../components/trash-panel/TrashPanel";

const HOST_STYLE = `
  #root {
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

export default function SparkEditor(_props: SparkEditorProps) {
  return (
    <>
      <style>{HOST_STYLE}</style>
      <MainWindow />

      <TrashPanel />
      <ConflictDialogHost />
      <SnackbarHost />
    </>
  );
}
