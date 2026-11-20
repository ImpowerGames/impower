import { EditorView } from "@codemirror/view";

export const scriptLabelText = (uri: string) => {
  const path = uri.split(/[?#]/, 1)[0] ?? "";
  const base = path.slice(path.lastIndexOf("/") + 1);
  let decoded = base;
  try {
    decoded = decodeURIComponent(base);
  } catch {
    decoded = base;
  }
  if (decoded === "main.sd") {
    return "Main";
  }
  const dot = decoded.lastIndexOf(".");
  const name = dot > 0 ? decoded.slice(0, dot) : decoded;
  return name || "Script";
};

export const scriptLabel = (uri: string) =>
  EditorView.contentAttributes.of({ "aria-label": scriptLabelText(uri) });
