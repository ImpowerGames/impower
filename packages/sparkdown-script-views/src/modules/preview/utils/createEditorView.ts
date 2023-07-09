import { syntaxTreeAvailable } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { scrollMargins } from "../../../cm-scroll-margins/scrollMargins";
import PREVIEW_THEME from "../constants/PREVIEW_THEME";
import screenplayFormatting from "./screenplayFormatting";

interface EditorConfig {
  doc?: string;
  contentPadding?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  onFocus?: () => void;
  onBlur?: () => void;
  onReady?: () => void;
}

const createEditorView = (
  parent: HTMLElement,
  config?: EditorConfig
): EditorView => {
  const doc = config?.doc;
  const contentPadding = config?.contentPadding;
  const onBlur = config?.onBlur;
  const onFocus = config?.onFocus;
  const onReady = config?.onReady;
  const startState = EditorState.create({
    doc,
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.theme(PREVIEW_THEME),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        const parsed = syntaxTreeAvailable(u.state);
        if (parsed) {
          onReady?.();
        }
        if (u.focusChanged) {
          if (u.view.hasFocus) {
            onFocus?.();
          } else {
            onBlur?.();
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
