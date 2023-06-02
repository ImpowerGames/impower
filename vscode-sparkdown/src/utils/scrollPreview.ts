import { previewState } from "../state/previewState";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";

export const scrollPreview = (type: "screenplay" | "game", args: unknown) => {
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }
  const editor = getEditor(uri);
  if (!editor) {
    return;
  }
  previewState[type].forEach((p) => {
    if (p.uri === editor.document.uri.toString()) {
      p.panel.webview.postMessage({
        command: "sparkdown.scrollTo",
        content: args,
      });
    }
  });
};
