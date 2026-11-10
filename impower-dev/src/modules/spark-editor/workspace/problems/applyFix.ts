import type { ChoseEditorFixParams } from "@impower/spark-editor-protocol/src/protocols/editor/ChoseEditorFixMessage";
import { showSnackbar } from "../../utils/snackbar";
import { applyEditorFix, type EditorEditFiles } from "../applyEditorEdit";

export const FIX_REFUSED = "That line changed; nothing was done.";

export const FIX_UNDO_LABEL = "Undo";

export type FixChoice = ChoseEditorFixParams;

export interface FixDeps extends EditorEditFiles {
  refreshDiagnostics: (uri: string) => Promise<void>;
  recordScriptChange: () => Promise<void>;
}

const refuse = (deps: FixDeps, uri: string) => {
  showSnackbar({ message: FIX_REFUSED });
  void deps.refreshDiagnostics(uri);
};

export async function applyFix(deps: FixDeps, choice: FixChoice) {
  const { uri } = choice.fix;
  const result = await applyEditorFix(deps, choice.fix, choice.name);
  if (!result.applied) {
    refuse(deps, uri);
    return false;
  }
  await deps.recordScriptChange();
  showSnackbar({
    message: choice.done,
    actionLabel: FIX_UNDO_LABEL,
    onAction: () =>
      void result.undo().then(async (undone) => {
        if (undone) {
          await deps.recordScriptChange();
        } else {
          refuse(deps, uri);
        }
      }),
  });
  return true;
}
