import { EditorSelection, EditorState, StateEffect } from "@codemirror/state";
import { EditorView, showDialog, showPanel } from "@codemirror/view";
import {
  documentSymbolsField,
  stickyScrollMargin,
  stickyScrollPlugin,
  stickyScrollTheme,
  type DocumentSymbol,
} from "@impower/codemirror-vscode-lsp-client/src/symbols";
import EDITOR_EXTENSIONS from "../../src/modules/script-editor/constants/EDITOR_EXTENSIONS";
import EDITOR_THEME from "../../src/modules/script-editor/constants/EDITOR_THEME";
import { focusOnScreen } from "../../src/modules/script-editor/utils/caretOnScreen";
import {
  caretScrollMargin,
  caretScrollMarginY,
} from "../../src/modules/script-editor/utils/extensions/caretScrollMargin";
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

let parent = document.body.appendChild(document.createElement("section"));
parent.className = "sparkdown-script-editor-root";

let view = new EditorView({
  state: EditorState.create({
    doc: SCRIPT,
    extensions: [
      EDITOR_EXTENSIONS,
      EditorView.theme(EDITOR_THEME, { dark: true }),
      EditorView.lineWrapping,
      scriptMode("reading"),
      mobileViewportManager(),
      caretScrollMargin(),
      EditorView.scrollMargins.of(() => ({ top: STICKY_TOP })),
    ],
  }),
  parent,
});

const sceneSymbols = (doc: string): DocumentSymbol[] => {
  const symbols: DocumentSymbol[] = [];
  const lines = doc.split("\n");
  let offset = 0;
  let open: { name: string; from: number } | null = null;
  for (const line of lines) {
    if (line.startsWith("scene ")) {
      open = { name: line.slice("scene ".length), from: offset };
    } else if (line === "end" && open) {
      symbols.push({
        name: open.name,
        kind: 12,
        from: open.from,
        to: offset + line.length,
        selectionFrom: open.from,
        selectionTo: open.from + "scene ".length + open.name.length,
      });
      open = null;
    }
    offset += line.length + 1;
  }
  return symbols;
};

const initialStickyMargin = () => ({ top: 0 });

const stickyMarginApplied = () =>
  !view.state.facet(EditorView.scrollMargins).includes(initialStickyMargin);

const useStickyHeaders = (withTopDialog: boolean) => {
  view.destroy();
  parent.remove();
  parent = document.body.appendChild(document.createElement("section"));
  parent.className = "sparkdown-script-editor-root";
  view = new EditorView({
    state: EditorState.create({
      doc: SCRIPT,
      extensions: [
        EDITOR_EXTENSIONS,
        EditorView.theme(EDITOR_THEME, { dark: true }),
        EditorView.lineWrapping,
        scriptMode("reading"),
        mobileViewportManager(),
        caretScrollMargin(),
        documentSymbolsField.init(() => sceneSymbols(SCRIPT)),
        stickyScrollTheme,
        stickyScrollPlugin,
        stickyScrollMargin.of(EditorView.scrollMargins.of(initialStickyMargin)),
      ],
    }),
    parent,
  });
  if (withTopDialog) {
    showDialog(view, { label: "Language server message", top: true });
  }
  (window as unknown as { caretOnScreen: { view: EditorView } }).caretOnScreen.view = view;
};

const headersBox = () => {
  const headers = view.dom.querySelector(".cm-sticky-headers");
  const r = headers?.getBoundingClientRect();
  return r && r.height > 0 ? { top: r.top, bottom: r.bottom } : null;
};

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

const setCaretAtRowEnd = (x: number, y: number) => {
  const pos = view.posAtCoords({ x, y });
  if (pos == null) return null;
  const end = view.moveToLineBoundary(EditorSelection.cursor(pos, 1), true, true);
  view.dispatch({ selection: EditorSelection.create([end]) });
  const { head, assoc } = view.state.selection.main;
  return { head, assoc };
};

const caretLine = () => view.state.doc.lineAt(view.state.selection.main.head).number;

const caretAtLineStart = () => {
  const head = view.state.selection.main.head;
  return view.state.doc.lineAt(head).from === head;
};

const caretRow = () => {
  const { head, assoc } = view.state.selection.main;
  const rect = view.coordsAtPos(head, assoc || 1);
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

const BOTTOM_PANEL_HEIGHT = 52;

const KEYBOARD_LAYOUT_STYLE = `
html.keyboard-open section { margin-bottom: calc(-1 * var(--keyboard-height)); }
html.keyboard-open section .cm-editor { position: relative; }
html.keyboard-open section .cm-editor .cm-panels.cm-panels-bottom { position: absolute; transform: translateY(calc(-1 * var(--keyboard-height))); }
`;

const useBottomPanelOverKeyboard = () => {
  document.head.appendChild(document.createElement("style")).textContent =
    KEYBOARD_LAYOUT_STYLE;
  const dom = document.createElement("div");
  dom.className = "cm-test-toolbar";
  dom.style.height = `${BOTTOM_PANEL_HEIGHT}px`;
  view.dispatch({
    effects: StateEffect.appendConfig.of(
      showPanel.of(() => ({ dom, bottom: true })),
    ),
  });
};

const bottomPanelBox = () => {
  const r = view.dom.querySelector(".cm-panels-bottom")?.getBoundingClientRect();
  return r ? { top: r.top, bottom: r.bottom } : null;
};

Object.assign(window, {
  caretOnScreen: {
    stickyTop: STICKY_TOP,
    caretMargin: caretScrollMarginY,
    view,
    useTallScript,
    useStickyHeaders,
    headersBox,
    stickyMarginApplied,
    setCaretLine,
    setCaretAt,
    setCaretAtRowEnd,
    caretLine,
    caretAtLineStart,
    caretRow,
    lineBox,
    scrollerBox,
    edit,
    openKeyboard,
    keyboardOpen,
    useBottomPanelOverKeyboard,
    bottomPanelBox,
  },
});
