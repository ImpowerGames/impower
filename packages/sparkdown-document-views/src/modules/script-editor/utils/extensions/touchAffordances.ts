import { Compartment, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  coarsePointer,
  hideContextMenu,
  isContextMenuOpen,
  showContextMenu,
} from "@impower/codemirror-vscode-lsp-client/src";
import { isKeyboardToolbarOpen, setKeyboardToolbar } from "./keyboardToolbar";
import { mobileViewportManager } from "./mobileViewportManager";
import { touchInputHandler } from "./touchInputHandler";

const touchAffordancesConfig = new Compartment();

const affordances = (coarse: boolean): Extension => [
  coarsePointer.of(coarse),
  coarse
    ? [
        touchInputHandler({
          showContextMenu,
          hideContextMenu,
          isContextMenuOpen,
        }),
        mobileViewportManager(),
      ]
    : [],
];

export function touchAffordances(coarse: boolean): Extension {
  return touchAffordancesConfig.of(affordances(coarse));
}

export function setCoarsePointer(view: EditorView, coarse: boolean): void {
  if (view.state.facet(coarsePointer) === coarse) {
    return;
  }
  view.dispatch({
    effects: [
      touchAffordancesConfig.reconfigure(affordances(coarse)),
      ...(!coarse && isKeyboardToolbarOpen(view.state)
        ? [setKeyboardToolbar.of(null)]
        : []),
    ],
  });
}
