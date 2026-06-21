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
  rectangularSelection,
} from "@codemirror/view";
import { breakpointGutter } from "../../../cm-breakpoints/breakpoints";
import { highlightExtraWhitespace } from "../../../cm-highlight-extra-whitespace/highlightExtraWhitespace";
import { highlightLines } from "../../../cm-highlight-lines/highlightLines";
import { indentationGuides } from "../../../cm-indentation-guides/indentationGuides";
import { indentedLineWrapping } from "../../../cm-indented-line-wrapping/indentedLineWrapping";
import { pinpoints } from "../../../cm-pinpoints/pinpoints";

const EDITOR_EXTENSIONS = [
  history(),
  // `breakpointGutter()` provides the breakpoint gutter AND the line-number
  // gutter (with click-to-toggle), so it replaces a standalone lineNumbers().
  // The breakpointsField itself is registered by createEditorView via
  // breakpointsField.init(...), so we add only the gutter UI here.
  breakpointGutter({}),
  pinpoints(),
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
