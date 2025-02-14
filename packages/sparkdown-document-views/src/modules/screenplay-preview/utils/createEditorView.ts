import { EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, ViewUpdate } from "@codemirror/view";
import { syntaxParserRunning } from "@codemirror/language";
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
  onIdle?: () => void;
  onFocus?: (update: ViewUpdate) => void;
  onBlur?: (update: ViewUpdate) => void;
  onSelectionChanged?: (
    update: ViewUpdate,
    anchor: number,
    head: number
  ) => void;
  onHeightChanged?: (update: ViewUpdate) => void;
}

const createEditorView = (
  parent: HTMLElement,
  config?: EditorConfig
): EditorView => {
  const textDocument = config?.textDocument;
  const scrollMargin = config?.scrollMargin;
  const stabilizationDuration = config?.stabilizationDuration ?? 50;
  const onIdle = config?.onIdle ?? (() => {});
  const debouncedIdle = debounce(onIdle, stabilizationDuration);
  const onFocus = config?.onFocus;
  const onBlur = config?.onBlur;
  const onSelectionChanged = config?.onSelectionChanged;
  const onHeightChanged = config?.onHeightChanged;
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
        if (!syntaxParserRunning(u.view)) {
          debouncedIdle();
        }
        if (u.heightChanged) {
          onHeightChanged?.(u);
        }
        if (u.selectionSet) {
          const cursorRange = u.state.selection.main;
          const anchor = cursorRange?.anchor;
          const head = cursorRange?.head;
          onSelectionChanged?.(u, anchor, head);
        }
        if (u.focusChanged) {
          if (u.view.hasFocus) {
            onFocus?.(u);
          } else {
            onBlur?.(u);
          }
        }
      }),
      screenplayFormatting(),
      highlightActiveLine(),
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
