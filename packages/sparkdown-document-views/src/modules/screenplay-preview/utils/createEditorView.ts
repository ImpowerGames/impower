import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, ViewUpdate } from "@codemirror/view";
import PREVIEW_THEME from "../constants/PREVIEW_THEME";
import screenplayFormatting from "./screenplayFormatting";

interface EditorConfig {
  textDocument: { uri: string; version: number; text: string };
  scrollMargin?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  scrollToLineNumber?: number;
  onUpdate?: (update: ViewUpdate) => void;
}

const createEditorView = (
  parent: HTMLElement,
  config?: EditorConfig
): EditorView => {
  const textDocument = config?.textDocument;
  const scrollMargin = config?.scrollMargin;
  const scrollToLineNumber = config?.scrollToLineNumber;
  const onUpdate = config?.onUpdate;
  const startState = EditorState.create({
    doc: textDocument?.text,
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.theme(PREVIEW_THEME),
      EditorView.lineWrapping,
      EditorView.scrollMargins.of(() => {
        return scrollMargin ?? null;
      }),
      EditorView.updateListener.of((u) => {
        onUpdate?.(u);
      }),
      screenplayFormatting(),
      highlightActiveLine(),
      // lineNumbers(),
    ],
  });
  const scrollToLine = scrollToLineNumber
    ? startState.doc.line(scrollToLineNumber)
    : undefined;
  const scrollTo = scrollToLine
    ? EditorView.scrollIntoView(
        EditorSelection.range(scrollToLine.from, scrollToLine.to),
        { y: "start" }
      )
    : undefined;
  const view = new EditorView({
    state: startState,
    parent,
    scrollTo,
  });
  return view;
};

export default createEditorView;
