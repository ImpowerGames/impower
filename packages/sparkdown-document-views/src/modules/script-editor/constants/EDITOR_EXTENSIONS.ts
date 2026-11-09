import { history } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
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
import { lineBands } from "../../../cm-line-bands/lineBands";
import { pinpoints } from "../../../cm-pinpoints/pinpoints";
import { problemMarks } from "../../../cm-problem-marks/problemMarks";
import { findMatches } from "../utils/extensions/findMatches";

const carriesFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

const deferFileDropsToApp = EditorView.domEventHandlers({
  drop: (event) => carriesFiles(event),
  dragover: (event) => carriesFiles(event),
});

const DIALOGUE_CUE = /^[^:]+:$/;

export const isExecutionGap = (text: string) => {
  const trimmedText = text.trim();
  return (
    !trimmedText ||
    trimmedText.startsWith("//") ||
    DIALOGUE_CUE.test(trimmedText)
  );
};

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
  problemMarks(),
  findMatches(),
  dropCursor(),
  crosshairCursor(),
  rectangularSelection(),
  highlightActiveLineGutter(),
  highlightExtraWhitespace(),
  highlightLines({ isGap: isExecutionGap }),
  EditorView.lineWrapping,
  EditorState.allowMultipleSelections.of(true),
  EditorState.phrases.of({ "No diagnostics": "No problems" }),
];

export default EDITOR_EXTENSIONS;
