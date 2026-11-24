import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import EDITOR_EXTENSIONS from "../../src/modules/script-editor/constants/EDITOR_EXTENSIONS";
import EDITOR_THEME from "../../src/modules/script-editor/constants/EDITOR_THEME";
import { focusOnScreen } from "../../src/modules/script-editor/utils/caretOnScreen";
import {
  caretScrollMarginY,
  scrollCaretIntoView,
} from "../../src/modules/script-editor/utils/extensions/caretScrollMargin";
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
      EditorView.scrollMargins.of(() => ({ top: STICKY_TOP })),
    ],
  }),
  parent,
});

const setCaretLine = (line: number) =>
  view.dispatch({ selection: { anchor: view.state.doc.line(line).from } });

const caretLine = () => view.state.doc.lineAt(view.state.selection.main.head).number;

const caretAtLineStart = () => {
  const head = view.state.selection.main.head;
  return view.state.doc.lineAt(head).from === head;
};

const lineBox = (line: number) => {
  const block = view.lineBlockAt(view.state.doc.line(line).from);
  return { top: view.documentTop + block.top, bottom: view.documentTop + block.bottom };
};

const scrollerBox = () => {
  const r = view.scrollDOM.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
};

const edit = () => focusOnScreen(view);

const revealCaret = () => scrollCaretIntoView(view);

Object.assign(window, {
  caretOnScreen: { stickyTop: STICKY_TOP, caretMargin: caretScrollMarginY, revealCaret, view, setCaretLine, caretLine, caretAtLineStart, lineBox, scrollerBox, edit },
});
