import { StateEffect, StateField } from "@codemirror/state";
import {
  Command,
  EditorView,
  KeyBinding,
  keymap,
  showTooltip,
  Tooltip,
} from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

export const renameTheme = EditorView.baseTheme({
  ".cm-lsp-rename-tooltip": {
    display: "flex",
    alignItems: "stretch",
    gap: "4px",
    padding: "8px",
  },
  ".cm-lsp-rename-input": {
    fontSize: "16px",
    flexGrow: "1",
    borderRadius: "6px",
    backgroundColor: " #313131",
    color: "white",
    border: "1px solid #3c3c3c",
    outline: "none",
    padding: "4px",
    fontFamily: "inherit",
    minWidth: "150px",
    "&:focus": {
      border: "1px solid #2488db",
    },
  },
  ".cm-lsp-rename-submit": {
    background: "#0078d4",
    color: "white",
    border: "none",
    borderRadius: "2px",
    padding: "6px 12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    "&:disabled": {
      opacity: "0.5",
      cursor: "not-allowed",
    },
  },
});

const openRename = StateEffect.define<{
  pos: number;
  end: number;
  word: string;
  placeholder?: string;
}>();
const closeRename = StateEffect.define<null>();

const renameField = StateField.define<Tooltip | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (let effect of tr.effects) {
      if (effect.is(openRename)) return createRenameTooltip(effect.value);
      if (effect.is(closeRename)) return null;
    }
    return value;
  },
  provide: (f) => showTooltip.from(f),
});

function createRenameTooltip(spec: {
  pos: number;
  end: number;
  word: string;
}): Tooltip {
  const { pos, end, word } = spec;
  return {
    pos,
    end,
    arrow: false,
    create(view) {
      const dom = document.createElement("div");
      dom.className = "cm-lsp-rename-tooltip";

      const input = dom.appendChild(document.createElement("div"));
      input.textContent = word;
      input.className = "cm-textfield cm-lsp-rename-input";
      input.setAttribute("contenteditable", "true");
      input.setAttribute("name", "line");
      input.setAttribute("spellcheck", "false");
      input.setAttribute("autocorrect", "off");
      input.setAttribute("writingsuggestions", "false");
      input.setAttribute("translate", "no");
      input.setAttribute("role", "textbox");
      input.setAttribute("aria-multiline", "true");
      input.setAttribute("aria-autocomplete", "list");
      input.ariaLabel = view.state.phrase("Rename");
      input.addEventListener("input", () => {
        if (!input.textContent) {
          // Force-clear hidden <br> tags
          input.innerHTML = "";
        }
      });

      const button = dom.appendChild(document.createElement("button"));
      button.className = "cm-lsp-rename-submit";
      button.textContent = view.state.phrase("Rename");

      dom.onmousedown = (e) => {
        // Prevent tooltip from closing when clicking inside the tooltip
        e.stopPropagation();
      };

      const close = () => {
        view.dispatch({ effects: closeRename.of(null) });
        view.focus();
      };

      const submit = () => {
        if (input.textContent && input.textContent !== word) {
          doRename(view, input.textContent, pos);
        }
        close();
      };

      const handleOutsideClick = (event: MouseEvent) => {
        const path = event.composedPath();
        const includesTooltip = path.some(
          (n) =>
            n instanceof HTMLElement &&
            n.classList.contains("cm-lsp-rename-tooltip"),
        );
        if (!includesTooltip) {
          close();
        }
      };

      requestAnimationFrame(() => {
        window.addEventListener("pointerdown", handleOutsideClick);
      });

      button.onclick = (e) => {
        e.preventDefault();
        submit();
      };

      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      };

      setTimeout(() => {
        input.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(input);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }, 0);

      return {
        dom,
        destroy() {
          window.removeEventListener("mousedown", handleOutsideClick);
        },
      };
    },
  };
}

/// This command will, if the cursor is over a word, prompt the user
/// for a new name for that symbol, and ask the language server to
/// perform a rename of that symbol.
///
/// Note that this may affect files other than the one loaded into
/// this view. See the
/// [`Workspace.updateFile`](#lsp-client.Workspace.updateFile)
/// method.
export const renameSymbol: Command = (view) => {
  const plugin = LSPPlugin.get(view);

  if (!plugin || !plugin.client.hasCapability("renameProvider")) {
    return false;
  }

  const pos = view.state.selection.main.head;
  const defaultWordSelectionRange = view.state.wordAt(pos);
  const word = view.state.sliceDoc(
    defaultWordSelectionRange.from,
    defaultWordSelectionRange.to,
  );

  const serverRenameCapabilities =
    plugin.client.serverCapabilities.renameProvider;
  const shouldPrepareRename =
    typeof serverRenameCapabilities === "object" &&
    serverRenameCapabilities &&
    serverRenameCapabilities.prepareProvider;

  plugin.client.sync();

  if (shouldPrepareRename) {
    plugin.client.withMapping(async (mapping) => {
      const prepareResult = await plugin.client.request<
        lsp.PrepareRenameParams,
        lsp.PrepareRenameResult,
        typeof lsp.PrepareRenameRequest.method
      >("textDocument/prepareRename", {
        position: plugin.toPosition(pos),
        textDocument: { uri: plugin.uri },
      });
      const uri = plugin.uri;
      const file = plugin.client.workspace.getFile(uri);
      if (prepareResult != null) {
        if (!("defaultBehavior" in prepareResult)) {
          const range =
            "range" in prepareResult ? prepareResult.range : prepareResult;
          const placeholder =
            "placeholder" in prepareResult
              ? prepareResult.placeholder
              : undefined;
          const from = mapping.mapPosition(uri, range.start, 1);
          const to = mapping.mapPosition(uri, range.end, -1);
          const word = file.doc.sliceString(from, to);
          view.dispatch({
            effects: openRename.of({ pos: from, end: to, word, placeholder }),
          });
        } else if (prepareResult.defaultBehavior) {
          const from = mapping.mapPos(uri, pos, 1);
          view.dispatch({
            effects: openRename.of({ pos: from, end: from, word }),
          });
        }
      }
    });
  } else {
    view.dispatch({
      effects: openRename.of({
        pos: defaultWordSelectionRange.from,
        end: defaultWordSelectionRange.to,
        word,
      }),
    });
  }

  return true;
};

const doRename = async (view: EditorView, newName: string, pos: number) => {
  const plugin = LSPPlugin.get(view);
  if (!plugin) return false;
  plugin.client.sync();
  plugin.client
    .request<
      lsp.RenameParams,
      lsp.WorkspaceEdit | null,
      typeof lsp.RenameRequest.method
    >("textDocument/rename", {
      newName,
      position: plugin.toPosition(pos),
      textDocument: { uri: plugin.uri },
    })
    .then(
      (edit) => {
        if (!edit) return;
        plugin.client.workspace.updateFiles({ edit }, "rename");
      },
      (err) => {
        plugin.reportError("Rename request failed", err);
      },
    );

  return true;
};

/// A keymap that binds F2 to [`renameSymbol`](#lsp-client.renameSymbol).
export const renameKeymap: readonly KeyBinding[] = [
  { key: "F2", run: renameSymbol, preventDefault: true },
];

export function serverRenaming(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        rename: {
          prepareSupport: true,
        },
      },
    },
    editorExtension: [renameTheme, renameField, keymap.of([...renameKeymap])],
  };
}
