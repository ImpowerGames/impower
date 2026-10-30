import {
  EditorState,
  StateEffect,
  StateField,
  TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { pullInBackground } from "./backgroundPull";
import { LSPClient, LSPClientExtension, RequestTimeoutError } from "./client";
import { LSPPlugin } from "./plugin";

export const CODELENS_WRAPPER_CLASS_NAME = "cm-codeLens-wrapper";
export const CODELENS_ITEM_CLASS_NAME = "cm-codeLens-item";
export const CODELENS_SEPARATOR_CLASS_NAME = "cm-codeLens-separator";

export const codeLensWidgetTheme = EditorView.baseTheme({
  [`.${CODELENS_WRAPPER_CLASS_NAME}`]: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    color: "#999999",
    fontSize: "14px",
    fontFamily: "inherit",
    padding: "0",
    userSelect: "none",
    whiteSpace: "nowrap",
    margin: "2px 0",
  },
  [`.${CODELENS_ITEM_CLASS_NAME}`]: {
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
  },
  "@media (hover: hover) and (pointer: fine)": {
    [`.${CODELENS_ITEM_CLASS_NAME}:hover`]: {
      color: "#4e94ce",
    },
  },
  [`.${CODELENS_SEPARATOR_CLASS_NAME}`]: {
    margin: "0 4px",
    opacity: 0.5,
  },
});

export interface DocumentCodeLens {
  pos: number;
  lens: lsp.CodeLens;
}

export function renderLabelWithIcons(text: string): (string | HTMLElement)[] {
  const regex = /\$\(([\w-]+)(?:~([\w-]+))?\)/g;
  const result: (string | HTMLElement)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    const iconName = match[1];
    const animation = match[2];

    const span = document.createElement("span");
    span.className = `codicon codicon-${iconName}`;
    if (animation) {
      span.classList.add(`codicon-animation-${animation}`);
    }
    result.push(span);

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

export default class CodeLensWidget extends WidgetType {
  private readonly lenses: DocumentCodeLens[];

  constructor(lenses: DocumentCodeLens[]) {
    super();
    this.lenses = lenses;
  }

  override eq(other: CodeLensWidget) {
    if (this.lenses.length !== other.lenses.length) return false;
    return JSON.stringify(this.lenses) === JSON.stringify(other.lenses);
  }

  override toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = CODELENS_WRAPPER_CLASS_NAME;

    this.lenses.forEach((l, index) => {
      if (index > 0) {
        const sep = document.createElement("span");
        sep.className = CODELENS_SEPARATOR_CLASS_NAME;
        sep.textContent = "|";
        wrapper.appendChild(sep);
      }

      const item = document.createElement("span");
      item.className = CODELENS_ITEM_CLASS_NAME;
      const title = l.lens.command?.title || "Loading...";
      const elements = renderLabelWithIcons(title);

      elements.forEach((el) => {
        if (typeof el === "string") {
          const textSpan = document.createElement("span");
          textSpan.textContent = el;
          item.appendChild(textSpan);
        } else {
          item.appendChild(el);
        }
      });

      item.onclick = (e) => {
        e.stopPropagation();
        if (l.lens.command) {
          this.handleCommand(view, l.lens.command);
        }
      };

      wrapper.appendChild(item);
    });

    return wrapper;
  }

  override ignoreEvent() {
    return true;
  }

  private handleCommand(view: EditorView, command: lsp.Command) {
    const plugin = LSPPlugin.get(view);
    if (!plugin) return;

    plugin.client
      .request("workspace/executeCommand", {
        command: command.command,
        arguments: command.arguments,
      })
      .catch((err) => {
        console.error("LSP Execute Command Error:", err);
      });
  }
}

const updateCodeLensDecorationEffect = StateEffect.define<DocumentCodeLens[]>({
  map: (value, change) =>
    value.map((v) => ({
      lens: v.lens,
      pos: change.mapPos(v.pos),
    })),
});

