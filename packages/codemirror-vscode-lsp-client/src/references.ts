import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Command,
  EditorView,
  KeyBinding,
  keymap,
  PanelConstructor,
  showPanel,
} from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClient, LSPClientExtension, WorkspaceMapping } from "./client";
import { LSPPlugin } from "./plugin";
import { WorkspaceFile } from "./workspace";

export const referencesTheme = EditorView.baseTheme({
  ".cm-lsp-reference-panel": {
    fontFamily: "monospace",
    whiteSpace: "pre",
    padding: "3px 6px",
    maxHeight: "120px",
    overflow: "auto",
    "& .cm-lsp-reference-file": {
      fontWeight: "bold",
    },
    "& .cm-lsp-reference": {
      cursor: "pointer",
      "&[aria-selected]": {
        backgroundColor: "#0077ee44",
      },
    },
    "& .cm-lsp-reference-line": {
      opacity: "0.7",
    },
  },
});

function getReferences(plugin: LSPPlugin, pos: number) {
  return plugin.client.request<
    lsp.ReferenceParams,
    lsp.Location[] | null,
    typeof lsp.ReferencesRequest.method
  >("textDocument/references", {
    textDocument: { uri: plugin.uri },
    position: plugin.toPosition(pos),
    context: { includeDeclaration: true },
  });
}

type ReferenceLocation = { file: WorkspaceFile; range: lsp.Range };

/// Ask the server to locate all references to the symbol at the
/// cursor. When the server can provide such references, show them as
/// a list in a panel.
export const findReferences: Command = (view) => {
  const plugin = LSPPlugin.get(view);
  if (!plugin || plugin.client.hasCapability("referencesProvider") === false)
    return false;
  plugin.client.sync();
  let mapping = plugin.client.workspaceMapping(),
    passedMapping = false;
  const pos = view.state.selection.main.head;
  getReferences(plugin, pos)
    .then(
      (response) => {
        if (!response) {
          return undefined;
        }
        return Promise.all(
          response.map((loc) =>
            plugin.client.workspace.requestFile(loc.uri).then((file) => {
              return file ? { file, range: loc.range } : null;
            }),
          ),
        ).then((resolved) => {
          let locs = resolved
            .filter((l) => l)
            .toSorted((a, b) => {
              const aMatches = a.file.getView() === view;
              const bMatches = b.file.getView() === view;

              if (aMatches && !bMatches) {
                return -1;
              } else if (!aMatches && bMatches) {
                return 1;
              } else {
                return 0;
              }
            });
          if (locs.length) {
            const initiallySelected = locs.findIndex((l) => {
              if (l.file.getView() === view) {
                const from = mapping.mapPosition(l.file.uri, l.range.start, 1);
                const to = mapping.mapPosition(l.file.uri, l.range.end, -1);
                if (pos >= from && pos <= to) {
                  return true;
                }
              }
              return false;
            });
            displayReferences(plugin.view, locs, mapping, initiallySelected);
            passedMapping = true;
          }
        });
      },
      (err) => plugin.reportError("Finding references failed", err),
    )
    .finally(() => {
      if (!passedMapping) mapping.destroy();
    });
  return true;
};

export function isReferencePanelOpen(state: EditorState) {
  return Boolean(state.field(referencesState, false));
}

/// Close the reference panel, if it is open.
export const closeReferencePanel: Command = (view) => {
  if (!view.state.field(referencesState, false)) return false;
  view.dispatch({ effects: setReferencePanel.of(null) });
  return true;
};

/**
 * Iterates over the references currently displayed in the reference panel.
 * @param state The EditorState to inspect.
 * @param f Callback invoked for each reference.
 * 'from' and 'to' are document-local offsets if the reference is in the current file.
 */
export function forEachReference(
  state: EditorState,
  f: (ref: ReferenceLocation, from: number | null, to: number | null) => void,
) {
  const refState = state.field(referencesState, false);
  if (!refState) return;

  for (const loc of refState.locs) {
    let from: number | null = null;
    let to: number | null = null;

    // If the reference is in the current file, map it to local offsets
    if (refState.uri && loc.file.uri === refState.uri) {
      from = refState.mapping.mapPosition(loc.file.uri, loc.range.start, 1);
      to = refState.mapping.mapPosition(loc.file.uri, loc.range.end, -1);
    }

    f(loc, from, to);
  }
}

type ReferenceState = {
  uri: string;
  locs: readonly ReferenceLocation[];
  mapping: WorkspaceMapping;
  panel: PanelConstructor;
};

const referencesState = StateField.define<ReferenceState | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (let e of tr.effects) if (e.is(setReferencePanel)) return e.value;
    return value;
  },
  provide: (f) => showPanel.from(f, (val) => (val ? val.panel : null)),
});

const setReferencePanel = StateEffect.define<ReferenceState | null>();

function displayReferences(
  view: EditorView,
  locs: readonly ReferenceLocation[],
  mapping: WorkspaceMapping,
  initiallySelected: number,
) {
  let panel = createReferencePanel(locs, mapping, initiallySelected);
  const plugin = LSPPlugin.get(view);
  const uri = plugin.uri;
  let data: ReferenceState = { uri, locs, mapping, panel };
  let effect =
    view.state.field(referencesState, false) === undefined
      ? StateEffect.appendConfig.of(referencesState.init(() => data))
      : setReferencePanel.of(data);
  view.dispatch({ effects: effect });
}

