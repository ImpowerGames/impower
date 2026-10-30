import { completionKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { searchKeymap } from "@codemirror/search";
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
import { highlightExtraWhitespace } from "../../../cm-highlight-extra-whitespace/highlightExtraWhitespace";
import { highlightLines } from "../../../cm-highlight-lines/highlightLines";
import { indentationGuides } from "../../../cm-indentation-guides/indentationGuides";
import { indentedLineWrapping } from "../../../cm-indented-line-wrapping/indentedLineWrapping";
import { pinpoints } from "../../../cm-pinpoints/pinpoints";

const carriesFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

const deferFileDropsToApp = EditorView.domEventHandlers({
  drop: (event) => carriesFiles(event),
  dragover: (event) => carriesFiles(event),
});

const EDITOR_EXTENSIONS = [
  history(),
  deferFileDropsToApp,
  pinpoints(),
  lineNumbers(),
  indentUnit.of("  "),
  indentationGuides(),
  indentedLineWrapping(),
  drawSelection(),
  dropCursor(),
  crosshairCursor(),
  rectangularSelection(),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  highlightExtraWhitespace(),
  highlightLines({
    isGap: (text: string) => {
      const trimmedText = text.trim();
      return !trimmedText || trimmedText.startsWith("//");
    },
  }),
  keymap.of([
    indentWithTab,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
  EditorView.lineWrapping,
  EditorState.allowMultipleSelections.of(true),
  EditorState.phrases.of({ "No diagnostics": "No problems" }),
];

export default EDITOR_EXTENSIONS;
