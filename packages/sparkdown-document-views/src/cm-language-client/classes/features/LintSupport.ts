import { EditorState } from "@codemirror/state";
import {
  Diagnostic,
  LintSource,
  linter,
  setDiagnostics,
} from "@codemirror/lint";
import { FeatureSupport } from "../../types/FeatureSupport";
import { EditorView } from "@codemirror/view";

export default class LintSupport implements FeatureSupport<Diagnostic[]> {
  sources: LintSource[] = [];

  addSource(source: LintSource): void {
    this.sources.push(source);
  }

  removeSource(source: LintSource): void {
    this.sources.forEach((s, i) => {
      if (s === source) {
        this.sources[i] = () => [];
      }
    });
  }

  protected async pullSources(view: EditorView) {
    const allDiagnostics: Diagnostic[] = [];
    for (let i = 0; i < this.sources.length; i += 1) {
      const source = this.sources[i]!;
      const diagnostics = await source(view);
      if (diagnostics) {
        allDiagnostics.push(...diagnostics);
      }
    }
    return allDiagnostics as readonly Diagnostic[];
  }

  load() {
    return [
      linter(
        (view: EditorView) => {
          return this.pullSources(view);
        },
        {
          autoPanel: true,
        }
      ),
    ];
  }

  transaction(state: EditorState, diagnostics: Diagnostic[]) {
    return setDiagnostics(state, diagnostics);
  }
}