function createReferencePanel(
  locs: readonly ReferenceLocation[],
  mapping: WorkspaceMapping,
  initiallySelected: number,
): PanelConstructor {
  let created = false;
  // Make sure that if this panel isn't used, the mapping still gets destroyed
  setTimeout(() => {
    if (!created) mapping.destroy();
  }, 500);

  return (view) => {
    created = true;
    let prefixLen = findCommonPrefix(locs.map((l) => l.file.uri));
    let panel = document.createElement("div"),
      curFile = null;
    panel.className = "cm-lsp-reference-panel";
    panel.tabIndex = 0;
    panel.role = "listbox";
    panel.setAttribute("aria-label", view.state.phrase("Reference list"));
    let options: HTMLElement[] = [];
    for (let i = 0; i < locs.length; i++) {
      let { file, range } = locs[i];
      let fileName = file.uri.slice(prefixLen);
      if (fileName != curFile) {
        curFile = fileName;
        let header = panel.appendChild(document.createElement("div"));
        header.className = "cm-lsp-reference-file";
        header.textContent = fileName;
      }
      let entry = panel.appendChild(document.createElement("div"));
      entry.className = "cm-lsp-reference";
      entry.role = "option";
      let from = mapping.mapPosition(file.uri, range.start, 1),
        to = mapping.mapPosition(file.uri, range.end, -1);
      let view = file.getView();
      const line = (view ? view.state.doc : file.doc).lineAt(from);
      let lineNumber = entry.appendChild(document.createElement("span"));
      lineNumber.className = "cm-lsp-reference-line";
      lineNumber.textContent = (line.number + ": ").padStart(5, " ");
      let textBefore = line.text.slice(
        Math.max(0, from - line.from - 50),
        from - line.from,
      );
      if (textBefore)
        entry.appendChild(document.createTextNode(textBefore.trim()));
      entry.appendChild(document.createElement("strong")).textContent =
        line.text.slice(from - line.from, to - line.from);
      let textAfter = line.text.slice(
        to - line.from,
        Math.min(line.length, 100 - textBefore.length),
      );
      if (textAfter) entry.appendChild(document.createTextNode(textAfter));
      if (initiallySelected === i) entry.setAttribute("aria-selected", "true");
      options.push(entry);
    }

    function curSelection() {
      for (let i = 0; i < options.length; i++) {
        if (options[i].hasAttribute("aria-selected")) return i;
      }
      return 0;
    }
    function setSelection(index: number) {
      for (let i = 0; i < options.length; i++) {
        if (i == index) options[i].setAttribute("aria-selected", "true");
        else options[i].removeAttribute("aria-selected");
      }
    }
    function showReference(index: number) {
      let { file, range } = locs[index];
      let plugin = LSPPlugin.get(view);
      if (!plugin) return;
      plugin.client.workspace.displayFile(
        { uri: file.uri, selection: range, takeFocus: false },
        "select.reference",
      );
    }

    panel.addEventListener("keydown", (event) => {
      if (event.keyCode == 27) {
        // Escape
        closeReferencePanel(view);
        view.focus();
      } else if (event.keyCode == 38 || event.keyCode == 33) {
        // ArrowUp, PageUp
        setSelection((curSelection() - 1 + locs.length) % locs.length);
      } else if (event.keyCode == 40 || event.keyCode == 34) {
        // ArrowDown, PageDown
        setSelection((curSelection() + 1) % locs.length);
      } else if (event.keyCode == 36) {
        // Home
        setSelection(0);
      } else if (event.keyCode == 35) {
        // End
        setSelection(options.length - 1);
      } else if (event.keyCode == 13 || event.keyCode == 10) {
        // Enter, Space
        showReference(curSelection());
      } else {
        return;
      }
      event.preventDefault();
    });
    panel.addEventListener("click", (event) => {
      for (let i = 0; i < options.length; i++) {
        if (options[i].contains(event.target as HTMLElement)) {
          setSelection(i);
          showReference(i);
          event.preventDefault();
        }
      }
    });
    let dom = document.createElement("div");
    dom.appendChild(panel);
    let close = dom.appendChild(document.createElement("button"));
    close.className = "cm-dialog-close";
    close.textContent = "×";
    close.addEventListener("click", () => closeReferencePanel(view));
    close.setAttribute("aria-label", view.state.phrase("close"));

    return {
      dom,
      destroy: () => mapping.destroy(),
      mount: () => panel.focus(),
    };
  };
}

function findCommonPrefix(uris: string[]) {
  let first = uris[0],
    prefix = first.length;
  for (let i = 1; i < uris.length; i++) {
    let uri = uris[i],
      j = 0;
    for (
      let e = Math.min(prefix, uri.length);
      j < e && first[j] == uri[j];
      j++
    ) {}
    prefix = j;
  }
  while (prefix && first[prefix - 1] != "/") prefix--;
  return prefix;
}

/// Binds Shift-F12 to [`findReferences`](#lsp-client.findReferences)
/// and Escape to
/// [`closeReferencePanel`](#lsp-client.closeReferencePanel).
export const findReferencesKeymap: readonly KeyBinding[] = [
  { key: "Shift-F12", run: findReferences, preventDefault: true },
  { key: "Escape", run: closeReferencePanel },
];

export function serverReferences(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        references: {},
      },
    },
    onRefreshTextDocumentContent: (client: LSPClient) => {
      for (const file of client.workspace.files) {
        const view = file.getView();
        if (view) {
          if (isReferencePanelOpen(view.state)) {
            findReferences(view);
          }
        }
      }
    },
    editorExtension: [referencesTheme, keymap.of([...findReferencesKeymap])],
  };
}
