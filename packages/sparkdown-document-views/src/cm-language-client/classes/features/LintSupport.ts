import { EditorState } from "@codemirror/state";
import { Diagnostic, linter, setDiagnostics } from "@codemirror/lint";
import { FeatureSupport } from "../../types/FeatureSupport";

export default class LintSupport implements FeatureSupport<Diagnostic[]> {
  load() {
    return [linter(null)];
  }

  transaction(state: EditorState, diagnostics: Diagnostic[]) {
    return setDiagnostics(state, diagnostics);
  }
}
