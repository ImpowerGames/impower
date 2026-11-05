import {
  autocompletion,
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
  completionStatus,
  insertCompletionText,
  pickedCompletion,
  selectedCompletion,
  snippet,
  startCompletion,
} from "@codemirror/autocomplete";
import {
  ChangeDesc,
  ChangeSet,
  EditorState,
  Extension,
  Text,
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
import { convertFromPosition } from "./pos";
import {
  noteEmptySuggestions,
  registerCompletionDocs,
  suggestions,
} from "./suggestions";

const completionTheme = EditorView.baseTheme({
  "& .cm-tooltip": {
    fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`,
    fontSize: "0.96em",
    border: "solid 1px var(--edge)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--float-shadow)",
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
    offset =
      Math.max(space.top, Math.min(list.top, space.bottom - infoHeight)) -
      list.top;
    maxWidth = Math.min(Info.Width, left ? spaceLeft : spaceRight);
  } else {
    narrow = true;
    maxWidth = Math.min(
      Info.Width,
      (rtl ? list.right : space.right - list.left) - Info.Margin,
    );
    let spaceBelow = space.bottom - list.bottom;
    if (spaceBelow >= infoHeight || spaceBelow > list.top) {
      vertical = "below";
      offset = list.bottom - list.top;
    } else {
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
  override?: boolean;
}

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
      suggestions(),
      autocompletion({
        ...autocompletionConfig,
        override: [serverCompletionSource],
      }),
    ];
  } else {
    let data = [{ autocomplete: serverCompletionSource }];
    editorExtension = [
      completionTheme,
      suggestions(),
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
  const { state, pos } = context;
  return getCompletions(plugin, pos, serverContext, context).then(
    (result) => {
      const noteEmpty = () => {
        const view = context.view;
        if (
          context.explicit &&
          view &&
          !context.aborted &&
          completionStatus(view.state) === "pending" &&
          view.state.doc === state.doc &&
          view.state.selection.main.head === pos
        ) {
          noteEmptySuggestions(view, pos);
        }
        return null;
      };
      if (!result) return noteEmpty();
      const items = Array.isArray(result) ? result : result.items;
      const itemDefaults = Array.isArray(result) ? {} : result.itemDefaults;
      items.sort((a, b) => {
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
      });
      if (items.length === 0) {
        return noteEmpty();
      }
      const ranges = items.map((item) =>
        getEditRange(item, itemDefaults, state.doc, pos),
      );
      const first = ranges.find((r) => r != null);
      const range = { from: first?.from ?? active?.from ?? pos, to: pos };
      const typed = state.sliceDoc(range.from, pos);
      if (
        typed &&
        !items.some((item) =>
          containsInOrder(item.filterText ?? item.label, typed),
        )
      ) {
        return noteEmpty();
      }
      const options = items.map((item, index) =>
        serverCompletionOption(item, index, itemDefaults, validFor, plugin, {
          result: range,
          item: ranges[index] ?? range,
        }),
      );
      const floor = Math.max(
        range.from,
        ...ranges.map((r) => r?.from ?? range.from),
      );
      const listResult = (end: number): CompletionResult => ({
        from: range.from,
        validFor: keepsWord(state.sliceDoc(range.from, pos), triggerCharacters),
        options,
        commitCharacters: itemDefaults?.commitCharacters,
        map: (current, changes) =>
          keepsRanges(floor, end, changes)
            ? {
                ...listResult(changes.mapPos(end, 1)),
                from: changes.mapPos(current.from),
              }
            : null,
      });
      return listResult(pos);
    },
    (err): null => {
      if (
        "code" in err &&
        (err as lsp.ResponseError).code == -32800
      )
        return null;
      throw err;
    },
  );
};

function containsInOrder(text: string, typed: string) {
  const haystack = text.toLowerCase();
  let at = 0;
  for (const char of typed.toLowerCase()) {
    at = haystack.indexOf(char, at);
    if (at < 0) {
      return false;
    }
    at += char.length;
  }
  return true;
}

interface OffsetRange {
  from: number;
  to: number;
}

interface CompletionRequestRange {
  result: OffsetRange;
  item: OffsetRange;
}

function keepsRanges(floor: number, end: number, changes: ChangeDesc) {
  let kept = true;
  changes.iterChangedRanges((fromA, toA) => {
    if (toA !== end || fromA < floor) {
      kept = false;
    }
  });
  return kept;
}

function getEditRange(
  item: lsp.CompletionItem,
  itemDefaults: lsp.CompletionList["itemDefaults"],
  doc: Text,
  pos: number,
): OffsetRange | null {
  const edit = item.textEdit ?? itemDefaults?.editRange;
  if (!edit) {
    return null;
  }
  const range: lsp.Range =
    "range" in edit ? edit.range : "replace" in edit ? edit.replace : edit;
  if (range.start.line !== range.end.line) {
    return null;
  }
  const from = convertFromPosition(doc, range.start);
  const to = convertFromPosition(doc, range.end);
  return from <= pos && pos <= to ? { from, to } : null;
}

function keepsWord(typed: string, triggerCharacters: string[] | undefined) {
  const triggers = new Set(triggerCharacters ?? []);
  return (_text: string, from: number, _to: number, state: EditorState) => {
    const now = state.sliceDoc(from, state.selection.main.head);
    const change = now.startsWith(typed)
      ? now.slice(typed.length)
      : typed.startsWith(now)
        ? typed.slice(now.length)
        : null;
    return change != null && ![...change].some((c) => triggers.has(c));
  };
}

export function serverCompletionOption(
  item: lsp.CompletionItem,
  index: number,
  itemDefaults: lsp.CompletionList["itemDefaults"],
  validFor: RegExp,
  plugin?: LSPPlugin,
  request?: CompletionRequestRange,
): Completion {
  const insertTextFormat =
    item.insertTextFormat ?? itemDefaults?.insertTextFormat;
  const commitCharacters =
    item.commitCharacters ?? itemDefaults?.commitCharacters;
  const applyText = item.textEdit?.newText || item.insertText || item.label;
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
    const html = plugin.docToHTML(item.documentation);
    option.info = () => renderDocInfo(html);
    registerCompletionDocs(option, () => Promise.resolve(html));
  } else if (plugin && item.data && canResolveCompletions(plugin)) {
    let resolving: Promise<string | null> | undefined;
    const docs = () =>
      (resolving ??= resolveCompletionItem(plugin, item).then((resolved) => {
        if (!resolved?.documentation) {
          resolving = undefined;
          return null;
        }
        return plugin.docToHTML(resolved.documentation);
      }));
    registerCompletionDocs(option, docs);
    option.info = () => {
      const elt = renderDocInfo("");
      docs().then((html) => {
        if (html) {
          elt.innerHTML = html;
          plugin.view.requestMeasure();
        }
      });
      return elt;
    };
  }
  const edit: CompletionEdit = (view, completion, listFrom, listTo) => {
    const from =
      listFrom + (request ? request.item.from - request.result.from : 0);
    const to = listTo + (request ? request.item.to - request.result.to : 0);
    if (
      insertTextFormat === (2 satisfies typeof lsp.InsertTextFormat.Snippet)
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
  previewableCompletions.set(option, { validFor, edit, request });
  return option;
}

type CompletionEdit = (
  view: Pick<EditorView, "state" | "dispatch">,
  completion: Completion,
  from: number,
  to: number,
) => void;

const previewableCompletions = new WeakMap<
  Completion,
  { validFor: RegExp; edit: CompletionEdit; request?: CompletionRequestRange }
>();

export function completionChanges(
  state: EditorState,
  completion: Completion,
): ChangeSet | null {
  const previewable = previewableCompletions.get(completion);
  if (!previewable) {
    return null;
  }
  const { request } = previewable;
  const head = state.selection.main.head;
  const from = request
    ? request.result.from
    : (new CompletionContext(state, head, false).matchBefore(
        previewable.validFor,
      )?.from ?? head);
  const to = head;
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
  state: "focus" | "close";
  session: number;
  changes?: ChangeSet | null;
  accepted?: Transaction;
}

export function completionPreview(
  listener: (event: CompletionPreviewEvent, state: EditorState) => void,
): Extension {
  let session = 0;
  return ViewPlugin.fromClass(
    class {
      open = false;
      highlighted: Completion | null = null;
      constructor(readonly view: EditorView) {}
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
              update.state,
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
          update.state,
        );
      }
      destroy() {
        if (this.open) {
          this.open = false;
          this.highlighted = null;
          listener({ state: "close", session }, this.view.state);
        }
      }
    },
  );
}

function canResolveCompletions(plugin: LSPPlugin) {
  const provider = plugin.client.serverCapabilities?.completionProvider;
  return provider?.resolveProvider === true;
}

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

function renderDocInfo(html: string) {
  const elt = document.createElement("div");
  elt.className = "cm-lsp-documentation cm-lsp-completion-documentation";
  elt.innerHTML = html;
  return elt;
}

const kindToType: { [kind: number]: string } = {
  1: "text",
  2: "method",
  3: "function",
  4: "constructor",
  5: "field",
  6: "variable",
  7: "class",
  8: "interface",
  9: "module",
  10: "property",
  11: "unit",
  12: "value",
  13: "enum",
  14: "keyword",
  15: "snippet",
  16: "color",
  17: "file",
  18: "reference",
  19: "folder",
  20: "enumMember",
  21: "constant",
  22: "struct",
  23: "event",
  24: "operator",
  25: "typeParameter",
};
