import { StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { isAndroid, isIOS } from "@impower/codemirror-vscode-lsp-client/src";

const platformStateField = StateField.define({
  create() {
    return isIOS() ? "ios" : isAndroid() ? "android" : "desktop";
  },
  update(value, tr) {
    if (tr.startState) {
      return isIOS() ? "ios" : isAndroid() ? "android" : "desktop";
    }
    return value;
  },
});

const platformAttributeExtension = EditorView.editorAttributes.from(
  platformStateField,
  (value) => {
    return { class: value };
  },
);

export function platformClassManager() {
  return [platformStateField, platformAttributeExtension];
}
