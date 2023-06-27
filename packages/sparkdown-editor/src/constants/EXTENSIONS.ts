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
  foldKeymap,
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
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { indentationGuides } from "../cm-indentation-guides/indentationGuides";
import { indentedLineWrapping } from "../cm-indented-line-wrapping/indentedLineWrapping";
import rainbowBrackets from "../cm-rainbowbrackets/rainbowBrackets";
import { whitespaceMarkers } from "../cm-whitespace-markers/whitespaceMarkers";
import SPARKDOWN_HIGHLIGHTS from "./SPARKDOWN_HIGHLIGHTS";

const gutterCompartment = new Compartment();

const EXTENSIONS = [
  lineNumbers(),
  highlightActiveLineGutter(),
  history(),
  gutterCompartment.of(lintGutter()),
  indentationGuides(),
  indentedLineWrapping(),
  whitespaceMarkers(),
  drawSelection(),
  dropCursor(),
  indentUnit.of("  "),
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
