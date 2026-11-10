import type { EditorState } from "@codemirror/state";
import {
  coarsePointer,
  contextMenu,
} from "@impower/codemirror-vscode-lsp-client/src";
import { hasBreakpointAt, toggleBreakpointAtCaret } from "./breakpoints";

const offers = (on: boolean) => (state: EditorState) =>
  state.facet(coarsePointer) &&
  hasBreakpointAt(state, state.doc.lineAt(state.selection.main.head).from) ===
    on;

export const breakpointMenu = () =>
  contextMenu({
    items: [
      { type: "separator" },
      {
        label: "Add breakpoint",
        command: (view) => toggleBreakpointAtCaret(view),
        when: offers(false),
        keepsSelection: true,
      },
      {
        label: "Remove breakpoint",
        command: (view) => toggleBreakpointAtCaret(view),
        when: offers(true),
        keepsSelection: true,
      },
    ],
  });
