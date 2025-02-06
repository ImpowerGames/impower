import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxTreeAvailable } from "@codemirror/language";
import { scrollMargins } from "../../../cm-scroll-margins/scrollMargins";
import debounce from "../../../utils/debounce";
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
  stabilizationDuration?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  onIdle?: () => void;
  onHeightChanged?: () => void;
}

const createEditorView = (
  parent: HTMLElement,
  config?: EditorConfig
): EditorView => {
  const textDocument = config?.textDocument;
  const scrollMargin = config?.scrollMargin;
  const stabilizationDuration = config?.stabilizationDuration ?? 50;
  const onBlur = config?.onBlur;
  const onFocus = config?.onFocus;
  const onIdle = config?.onIdle ?? (() => {});
  const onHeightChanged = config?.onHeightChanged;
  const debouncedIdle = debounce(onIdle, stabilizationDuration);
  const startState = EditorState.create({
    doc: textDocument?.text,
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.theme(PREVIEW_THEME),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (syntaxTreeAvailable(u.state)) {
          debouncedIdle();
        }
        if (u.heightChanged) {
          onHeightChanged?.();
        }
        if (u.focusChanged) {
          if (u.view.hasFocus) {
            onFocus?.();
          } else {
            onBlur?.();
          }
        }
      }),
      screenplayFormatting(),
      scrollMargins(scrollMargin),
      // lineNumbers(),
    ],
  });
  const view = new EditorView({
    state: startState,
    parent,
  });
  return view;
};

export default createEditorView;
