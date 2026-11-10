import type { EditorState } from "@codemirror/state";
import {
  coarsePointer,
  contextMenu,
} from "@impower/codemirror-vscode-lsp-client/src";
import { hasBreakpointAt, toggleBreakpointAtCaret } from "./breakpoints";

const offers = (on: boolean) => (state: EditorState, pos: number) =>
  state.facet(coarsePointer) &&
  hasBreakpointAt(state, state.doc.lineAt(pos).from) === on;

export const breakpointMenu = () =>
  contextMenu({
    items: [
      { type: "separator" },
      {
        label: "Add breakpoint",
        command: (view) => toggleBreakpointAtCaret(view),
        when: offers(false),
      },
      {
        label: "Remove breakpoint",
        command: (view) => toggleBreakpointAtCaret(view),
        when: offers(true),
      },
    ],
  });
