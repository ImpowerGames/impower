import { codeFolding, foldGutter, foldService } from "@codemirror/language";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { coarsePointer } from "@impower/codemirror-vscode-lsp-client/src";
import { lspTheme } from "@impower/codemirror-vscode-lsp-client/src/theme";
import { setBreakpointStates } from "../../src/cm-breakpoints/breakpoints";
import { openChoicePopover, setChoiceMarkers } from "../../src/cm-choice-markers/choiceMarkers";
import { foldMarkerDOM } from "../../src/cm-fold-marks/foldMarks";
import EDITOR_EXTENSIONS from "../../src/modules/script-editor/constants/EDITOR_EXTENSIONS";
import EDITOR_THEME from "../../src/modules/script-editor/constants/EDITOR_THEME";
import {
  customGotoLinePanel,
  openCustomGotoLinePanel,
} from "../../src/modules/script-editor/utils/extensions/gotoLinePanel";
import { keyboardToolbar } from "../../src/modules/script-editor/utils/extensions/keyboardToolbar";
import { scriptMode } from "../../src/modules/script-editor/utils/extensions/scriptMode";
import { statusPanel } from "../../src/modules/script-editor/utils/extensions/statusPanel";

const SCRIPT = [
  "scene start",
  "  choose",
  "    * [Tell the truth.]",
  "      It was me.",
  "    * [Lie.]",
  "      It was not me.",
  "  end",
  "  The end.",
  "end",
].join("\n");

const foldChoose = foldService.of((state, from) => {
  const line = state.doc.lineAt(from);
  if (!line.text.trim().startsWith("choose")) {
    return null;
  }
  return { from: line.to, to: state.doc.line(line.number + 5).to };
});

const parent = document.body.appendChild(document.createElement("section"));
parent.className = "sparkdown-script-editor-root";

const view = new EditorView({
  state: EditorState.create({
    doc: SCRIPT,
    extensions: [
      coarsePointer.of(true),
      scriptMode("editing"),
      EDITOR_EXTENSIONS,
      lspTheme,
      EditorView.theme(EDITOR_THEME, { dark: true }),
      codeFolding(),
      foldChoose,
      foldGutter({ markerDOM: foldMarkerDOM }),
      customGotoLinePanel(),
      statusPanel(),
      keyboardToolbar(),
    ],
  }),
  parent,
});

setBreakpointStates(view, [{ line: 1, verified: true }]);
setChoiceMarkers(view, [
  {
    line: 3,
    icon: "auto",
    title: "Choice · line 3",
    text: "",
    options: [
      { text: "Tell the truth.", taken: true, pinned: false },
      { text: "Lie.", taken: false, pinned: true },
    ],
    unpin: false,
  },
  { line: 5, icon: "pinned", title: "Choice · line 5", text: "", options: [], unpin: true },
]);

const lineSpan = (n: number) => {
  const line = view.state.doc.line(n);
  return { from: line.from + line.text.search(/\S/), to: line.to };
};

const diagnostics: Diagnostic[] = [
  { ...lineSpan(4), severity: "error", message: "An error." },
  { ...lineSpan(6), severity: "warning", message: "A warning." },
  { ...lineSpan(8), severity: "info", message: "A note." },
];

const codicon = document.createElement("span");
codicon.className = "codicon codicon-info";
codicon.style.cssText = "position: absolute; left: 0; bottom: 0; width: 16px; height: 16px;";

const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

const ready = (async () => {
  view.dispatch(setDiagnostics(view.state, diagnostics));
  view.focus();
  view.dispatch({ selection: { anchor: lineSpan(4).from + 1 } });
  openCustomGotoLinePanel(view);
  await settle();
  openChoicePopover(view, 3);
  view.dom.appendChild(codicon);
  view.focus();
  await settle();
})();

Object.assign(window, { iconMaskPaint: { view, ready } });
