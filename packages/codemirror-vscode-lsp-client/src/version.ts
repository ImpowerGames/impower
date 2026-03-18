import { EditorState, Facet, StateField, Transaction } from "@codemirror/state";

export const versionConfig = Facet.define<number, Required<number>>({
  combine(configs) {
    return configs[0] ?? -1;
  },
});

const versionField = StateField.define<number>({
  create(state: EditorState) {
    const initialVersion = state.facet(versionConfig);
    return initialVersion;
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

export const versioning = (version: number) => [
  versionConfig.of(version),
  versionField,
];
