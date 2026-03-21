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

const CHEVRON_SVG_URL = `url('data:image/svg+xml;utf8,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="black"><path d="M7.97612 10.0719L12.3334 5.7146L12.9521 6.33332L8.28548 11L7.66676 11L3.0001 6.33332L3.61882 5.7146L7.97612 10.0719Z"/></svg>')`;

export const referencesTheme = EditorView.baseTheme({
  ".cm-lsp-reference-panel": {
    display: "flex",
    flexDirection: "column",
    maxHeight: "300px",
    backgroundColor: "inherit",
    color: "#cccccc",
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: "13px",
  },
  ".cm-lsp-reference-container": {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  ".cm-lsp-reference-list": {
    overflowY: "auto",
    backgroundColor: "inherit",
    outline: "none",
  },
  ".cm-lsp-reference-file": {
    padding: "4px 8px",
    display: "flex",
    alignItems: "center",
    position: "sticky",
    top: 0,
    zIndex: 1,
    cursor: "pointer",
    userSelect: "none",
    backgroundColor: "inherit",
  },
  ".cm-lsp-reference": {
    fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
    position: "relative",
    padding: "4px 32px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "flex",
    gap: "8px",
    "&[aria-selected]": {
      backgroundColor: "#04395e",
      color: "#ffffff",
      outline: "1px solid #007acc",
      outlineOffset: "-1px",
    },
  },
  ".cm-lsp-reference-line": {
    color: "#858585",
    minWidth: "25px",
    textAlign: "right",
    cursor: "pointer",
    userSelect: "none",
  },
  ".cm-dialog-close": {
    position: "absolute",
    right: "5px",
    top: "2px",
    background: "none",
    border: "none",
    color: "#ffffff",
    cursor: "pointer",
    zIndex: 10,
  },
  ".cm-lsp-collapse-icon": {
    display: "inline-block",
    width: "16px",
    height: "16px",
    marginRight: "7px",
    backgroundColor: "currentColor",
    maskImage: CHEVRON_SVG_URL,
    webkitMaskImage: CHEVRON_SVG_URL,
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
  },
  ".cm-lsp-file-collapsed .cm-lsp-collapse-icon": {
    transform: "rotate(-90deg)",
  },
  ".cm-lsp-reference-group": {
    display: "block",
  },
  ".cm-lsp-file-collapsed + .cm-lsp-reference-group": {
    display: "none",
  },

  ".cm-lsp-reference:active::after": {
    content: "''",
    position: "absolute",
    inset: "0",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  ".cm-lsp-reference-file:active::after": {
    content: "''",
    position: "absolute",
    inset: "0",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  ".cm-dialog-close:active": { color: "#007acc" },
  "@media (hover: hover) and (pointer: fine)": {
    ".cm-lsp-reference:hover::after": {
      content: "''",
      position: "absolute",
      inset: "0",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
    },
    ".cm-lsp-reference-file:hover::after": {
      content: "''",
      position: "absolute",
      inset: "0",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
    },
    ".cm-dialog-close:hover": { color: "#007acc" },
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

export interface ReferenceLocation {
  file: WorkspaceFile;
  range: lsp.Range;
}

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
        if (!response) return undefined;
        return Promise.all(
          response.map((loc) =>
            plugin.client.workspace.requestFile(loc.uri).then((file) => {
              return file ? { file, range: loc.range } : null;
            }),
          ),
        ).then((resolved) => {
          let locs = resolved.filter((l): l is ReferenceLocation => Boolean(l));
          if (locs.length) {
            const initiallySelected = locs.findIndex((l) => {
              if (l.file.getView() === view) {
                const from = mapping.mapPosition(l.file.uri, l.range.start, 1);
                const to = mapping.mapPosition(l.file.uri, l.range.end, -1);
                if (pos >= from && pos <= to) return true;
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

export const closeReferencePanel: Command = (view) => {
  if (!view.state.field(referencesState, false)) return false;
  view.dispatch({ effects: setReferencePanel.of(null) });
  return true;
};

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
  setTimeout(() => {
    if (!created) mapping.destroy();
  }, 500);

  return (view) => {
    created = true;
    let prefixLen = findCommonPrefix(locs.map((l) => l.file.uri));
    let dom = document.createElement("div");
    dom.className = "cm-lsp-reference-panel";

    let listContainer = dom.appendChild(document.createElement("div"));
    listContainer.className = "cm-lsp-reference-list";
    listContainer.role = "listbox";
    listContainer.tabIndex = 0;

    let options: HTMLElement[] = [];
    let curFile = null;
    let currentGroup: HTMLElement | null = null;

    for (let i = 0; i < locs.length; i++) {
      let { file, range } = locs[i];
      let fileName = file.uri.slice(prefixLen);

      if (fileName !== curFile) {
        curFile = fileName;
        const header = listContainer.appendChild(document.createElement("div"));
        header.className = "cm-lsp-reference-file";

        const collapseIcon = header.appendChild(document.createElement("span"));
        collapseIcon.className = "cm-lsp-collapse-icon";

        header.appendChild(document.createTextNode(fileName));

        currentGroup = listContainer.appendChild(document.createElement("div"));
        currentGroup.className = "cm-lsp-reference-group";

        header.onclick = (e) => {
          header.classList.toggle("cm-lsp-file-collapsed");
          e.stopPropagation();
        };
      }

      let entry = currentGroup!.appendChild(document.createElement("div"));
      entry.className = "cm-lsp-reference";
      entry.role = "option";

      let from = mapping.mapPosition(file.uri, range.start, 1);
      let to = mapping.mapPosition(file.uri, range.end, -1);
      let fileDoc = file.getView()?.state.doc || file.doc;
      const line = fileDoc.lineAt(Math.min(from, fileDoc.length));

      let snippet = entry.appendChild(document.createElement("span"));
      let textBefore = line.text
        .slice(0, Math.max(0, from - line.from))
        .trimStart();
      let matchText = line.text.slice(
        Math.max(0, from - line.from),
        Math.max(0, to - line.from),
      );
      let textAfter = line.text.slice(Math.max(0, to - line.from));

      snippet.appendChild(document.createTextNode(textBefore));
      let matchSpan = snippet.appendChild(document.createElement("span"));
      matchSpan.className = "cm-lsp-reference-match cm-selectionBackground";
      matchSpan.textContent = matchText;
      snippet.appendChild(document.createTextNode(textAfter));

      if (initiallySelected === i) {
        entry.setAttribute("aria-selected", "true");
        // Ensure parent is expanded if initially selected
        let header = currentGroup!.previousElementSibling as HTMLElement;
        if (header?.classList.contains("cm-lsp-file-collapsed")) {
          header.classList.remove("cm-lsp-file-collapsed");
        }
        setTimeout(() => entry.scrollIntoView({ block: "center" }), 0);
      }

      options.push(entry);
    }

    function setSelection(index: number) {
      let targetIndex = index;
      const prevIdx = options.findIndex((o) => o.hasAttribute("aria-selected"));
      const step = index > prevIdx ? 1 : -1;

      // Skip collapsed items
      while (
        options[targetIndex] &&
        options[targetIndex].offsetParent === null
      ) {
        targetIndex += step;
      }

      if (targetIndex < 0 || targetIndex >= options.length) return;

      options.forEach((opt, i) => {
        if (i === targetIndex) {
          opt.setAttribute("aria-selected", "true");
          opt.scrollIntoView({ block: "nearest" });
          showReference(i, false);
        } else {
          opt.removeAttribute("aria-selected");
        }
      });
    }

    function showReference(index: number, takeFocus: boolean) {
      let { file, range } = locs[index];
      let plugin = LSPPlugin.get(view);
      if (!plugin) return;
      plugin.client.workspace.displayFile(
        { uri: file.uri, selection: range, takeFocus },
        "select.reference",
      );
    }

    listContainer.addEventListener("keydown", (e) => {
      const idx = options.findIndex((o) => o.hasAttribute("aria-selected"));
      if (e.key === "ArrowUp") setSelection(idx - 1);
      else if (e.key === "ArrowDown") setSelection(idx + 1);
      else if (e.key === "Enter") {
        showReference(idx, true);
        closeReferencePanel(view);
      } else if (e.key === "Escape") {
        closeReferencePanel(view);
        view.focus();
      } else return;
      e.preventDefault();
    });

    listContainer.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest(".cm-lsp-reference");
      if (target) {
        const idx = options.indexOf(target as HTMLElement);
        setSelection(idx);
        if (e.detail === 2) {
          showReference(idx, true);
          closeReferencePanel(view);
        }
      }
    });

    let close = dom.appendChild(document.createElement("button"));
    close.className = "cm-dialog-close";
    close.textContent = "×";
    close.onclick = () => closeReferencePanel(view);

    return {
      dom,
      destroy: () => mapping.destroy(),
      mount: () => listContainer.focus(),
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

export const findReferencesKeymap: readonly KeyBinding[] = [
  { key: "Shift-F12", run: findReferences, preventDefault: true },
  { key: "Escape", run: closeReferencePanel },
];

export function serverReferences(): LSPClientExtension {
  return {
    clientCapabilities: { textDocument: { references: {} } },
    onRefreshTextDocumentContent: (client: LSPClient) => {
      for (const file of client.workspace.files) {
        const view = file.getView();
        if (view && isReferencePanelOpen(view.state)) findReferences(view);
      }
    },
    editorExtension: [referencesTheme, keymap.of([...findReferencesKeymap])],
  };
}
