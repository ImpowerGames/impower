import { codeFolding, foldGutter, foldService } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { coarsePointer } from "@impower/codemirror-vscode-lsp-client/src";
import { setBreakpointStates } from "../../src/cm-breakpoints/breakpoints";
import {
  setChoiceMarkers,
  type ChoiceMarker,
} from "../../src/cm-choice-markers/choiceMarkers";
import { foldMarkerDOM } from "../../src/cm-fold-marks/foldMarks";
import EDITOR_EXTENSIONS from "../../src/modules/script-editor/constants/EDITOR_EXTENSIONS";
import EDITOR_THEME from "../../src/modules/script-editor/constants/EDITOR_THEME";

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

const choice = (line: number, pinned: boolean): ChoiceMarker => ({
  line,
  icon: pinned ? "pinned" : "auto",
  title: `Choice · line ${line}`,
  text: "",
  options: [],
  unpin: pinned,
});

const foldChoose = foldService.of((state, from) => {
  const line = state.doc.lineAt(from);
  if (line.text.trim() !== "choose") {
    return null;
  }
  const end = state.doc.line(line.number + 5);
  return { from: line.to, to: end.to };
});

const mount = (pointerCoarse: boolean) => {
  const parent = document.body.appendChild(document.createElement("section"));
  parent.dataset["pointer"] = pointerCoarse ? "coarse" : "fine";
  const view = new EditorView({
    state: EditorState.create({
      doc: SCRIPT,
      extensions: [
        coarsePointer.of(pointerCoarse),
        EDITOR_EXTENSIONS,
        EditorView.theme(EDITOR_THEME, { dark: true }),
        EditorView.editorAttributes.of({ class: "cm-line-numbers" }),
        codeFolding(),
        foldChoose,
        foldGutter({ markerDOM: foldMarkerDOM }),
      ],
    }),
    parent,
  });
  setBreakpointStates(view, [
    { line: 1, verified: true },
    { line: 3, verified: true },
    { line: 8, verified: false, message: "Not placed." },
  ]);
  return view;
};

const coarse = matchMedia("(pointer: coarse)").matches;
const view = mount(coarse);

const setPinned = (pinned: boolean) =>
  setChoiceMarkers(view, [choice(3, false), choice(5, pinned)]);

setPinned(false);

Object.assign(window, { gutterMarks: { view, setPinned, coarse } });
