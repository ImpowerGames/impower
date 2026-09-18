import {
  autocompletion,
  Completion,
  CompletionContext,
  CompletionSource,
  completionStatus,
  insertCompletionText,
  pickedCompletion,
  selectedCompletion,
  snippet,
  startCompletion,
} from "@codemirror/autocomplete";
import {
  ChangeSet,
  EditorState,
  Extension,
  Transaction,
  TransactionSpec,
} from "@codemirror/state";
import {
  Direction,
  EditorView,
  Rect,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
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
  // The server's preview markup sizes its own thumbnail with an inline
  // `height`, and VS Code sizes it from the same markup. Restating a height
  // here would make that number inert on this surface alone and let the two
  // surfaces drift, so height is left to the markup. Width is bounded only so
  // an unusually wide asset cannot push the panel past its container;
  // `contain` keeps the aspect ratio when that bound bites.
  "& .cm-tooltip.cm-completionInfo img": {
    maxWidth: "100%",
    objectFit: "contain",
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
  triggerCharacters: string[] | undefined,
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
            resolveSupport: { properties: ["documentation"] },
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
  if (!plugin) return null;
  const triggerCharacters =
    plugin.client.serverCapabilities?.completionProvider?.triggerCharacters;
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
        .map((item: lsp.CompletionItem, index) =>
          serverCompletionOption(item, index, itemDefaults, validFor, plugin),
        );

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

/** The CodeMirror option for one language-server completion item, as
 *  `serverCompletionSource` offers it. `plugin` supplies the documentation
 *  panel; without it the option has none. */
export function serverCompletionOption(
  item: lsp.CompletionItem,
  index: number,
  itemDefaults: lsp.CompletionList["itemDefaults"],
  validFor: RegExp,
  plugin?: LSPPlugin,
): Completion {
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
  if (plugin && item.documentation) {
    option.info = () => renderDocInfo(plugin, item.documentation!);
  } else if (plugin && item.data && canResolveCompletions(plugin)) {
    // Documentation was withheld by the server to keep the list cheap;
    // fetch it only when this item is actually highlighted. CodeMirror
    // accepts a promise here and drops it if the user moves on first.
    option.info = () =>
      resolveCompletionItem(plugin, item).then((resolved) =>
        resolved?.documentation
          ? renderDocInfo(plugin, resolved.documentation)
          : null,
      );
  }
  // The edit alone, kept apart from the command that follows it, so a
  // preview can compute what accepting would insert without running
  // anything else acceptance does.
  const edit: CompletionEdit = (view, completion, from, to) => {
    if (
      insertTextFormat ===
      (2 satisfies typeof lsp.InsertTextFormat.Snippet)
    ) {
      snippet(applyText.replaceAll(/\$(\d+)/g, "$${$1}"))(
        view as EditorView,
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
  };
  option.apply = (
    view: EditorView,
    completion: Completion,
    from: number,
    to: number,
  ) => {
    edit(view, completion, from, to);
    if (item.command?.command === "editor.action.triggerSuggest") {
      startCompletion(view);
    }
  };
  previewableCompletions.set(option, { validFor, edit });
  return option;
}

/** Dispatches the edit accepting a completion makes, and nothing else. */
type CompletionEdit = (
  view: Pick<EditorView, "state" | "dispatch">,
  completion: Completion,
  from: number,
  to: number,
) => void;

/** What `serverCompletionSource` knows about each option it produced: the
 *  pattern that decides the start of the replaced range, and the edit. */
const previewableCompletions = new WeakMap<
  Completion,
  { validFor: RegExp; edit: CompletionEdit }
>();

/**
 * The changes accepting `completion` would make to `state`, or null when they
 * cannot be known.
 *
 * Acceptance replaces the range from the start of the completion result to the
 * cursor. CodeMirror keeps that range privately, so it is recomputed here the
 * way the source computed it: the result starts where `validFor` stops
 * matching before the cursor, and CodeMirror keeps the result only while the
 * text from its start to the cursor still matches, which leaves the start
 * where it was. The edit then runs against a view that records the
 * transaction instead of dispatching it, so the changes are the ones
 * acceptance itself makes (snippet placeholders, every cursor of a multiple
 * selection, the text after the cursor left in place) rather than a second
 * account of them. Only options from `serverCompletionSource` are known; for
 * any other the answer is null rather than a guess.
 */
export function completionChanges(
  state: EditorState,
  completion: Completion,
): ChangeSet | null {
  const previewable = previewableCompletions.get(completion);
  if (!previewable) {
    return null;
  }
  const to = state.selection.main.head;
  const from =
    new CompletionContext(state, to, false).matchBefore(previewable.validFor)
      ?.from ?? to;
  // No transaction may be created, not even one that is never dispatched:
  // creating one runs the state's transaction extenders, and a host's extender
  // can announce the change to everything listening (the web editor's reports
  // the document as edited and saved). So `update` is intercepted as well as
  // `dispatch` (snippets build their transaction with `state.update`), and the
  // changes are taken from the spec.
  let recorded: TransactionSpec | undefined;
  const unapplied = {};
  const recordingState = new Proxy(state, {
    get(target, property) {
      if (property === "update") {
        return (...specs: TransactionSpec[]) => {
          recorded ??= specs[0];
          return unapplied;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  previewable.edit(
    {
      state: recordingState,
      dispatch: (...specs: (Transaction | TransactionSpec)[]) => {
        const spec = specs[0];
        if (spec !== unapplied && !(spec instanceof Transaction)) {
          recorded ??= spec;
        }
      },
    } as Pick<EditorView, "state" | "dispatch">,
    completion,
    from,
    to,
  );
  const changes = recorded?.changes;
  if (!changes) {
    return null;
  }
  return changes instanceof ChangeSet ? changes : state.changes(changes);
}

export interface CompletionPreviewEvent {
  /** `focus`: an option is highlighted. `close`: the list closed. */
  state: "focus" | "close";
  /** Increases each time the list opens. */
  session: number;
  /** `focus` only: what accepting the highlighted option would change, or null
   *  when that cannot be known (see `completionChanges`). */
  changes?: ChangeSet | null;
  /** `close` only: the transaction that accepted an option, when the list
   *  closed because one was accepted. */
  accepted?: Transaction;
}

/**
 * Report every newly highlighted autocomplete option, and the list closing.
 *
 * An option counts as newly highlighted when it is highlighted first, when the
 * highlight moves to it (including back to one highlighted before), and when
 * the document changes under it, since the edit accepting it would make has
 * changed with the document. While the list waits for fresh results nothing is
 * highlighted and nothing is reported; the list is still open, so neither is a
 * close.
 */
export function completionPreview(
  listener: (event: CompletionPreviewEvent, update: ViewUpdate) => void,
): Extension {
  let session = 0;
  return ViewPlugin.fromClass(
    class {
      open = false;
      highlighted: Completion | null = null;
      update(update: ViewUpdate) {
        if (completionStatus(update.state) == null) {
          if (this.open) {
            this.open = false;
            this.highlighted = null;
            listener(
              {
                state: "close",
                session,
                accepted: update.transactions.find(
                  (tr) => tr.annotation(pickedCompletion) != null,
                ),
              },
              update,
            );
          }
          return;
        }
        if (!this.open) {
          this.open = true;
          this.highlighted = null;
          session++;
        }
        const highlighted = selectedCompletion(update.state);
        if (
          !highlighted ||
          (highlighted === this.highlighted && !update.docChanged)
        ) {
          return;
        }
        this.highlighted = highlighted;
        listener(
          {
            state: "focus",
            session,
            changes: completionChanges(update.state, highlighted),
          },
          update,
        );
      }
    },
  );
}

function canResolveCompletions(plugin: LSPPlugin) {
  const provider = plugin.client.serverCapabilities?.completionProvider;
  return provider?.resolveProvider === true;
}

/// Ask the server to fill in the expensive parts of a completion item
/// (documentation). Resolves to null on failure so a dead request just
/// means "no info panel" rather than a thrown error in the tooltip.
function resolveCompletionItem(
  plugin: LSPPlugin,
  item: lsp.CompletionItem,
): Promise<lsp.CompletionItem | null> {
  return plugin.client
    .request<
      lsp.CompletionItem,
      lsp.CompletionItem | null,
      typeof lsp.CompletionResolveRequest.method
    >("completionItem/resolve", item)
    .catch((): null => null);
}

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
