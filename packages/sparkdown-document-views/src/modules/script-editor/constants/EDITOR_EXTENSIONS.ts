import { history } from "@codemirror/commands";
import { ensureSyntaxTree, indentUnit, syntaxTree } from "@codemirror/language";
import { EditorState, Line } from "@codemirror/state";
import { vscodeWordSelection } from "@impower/codemirror-vscode-lsp-client/src";
import { isExecutionGapLine } from "@impower/sparkdown/src/compiler/utils/isExecutionGapLine";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLineGutter,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { breakpoints } from "../../../cm-breakpoints/breakpoints";
import { highlightExtraWhitespace } from "../../../cm-highlight-extra-whitespace/highlightExtraWhitespace";
import { highlightLines } from "../../../cm-highlight-lines/highlightLines";
import { indentedLineWrapping } from "../../../cm-indented-line-wrapping/indentedLineWrapping";
import { choiceMarkers } from "../../../cm-choice-markers/choiceMarkers";
import { lineBands } from "../../../cm-line-bands/lineBands";
import { pinpoints } from "../../../cm-pinpoints/pinpoints";
import { problemMarks } from "../../../cm-problem-marks/problemMarks";
import { editorFixes } from "../utils/extensions/editorFixes";
import { findMatches } from "../utils/extensions/findMatches";

const carriesFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

const deferFileDropsToApp = EditorView.domEventHandlers({
  drop: (event) => carriesFiles(event),
  dragover: (event) => carriesFiles(event),
});

const PARSE_TIMEOUT_MS = 100;

export const isExecutionGap = (line: Line, state: EditorState) =>
  isExecutionGapLine(
    () =>
      ensureSyntaxTree(state, line.to, PARSE_TIMEOUT_MS) ?? syntaxTree(state),
    line.from,
    line.text,
  );

const EDITOR_EXTENSIONS = [
  history(),
  deferFileDropsToApp,
  pinpoints(),
  breakpoints(),
  lineNumbers(),
  indentUnit.of("  "),
  indentedLineWrapping(),
  drawSelection(),
  lineBands(),
  choiceMarkers(),
  problemMarks(),
  editorFixes(),
  findMatches(),
  dropCursor(),
  crosshairCursor(),
  rectangularSelection(),
  vscodeWordSelection,
  highlightActiveLineGutter(),
  highlightExtraWhitespace(),
  highlightLines({ isGap: isExecutionGap }),
  EditorView.lineWrapping,
  EditorState.allowMultipleSelections.of(true),
  EditorState.phrases.of({ "No diagnostics": "No problems" }),
];

export default EDITOR_EXTENSIONS;
