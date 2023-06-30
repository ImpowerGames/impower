import {
  EditorState,
  Extension,
  StateEffect,
  TransactionSpec,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export default abstract class FeatureSupport<T = undefined> {
  extension: Extension;

  constructor(extension: Extension) {
    this.extension = extension;
  }

  activate(view: EditorView): void {
    const effects: StateEffect<unknown>[] = [];
    effects.push(StateEffect.appendConfig.of(this.extension));
    view.dispatch({ effects });
  }

  abstract transaction(state: EditorState, args: T): TransactionSpec;
}
