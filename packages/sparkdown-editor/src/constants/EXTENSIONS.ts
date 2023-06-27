import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
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

const EXTENSIONS = [
  history(),
  lineNumbers(),
  lintGutter(),
  indentUnit.of("  "),
  indentationGuides(),
  indentedLineWrapping(),
  whitespaceMarkers(),
  drawSelection(),
  dropCursor(),
  crosshairCursor(),
  rectangularSelection(),
  syntaxHighlighting(SPARKDOWN_HIGHLIGHTS),
  rainbowBrackets(),
  autocompletion(),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  highlightSelectionMatches(),
  keymap.of([
    indentWithTab,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
  EditorView.lineWrapping,
  EditorState.phrases.of({ "No diagnostics": "No errors" }),
];

export default EXTENSIONS;
