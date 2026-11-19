import { useScrollbarSize } from "@impower/impower-ui/layout";
import ConflictDialogHost from "../components/conflict-dialog/ConflictDialogHost";
import { SyncConflictDialog } from "../components/drive-sync";
import MainWindow from "../components/main-window/MainWindow";
import { ProblemsDialog } from "../components/problems";
import { RouteSheet } from "../components/preview-route";
import { ReplaceProjectDialog } from "../components/replace-project";
import SnackbarHost from "../components/snackbar-host/SnackbarHost";
import TrashPanel from "../components/trash-panel/TrashPanel";

const HOST_STYLE = `
  #root {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 0%;
    width: 100%;
    height: 100vh;
    min-height: 0;
    background: var(--panel);
  }
`;

export const propDefaults = {};
export type SparkEditorProps = Partial<typeof propDefaults>;

export default function SparkEditor(_props: SparkEditorProps) {
  useScrollbarSize();
  return (
    <>
      <style>{HOST_STYLE}</style>
      <MainWindow />

      <TrashPanel />
      <ConflictDialogHost />
      <SyncConflictDialog />
      <ProblemsDialog />
      <RouteSheet />
      <ReplaceProjectDialog />
      <SnackbarHost />
    </>
  );
}