export function convertFromServerCodeLens(
  plugin: LSPPlugin,
  infos: lsp.CodeLens[],
): DocumentCodeLens[] {
  const result: DocumentCodeLens[] = infos.map((c): DocumentCodeLens => {
    return {
      lens: c,
      pos: plugin.fromPosition(c.range.start, plugin.syncedDoc) ?? 0,
    };
  });

  return result.filter((c) => c.pos != null).sort((a, b) => a.pos - b.pos);
}

export function setDocumentCodeLenses(
  _state: EditorState,
  lenses: DocumentCodeLens[],
): TransactionSpec {
  const effects: StateEffect<unknown>[] = [];
  effects.push(updateCodeLensDecorationEffect.of(lenses));
  return { effects };
}

const codeLensState = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);

    for (let e of tr.effects) {
      if (e.is(updateCodeLensDecorationEffect)) {
        const groups = new Map<number, DocumentCodeLens[]>();

        for (const lens of e.value) {
          const safePos = Math.min(Math.max(0, lens.pos), tr.newDoc.length);
          const lineStart = tr.newDoc.lineAt(safePos).from;

          if (!groups.has(lineStart)) {
            groups.set(lineStart, []);
          }
          groups.get(lineStart)!.push(lens);
        }

        const decos = Array.from(groups.entries())
          .sort(([posA], [posB]) => posA - posB)
          .map(([pos, lenses]) =>
            Decoration.widget({
              widget: new CodeLensWidget(lenses),
              block: true,
              side: -1,
            }).range(pos),
          );

        decorations = Decoration.set(decos);
      }
    }

    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export async function updateDocumentCodeLenses(client: LSPClient, uri: string) {
  let file = client.workspace.getFile(uri);
  if (!file) return;
  const view = file.getView();
  if (!view) return;
  const plugin = LSPPlugin.get(view);
  if (!plugin) return;
  const version = file.version;

  try {
    const result = await plugin.client.request<
      lsp.CodeLensParams,
      lsp.CodeLens[] | null,
      typeof lsp.CodeLensRequest.method
    >("textDocument/codeLens", {
      textDocument: { uri },
    });

    if (!result) return;

    const resolvedLenses = await Promise.all(
      result.map(async (lens) => {
        if (!lens.command) {
          try {
            const resolved = await plugin.client.request<
              lsp.CodeLens,
              lsp.CodeLens,
              "codeLens/resolve"
            >("codeLens/resolve", lens);
            return resolved || lens;
          } catch (err) {
            return lens;
          }
        }
        return lens;
      }),
    );

    if (client.workspace.getFile(uri)?.version !== version) return;
    if (LSPPlugin.get(view) !== plugin) return;
    view.dispatch(
      setDocumentCodeLenses(
        view.state,
        convertFromServerCodeLens(plugin, resolvedLenses),
      ),
    );
  } catch (err) {
    if (err instanceof RequestTimeoutError) throw err;
    console.debug("LSP CodeLens Error or Unsupported:", err);
  }
}

export function serverCodeLenses(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        codeLens: {
          dynamicRegistration: false,
        },
      },
    },
    notificationListeners: {
      "textDocument/didOpen": (
        client,
        params: lsp.DidOpenTextDocumentParams,
      ) => {
        pullInBackground(client, params.textDocument.uri, () =>
          updateDocumentCodeLenses(client, params.textDocument.uri),
        );
      },
      "textDocument/didChange": (
        client,
        params: lsp.DidChangeTextDocumentParams,
      ) => {
        pullInBackground(client, params.textDocument.uri, () =>
          updateDocumentCodeLenses(client, params.textDocument.uri),
        );
      },
      "textDocument/publishDiagnostics": (
        client,
        params: lsp.PublishDiagnosticsParams,
      ) => {
        pullInBackground(client, params.uri, () =>
          updateDocumentCodeLenses(client, params.uri),
        );
      },
    },
    editorExtension: [codeLensState, codeLensWidgetTheme],
  };
}
