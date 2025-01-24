import { completionKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
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
import { breakpoints } from "../../../cm-breakpoints/breakpoints";
import { indentationGuides } from "../../../cm-indentation-guides/indentationGuides";
import { indentedLineWrapping } from "../../../cm-indented-line-wrapping/indentedLineWrapping";
import { highlightExtraWhitespace } from "../../../cm-highlight-extra-whitespace/highlightExtraWhitespace";

const EDITOR_EXTENSIONS = [
  history(),
  breakpoints({ singular: true }),
  lineNumbers(),
  indentUnit.of("  "),
  highlightExtraWhitespace(),
  indentationGuides(),
  indentedLineWrapping(),
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
  EditorState.phrases.of({ "No diagnostics": "No problems" }),
];

export default EDITOR_EXTENSIONS;
