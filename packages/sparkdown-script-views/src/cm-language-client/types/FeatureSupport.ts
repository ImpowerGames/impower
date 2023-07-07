import { EditorState, Extension, TransactionSpec } from "@codemirror/state";

export interface FeatureSupport<T = undefined> {
  load: (...args: any[]) => Extension;
  transaction: (state: EditorState, args: T) => TransactionSpec;
}
