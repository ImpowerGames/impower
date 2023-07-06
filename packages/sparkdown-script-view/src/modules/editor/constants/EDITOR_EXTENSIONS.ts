import { completionKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { lintGutter, lintKeymap } from "@codemirror/lint";
import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
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
import { indentationGuides } from "../../../cm-indentation-guides/indentationGuides";
import { indentedLineWrapping } from "../../../cm-indented-line-wrapping/indentedLineWrapping";
import { whitespaceMarkers } from "../../../cm-whitespace-markers/whitespaceMarkers";

const EDITOR_EXTENSIONS = [
  history(),
  search(),
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

export default EDITOR_EXTENSIONS;
