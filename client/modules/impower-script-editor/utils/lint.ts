import { Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { parseFountain } from "../../impower-script-parser";

export const fountainParseLinter = (view: EditorView): Diagnostic[] => {
  const result = parseFountain(view.state.doc.toString());
  return result.diagnostics || [];
};
