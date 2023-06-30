import { CompletionSource, autocompletion } from "@codemirror/autocomplete";
import { EditorState, TransactionSpec } from "@codemirror/state";
import FeatureSupport from "../FeatureSupport";

export default class CompletionSupport extends FeatureSupport {
  constructor(completionSource: readonly CompletionSource[]) {
    super([
      autocompletion({
        override: completionSource,
      }),
    ]);
  }
  override transaction(_state: EditorState): TransactionSpec {
    return {};
  }
}
