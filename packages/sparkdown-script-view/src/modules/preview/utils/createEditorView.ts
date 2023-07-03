import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { scrollMargins } from "../../../cm-scroll-margins/scrollMargins";
import SCREENPLAY_THEME from "../constants/SCREENPLAY_THEME";
import { screenplayFormatting } from "./screenplayFormatting";

interface EditorConfig {
  doc?: string;
  contentPadding?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  onFocus?: (value: string) => void;
  onBlur?: (value: string) => void;
}

const createEditorView = (
  parent: HTMLElement,
  config?: EditorConfig
): EditorView => {
  const doc = config?.doc;
  const contentPadding = config?.contentPadding;
  const onBlur = config?.onBlur;
  const onFocus = config?.onFocus;
  const startState = EditorState.create({
    doc,
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.theme(SCREENPLAY_THEME),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.focusChanged) {
          const doc = u.view.state.doc.toJSON().join("\n");
          if (u.view.hasFocus) {
            onFocus?.(doc);
          } else {
            onBlur?.(doc);
          }
        }
      }),
      scrollMargins(contentPadding),
      screenplayFormatting(),
    ],
  });
  const view = new EditorView({
    state: startState,
    parent,
  });
  return view;
};

export default createEditorView;
