import {
  autocompletion,
  Completion,
  CompletionContext,
  CompletionSource,
  insertCompletionText,
  pickedCompletion,
  snippet,
  startCompletion,
} from "@codemirror/autocomplete";
import { EditorState, Extension } from "@codemirror/state";
import { Direction, EditorView, Rect } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

const completionTheme = EditorView.baseTheme({
  "& .cm-tooltip": {
    fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`,
    fontSize: "0.96em",
    border: `solid 1px #FFFFFF21`,
    borderRadius: "4px",
  },
  "& .cm-tooltip pre": {
    margin: "4px 8px",
  },
  "& .cm-tooltip.cm-tooltip-autocomplete": {
    minWidth: "min(90vw, 400px)",
  },
  "& .cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    padding: "3px 10px 3px 2px",
  },
  "& .cm-tooltip.cm-completionInfo pre": {
    margin: "0",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-right": {
    marginTop: "-1px",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-left": {
    marginTop: "-1px",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-right-above": {
    marginBottom: "-2px",
    left: "-1px",
    width: "calc(100% + 2px)",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-left-above": {
    marginBottom: "-2px",
    top: "-1px",
    left: "-1px",
    width: "calc(100% + 2px)",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-right-below": {
    marginTop: "-2px",
    left: "-1px",
    width: "calc(100% + 2px)",
  },
  "& .cm-tooltip.cm-completionInfo.cm-completionInfo-left-below": {
    marginTop: "-2px",
    top: "-1px",
    left: "-1px",
    width: "calc(100% + 2px)",
  },

  ".cm-tooltip.cm-tooltip-autocomplete > ul > li:active:not(:disabled)": {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  "@media (hover: hover) and (pointer: fine)": {
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li:hover:not(:disabled)": {
      backgroundColor: "rgba(255, 255, 255, 0.06)",
    },
  },
});

export const enum Info {
  Margin = 30,
  Width = 400,
}

const positionInfo = (
  view: EditorView,
  list: Rect,
  _option: Rect,
  info: Rect,
  space: Rect,
) => {
  let offset = 0;
  let maxWidth = 0;
  const rtl = view.textDirection == Direction.RTL;
  let left = rtl;
  let narrow = false;
  let side = "top";
  let vertical = "";
  let spaceLeft = list.left - space.left;
  const spaceRight = space.right - list.right;
  const infoWidth = info.right - info.left;
  const infoHeight = info.bottom - info.top;
  if (left && spaceLeft < Math.min(infoWidth, spaceRight)) left = false;
  else if (!left && spaceRight < Math.min(infoWidth, spaceLeft)) left = true;
  if (infoWidth <= (left ? spaceLeft : spaceRight)) {
    // Wide screen
    offset =
      Math.max(space.top, Math.min(list.top, space.bottom - infoHeight)) -
      list.top;
    maxWidth = Math.min(Info.Width, left ? spaceLeft : spaceRight);
  } else {
    // Narrow screen
    narrow = true;
    maxWidth = Math.min(
      Info.Width,
      (rtl ? list.right : space.right - list.left) - Info.Margin,
    );
    let spaceBelow = space.bottom - list.bottom;
    if (spaceBelow >= infoHeight || spaceBelow > list.top) {
      // Show info below the completion
      vertical = "below";
      offset = list.bottom - list.top;
    } else {
      // Show info above the completion
      vertical = "above";
      side = "bottom";
      offset = list.bottom - list.top;
    }
  }
  return {
    style: `${side}: ${offset}px; max-width: ${maxWidth}px`,
    class:
      "cm-completionInfo-" +
      (narrow
        ? rtl
          ? `left-${vertical}`
          : `right-${vertical}`
        : left
          ? "left"
          : "right"),
  };
};

export const getValidFor = (triggerCharacters: string[] | undefined) => {
  const chars = triggerCharacters
    ? triggerCharacters.join("").replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")
    : "";
  return new RegExp(`[^${chars}]*$`);
};

export const getServerCompletionContext = (
  triggerCharacters: string[],
  context: CompletionContext,
): lsp.CompletionContext | null => {
  const line = context.state.doc.lineAt(context.pos);
  let triggerKind: lsp.CompletionTriggerKind =
    1 satisfies typeof lsp.CompletionTriggerKind.Invoked;
  let triggerCharacter = line.text[context.pos - line.from - 1];
  if (
    !context.explicit &&
    triggerCharacter &&
    triggerCharacters?.includes(triggerCharacter)
  ) {
    triggerKind = 2 satisfies typeof lsp.CompletionTriggerKind.TriggerCharacter;
  }
  if (triggerKind === (1 satisfies typeof lsp.CompletionTriggerKind.Invoked)) {
    triggerCharacter = undefined;
  }
  return { triggerKind, triggerCharacter };
};

export interface ServerCompletionsConfig {
  /// By default, the completion source that asks the language server
  /// for completions is added as a regular source, in addition to any
  /// other sources. Set this to true to make it replace all
  /// completion sources.
  override?: boolean;
}

