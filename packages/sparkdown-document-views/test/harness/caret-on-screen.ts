import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import EDITOR_EXTENSIONS from "../../src/modules/script-editor/constants/EDITOR_EXTENSIONS";
import EDITOR_THEME from "../../src/modules/script-editor/constants/EDITOR_THEME";
import { focusOnScreen } from "../../src/modules/script-editor/utils/caretOnScreen";
import { caretScrollMarginY } from "../../src/modules/script-editor/utils/extensions/caretScrollMargin";
import { mobileViewportManager } from "../../src/modules/script-editor/utils/extensions/mobileViewportManager";
import { scriptMode } from "../../src/modules/script-editor/utils/extensions/scriptMode";

const scene = (n: number) =>
  [
    `scene PLACE_${n}`,
    `  The road bends for the ${n}th time today, and the long line wraps across the narrow phone screen.`,
    "  MARA:",
    `    This is line ${n} of the long script.`,
    `  -> ${n < 30 ? `PLACE_${n + 1}` : "END"}`,
    "end",
    "",
  ].join("\n");

const SCRIPT = ["store gold = 10", "", ...Array.from({ length: 30 }, (_, i) => scene(i + 1))].join("\n");

const TALL_LINE = Array.from({ length: 1600 }, (_, i) => `word${i}`).join(" ");

const TALL_SCRIPT = ["scene TALL", `  ${TALL_LINE}`, "end"].join("\n");

const STICKY_TOP = 40;

const parent = document.body.appendChild(document.createElement("section"));
parent.className = "sparkdown-script-editor-root";

const view = new EditorView({
  state: EditorState.create({
    doc: SCRIPT,
    extensions: [
      EDITOR_EXTENSIONS,
      EditorView.theme(EDITOR_THEME, { dark: true }),
      EditorView.lineWrapping,
      scriptMode("reading"),
      mobileViewportManager(),
      EditorView.scrollMargins.of(() => ({ top: STICKY_TOP })),
    ],
  }),
  parent,
});

const useTallScript = () =>
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: TALL_SCRIPT } });

const setCaretLine = (line: number) =>
  view.dispatch({ selection: { anchor: view.state.doc.line(line).from } });

const setCaretAt = (x: number, y: number) => {
  const pos = view.posAtCoords({ x, y });
  if (pos != null) {
    view.dispatch({ selection: { anchor: pos } });
  }
  return pos;
};

const caretLine = () => view.state.doc.lineAt(view.state.selection.main.head).number;

const caretAtLineStart = () => {
  const head = view.state.selection.main.head;
  return view.state.doc.lineAt(head).from === head;
};

const caretRow = () => {
  const { head, assoc } = view.state.selection.main;
  const rect = view.coordsAtPos(head, assoc < 0 ? -1 : 1);
  return rect ? { top: rect.top, bottom: rect.bottom } : null;
};

const lineBox = (line: number) => {
  const block = view.lineBlockAt(view.state.doc.line(line).from);
  return { top: view.documentTop + block.top, bottom: view.documentTop + block.bottom };
};

const scrollerBox = () => {
  const r = view.scrollDOM.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left };
};

const edit = () => focusOnScreen(view);

const openKeyboard = (visibleHeight: number) => {
  const viewport = window.visualViewport!;
  Object.defineProperty(viewport, "height", { configurable: true, get: () => visibleHeight });
  viewport.dispatchEvent(new Event("resize"));
};

const keyboardOpen = () => view.dom.classList.contains("keyboard-open");

Object.assign(window, {
  caretOnScreen: {
    stickyTop: STICKY_TOP,
    caretMargin: caretScrollMarginY,
    view,
    useTallScript,
    setCaretLine,
    setCaretAt,
    caretLine,
    caretAtLineStart,
    caretRow,
    lineBox,
    scrollerBox,
    edit,
    openKeyboard,
    keyboardOpen,
  },
});
