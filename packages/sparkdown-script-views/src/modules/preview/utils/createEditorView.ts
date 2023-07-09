import { syntaxTreeAvailable } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import debounce from "../../../cm-language-client/utils/debounce";
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
  stabilizationDuration?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  onReady?: () => void;
  onHeightChanged?: () => void;
  onHeightStabilized?: () => void;
}

const createEditorView = (
  parent: HTMLElement,
  config?: EditorConfig
): EditorView => {
  const doc = config?.doc;
  const contentPadding = config?.contentPadding;
  const stabilizationDuration = 200;
  const onBlur = config?.onBlur;
  const onFocus = config?.onFocus;
  const onReady = config?.onReady;
  const onHeightStabilized = config?.onHeightStabilized ?? (() => {});
  const onHeightChanged = config?.onHeightChanged;
  const debouncedHeightChanged = debounce(
    onHeightStabilized,
    stabilizationDuration
  );
  const startState = EditorState.create({
    doc,
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.theme(PREVIEW_THEME),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        const parsed = syntaxTreeAvailable(u.state);
        if (u.heightChanged) {
          onHeightChanged?.();
          debouncedHeightChanged();
        }
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
