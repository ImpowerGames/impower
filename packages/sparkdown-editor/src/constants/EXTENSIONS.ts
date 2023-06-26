import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintGutter, lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import rainbowBrackets from "../cm-rainbowbrackets/rainbowBrackets";
import SPARKDOWN_HIGHLIGHTS from "./SPARKDOWN_HIGHLIGHTS";

const gutterCompartment = new Compartment();

const EXTENSIONS = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  gutterCompartment.of(lintGutter()),
  foldGutter({
    openText: "v",
    closedText: ">",
  }),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentUnit.of("  "),
  indentOnInput(),
  syntaxHighlighting(SPARKDOWN_HIGHLIGHTS),
  bracketMatching(),
  rainbowBrackets(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    indentWithTab,
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
  EditorView.lineWrapping,
  EditorState.phrases.of({ "No diagnostics": "No errors" }),
];

export default EXTENSIONS;
