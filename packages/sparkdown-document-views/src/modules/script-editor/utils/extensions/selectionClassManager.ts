import { StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const selectionStateField = StateField.define({
  create(state) {
    return state.selection.ranges.some((r) => !r.empty);
  },
  update(value, tr) {
    if (tr.newSelection) {
      return tr.state.selection.ranges.some((r) => !r.empty);
    }
    return value;
  },
});

const selectionAttributeExtension = EditorView.editorAttributes.from(
  selectionStateField,
  (value) => {
    return value ? { class: "cm-selected" } : { class: "" };
  },
);

export function selectionClassManager() {
  return [selectionStateField, selectionAttributeExtension];
}