/// Register the [language server completion
/// source](#lsp-client.serverCompletionSource) as an autocompletion
/// source.
export function serverCompletions(
  config: ServerCompletionsConfig = {},
): LSPClientExtension {
  let editorExtension: Extension[];
  const autocompletionConfig = {
    positionInfo,
    filterStrict: true,
  };
  if (config.override) {
    editorExtension = [
      completionTheme,
      autocompletion({
        ...autocompletionConfig,
        override: [serverCompletionSource],
      }),
    ];
  } else {
    let data = [{ autocomplete: serverCompletionSource }];
    editorExtension = [
      completionTheme,
      autocompletion({ ...autocompletionConfig }),
      EditorState.languageData.of(() => data),
    ];
  }
  return {
    clientCapabilities: {
      textDocument: {
        completion: {
          completionItem: {
            snippetSupport: true,
            documentationFormat: ["plaintext", "markdown"],
            insertReplaceSupport: false,
          },
          completionList: {
            itemDefaults: ["commitCharacters", "editRange", "insertTextFormat"],
          },
          completionItemKind: { valueSet: [] },
          contextSupport: true,
        },
      },
    },
    editorExtension,
  };
}

function getCompletions(
  plugin: LSPPlugin,
  pos: number,
  context: lsp.CompletionContext,
  abort?: CompletionContext,
): Promise<lsp.CompletionList | lsp.CompletionItem[] | null> {
  if (plugin.client.hasCapability("completionProvider") === false)
    return Promise.resolve(null);
  plugin.client.sync();
  let params: lsp.CompletionParams = {
    position: plugin.toPosition(pos),
    textDocument: { uri: plugin.uri },
    context,
  };
  const cancellationToken = Symbol();
  if (abort)
    abort.addEventListener("abort", () =>
      plugin.client.cancelRequest(cancellationToken),
    );
  return plugin.client.request<
    lsp.CompletionParams,
    lsp.CompletionItem[] | lsp.CompletionList | null,
    typeof lsp.CompletionRequest.method
  >("textDocument/completion", params);
}

/// A completion source that requests completions from a language
/// server.
export const serverCompletionSource: CompletionSource = (context) => {
  const plugin = context.view && LSPPlugin.get(context.view);
  const triggerCharacters =
    plugin.client.serverCapabilities?.completionProvider?.triggerCharacters;
  if (!plugin) return null;
  const serverContext = getServerCompletionContext(triggerCharacters, context);
  if (!serverContext) {
    return null;
  }
  const validFor = getValidFor(triggerCharacters);
  const active = context.matchBefore(validFor);
  const from = active?.from ?? context.pos;
  return getCompletions(plugin, context.pos, serverContext, context).then(
    (result) => {
      if (!result) return null;
      const items = Array.isArray(result) ? result : result.items;
      const itemDefaults = Array.isArray(result) ? {} : result.itemDefaults;
      const options = items
        .sort((a, b) => {
          if (a.sortText != null && b.sortText != null) {
            const aSortText = a.sortText;
            const bSortText = b.sortText;
            if (aSortText < bSortText) {
              return -1;
            }
            if (aSortText > bSortText) {
              return 1;
            }
          }
          return 0;
        })
        .map((item: lsp.CompletionItem, index) => {
          const insertTextFormat =
            item.insertTextFormat ?? itemDefaults?.insertTextFormat;
          const commitCharacters =
            item.commitCharacters ?? itemDefaults?.commitCharacters;
          const applyText =
            item.textEdit?.newText || item.insertText || item.label;
          let option: Completion & {
            command?: {
              title: string;
              command: string;
            };
          } = {
            label: item.label,
            detail: item.labelDetails?.description,
            type: item.kind && kindToType[item.kind],
            boost: -index,
            commitCharacters,
            command: item.command,
          };
          if (item.documentation) {
            option.info = () => renderDocInfo(plugin, item.documentation!);
          }
          option.apply = (
            view: EditorView,
            completion: Completion,
            from: number,
            to: number,
          ) => {
            if (
              insertTextFormat ===
              (2 satisfies typeof lsp.InsertTextFormat.Snippet)
            ) {
              snippet(applyText.replaceAll(/\$(\d+)/g, "$${$1}"))(
                view,
                completion,
                from,
                to,
              );
            } else {
              view.dispatch({
                ...insertCompletionText(view.state, applyText, from, to),
                annotations: pickedCompletion.of(completion),
              });
            }
            if (item.command?.command === "editor.action.triggerSuggest") {
              startCompletion(view);
            }
          };
          return option;
        });

      if (options.length === 0) {
        return null;
      }

      return {
        from,
        validFor,
        options,
        commitCharacters: itemDefaults?.commitCharacters,
        map: (result, changes) => ({
          ...result,
          from: changes.mapPos(result.from),
        }),
      };
    },
    (err): null => {
      if (
        "code" in err &&
        (err as lsp.ResponseError).code == -32800 /* RequestCancelled */
      )
        return null;
      throw err;
    },
  );
};

function renderDocInfo(plugin: LSPPlugin, doc: string | lsp.MarkupContent) {
  let elt = document.createElement("div");
  elt.className = "cm-lsp-documentation cm-lsp-completion-documentation";
  elt.innerHTML = plugin.docToHTML(doc);
  return elt;
}

const kindToType: { [kind: number]: string } = {
  1: "text", // Text
  2: "method", // Method
  3: "function", // Function
  4: "constructor", // Constructor
  5: "field", // Field
  6: "variable", // Variable
  7: "class", // Class
  8: "interface", // Interface
  9: "module", // Module
  10: "property", // Property
  11: "unit", // Unit
  12: "value", // Value
  13: "enum", // Enum
  14: "keyword", // Keyword
  15: "snippet", // Snippet
  16: "color", // Color
  17: "file", // File
  18: "reference", // Reference
  19: "folder", // Folder
  20: "enumMember", // EnumMember
  21: "constant", // Constant
  22: "struct", // Struct
  23: "event", // Event
  24: "operator", // Operator
  25: "typeParameter", // TypeParameter
};
