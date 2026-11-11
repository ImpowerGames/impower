import type { EditorFix } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import type { ChoseEditorFixParams } from "@impower/spark-editor-protocol/src/protocols/editor/ChoseEditorFixMessage";
import { showSnackbar } from "../../utils/snackbar";
import { applyEditorFix, type EditorFixResult } from "../applyEditorEdit";

export const FIX_REFUSED = "That line changed; nothing was done.";

export const FIX_UNDO_LABEL = "Undo";

export type FixChoice = ChoseEditorFixParams;

export const fixKey = (fix: Pick<EditorFix, "uri" | "changes">) =>
  [fix.uri, JSON.stringify(fix.changes)].join("|");

export interface FixDeps {
  openForFix: (fix: EditorFix) => Promise<EditorFix | null>;
  openScript: (fix: EditorFix) => Promise<boolean>;
  refreshDiagnostics: (uri: string) => Promise<void>;
  recordScriptChange: () => Promise<void>;
}

const refuse = (deps: FixDeps, uri: string) => {
  showSnackbar({ message: FIX_REFUSED });
  void deps.refreshDiagnostics(uri);
};

const applyInEditor = async (
  deps: FixDeps,
  choice: FixChoice,
): Promise<EditorFixResult | null> => {
  const first = await applyEditorFix(choice.fix, choice.name);
  if (first.outcome !== "unclaimed") {
    return first.outcome === "applied" ? first : null;
  }
  const fresh = await deps.openForFix(choice.fix);
  if (!fresh) {
    return null;
  }
  const opened = await applyEditorFix(fresh, choice.name);
  return opened.outcome === "applied" ? opened : null;
};

const undoInEditor = async (
  deps: FixDeps,
  choice: FixChoice,
  result: EditorFixResult,
) => {
  const first = await result.undo();
  if (first !== "unclaimed") {
    return first === "applied";
  }
  return (await deps.openScript(choice.fix)) && (await result.undo()) === "applied";
};

export async function applyFix(deps: FixDeps, choice: FixChoice) {
  const { uri } = choice.fix;
  const result = await applyInEditor(deps, choice);
  if (!result) {
    refuse(deps, uri);
    return false;
  }
  await deps.recordScriptChange();
  showSnackbar({
    message: choice.done,
    actionLabel: FIX_UNDO_LABEL,
    onAction: () =>
      void undoInEditor(deps, choice, result).then(async (undone) => {
        if (undone) {
          await deps.recordScriptChange();
        } else {
          refuse(deps, uri);
        }
      }),
  });
  return true;
}
