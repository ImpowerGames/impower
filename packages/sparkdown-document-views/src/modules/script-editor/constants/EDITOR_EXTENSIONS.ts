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

// Let OS file drops reach the app instead of being pasted as text.
//
// CodeMirror's built-in `drop` handler reads any dropped file with a
// FileReader and inserts the result into the document -- so dragging an
// image or a script onto the editor dumps its raw contents into the
// screenplay. The app already imports dropped files properly (routing them
// to `assets/` or `scripts/`) from a window-level handler.
//
// Returning `true` from a `domEventHandlers` handler makes CodeMirror call
// `preventDefault()` and stop running handlers for that event, which skips
// the built-in text insertion. It does NOT stop propagation, so the event
// still bubbles to the window-level importer.
//
// The discriminator is `dataTransfer.types` containing "Files": an OS file
// drag advertises it, whereas dragging a text selection within the editor
// advertises `text/plain`. So internal drag-and-drop of text is untouched.
const carriesFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

const deferFileDropsToApp = EditorView.domEventHandlers({
  drop: (event) => carriesFiles(event),
  // Also claim `dragover` so the drop caret doesn't track a file drag and
  // imply the file is about to be inserted at that position.
  dragover: (event) => carriesFiles(event),
});

const EDITOR_EXTENSIONS = [
  history(),
  deferFileDropsToApp,
  // TODO: breakpoints({}),
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
  EditorState.phrases.of({ "No diagnostics": "No problems" }),
];

export default EDITOR_EXTENSIONS;
