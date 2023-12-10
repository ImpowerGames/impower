import { EditorState, StateField, Transaction } from "@codemirror/state";

const versionField = StateField.define<number>({
  create() {
    return 0;
  },
  update(value: number, tr: Transaction) {
    if (tr.docChanged) {
      return value + 1;
    }
    return value;
  },
});

export const getDocumentVersion = (state: EditorState) => {
  return state.field(versionField);
};

export const versioning = () => [versionField];
