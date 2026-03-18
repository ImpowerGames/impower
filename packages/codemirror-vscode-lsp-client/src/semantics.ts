import {
  EditorState,
  StateEffect,
  StateField,
  TransactionSpec,
} from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClient, LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

export interface SemanticTokens {
  /** (Optional) For delta updates; this extension ignores deltas and expects full sets */
  resultId?: string;
  /** 5-tuples: [deltaLine, deltaStart, length, tokenType, tokenModifiersBitset, ...] */
  data: number[];
}

export interface SemanticTokensContext {
  state: EditorState;
}

export type SemanticTokensSource = (
  context: SemanticTokensContext,
) => SemanticTokens | null | Promise<SemanticTokens | null>;

const setSemanticDecorationsEffect = StateEffect.define<DecorationSet>();

const semanticField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setSemanticDecorationsEffect)) {
        return e.value;
      }
    }
    // Map through document changes
    if (tr.docChanged) {
      return value.map(tr.changes);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function convertFromSemanticTokensToDecorations(
  plugin: LSPPlugin,
  tokens: SemanticTokens,
  classNameForToken: (type: string, modifiers: string[]) => string,
): DecorationSet {
  const { data } = tokens;

  if (!data || data.length === 0) {
    return Decoration.none;
  }

  const legend =
    plugin.client.serverCapabilities.semanticTokensProvider?.legend;

  const { tokenTypes, tokenModifiers } = legend;

  const builder: RangeBuilder = new RangeBuilder();

  let line = 0;
  let char = 0;

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i]!;
    const deltaStart = data[i + 1]!;
    const length = data[i + 2]!;
    const tokenTypeIndex = data[i + 3]!;
    const tokenModsBits = data[i + 4]! >>> 0;

    line += deltaLine;
    char = deltaLine === 0 ? char + deltaStart : deltaStart;

    const type = tokenTypes[tokenTypeIndex] ?? "unknown";
    const mods: string[] = [];
    for (let bit = 0; bit < 31 && bit < tokenModifiers.length; bit++) {
      if (tokenModsBits & (1 << bit)) {
        mods.push(tokenModifiers[bit]!);
      }
    }

    const start = {
      line,
      character: char,
    };
    const end = {
      line,
      character: char + length,
    };

    const from = plugin.unsyncedChanges.mapPos(
      plugin.fromPosition(start, plugin.syncedDoc),
    );
    const to = plugin.unsyncedChanges.mapPos(
      plugin.fromPosition(end, plugin.syncedDoc),
    );
    if (from == null || to == null || to <= from) continue;

    const cls = classNameForToken(type, mods);
    builder.add(from, to, Decoration.mark({ class: cls }));
  }

  return builder.finish();
}

/** Simple range builder that collects decorations efficiently */
class RangeBuilder {
  private ranges: { from: number; to: number; deco: any }[] = [];
  add(from: number, to: number, deco: any) {
    this.ranges.push({ from, to, deco });
  }
  finish(): DecorationSet {
    // Sort by from position to avoid overlapping order surprises
    this.ranges.sort((a, b) => a.from - b.from || a.to - b.to);
    const decos = this.ranges.map((r) => r.deco.range(r.from, r.to));
    return Decoration.set(decos, true);
  }
}

function defaultClassName(type: string, mods: string[]) {
  const safe = (s: string) => s.replace(/[^\w-]/g, "-");
  const parts = ["lsp-semantic-token", `lsp-type-${safe(type)}`];
  for (const m of mods) parts.push(`lsp-modifier-${safe(m)}`);
  return parts.join(" ");
}

export function setSemanticDecorations(
  state: EditorState,
  decos: DecorationSet,
): TransactionSpec {
  const effects: StateEffect<unknown>[] = [];
  effects.push(setSemanticDecorationsEffect.of(decos));
  return { effects };
}

export interface ServerSemanticHighlightingConfig {
  /**
   * Build a className for a token given its type and modifiers.
   * Default yields: "lsp-semantic-token lsp-type-<type> lsp-modifier-<mod> ..."
   */
  classNameForToken?: (type: string, modifiers: string[]) => string;
}

export function serverSemanticHighlighting(
  config: ServerSemanticHighlightingConfig = {},
): LSPClientExtension {
  const { classNameForToken = defaultClassName } = config;

  const updateDocumentSemantics = (client: LSPClient, uri: string) => {
    let file = client.workspace.getFile(uri);
    if (!file) {
      return;
    }
    const view = file.getView();
    if (!view) {
      return;
    }
    const plugin = LSPPlugin.get(view);
    if (!plugin) {
      return;
    }
    plugin.client
      .request<
        lsp.SemanticTokensParams,
        lsp.SemanticTokens | null,
        typeof lsp.SemanticTokensRequest.method
      >("textDocument/semanticTokens/full", {
        textDocument: { uri },
      })
      .then((result) => {
        view.dispatch(
          setSemanticDecorations(
            view.state,
            convertFromSemanticTokensToDecorations(
              plugin,
              result,
              classNameForToken,
            ),
          ),
        );
      });
  };

  return {
    clientCapabilities: {
      textDocument: {
        semanticTokens: {
          requests: {
            full: true,
          },
          tokenTypes: [
            "namespace",
            "type",
            "class",
            "enum",
            "interface",
            "struct",
            "typeParameter",
            "parameter",
            "variable",
            "property",
            "enumMember",
            "event",
            "function",
            "method",
            "macro",
            "keyword",
            "modifier",
            "comment",
            "string",
            "number",
            "regexp",
            "operator",
            "decorator",
          ],
          tokenModifiers: [
            "declaration",
            "definition",
            "readonly",
            "static",
            "deprecated",
            "abstract",
            "async",
            "modification",
            "documentation",
            "defaultLibrary",
          ],
          formats: ["relative"],
        },
      },
    },
    requestHandlers: {
      "workspace/semanticTokens/refresh": (client): null => {
        for (const file of client.workspace.files) {
          updateDocumentSemantics(client, file.uri);
        }
        return null;
      },
    },
    notificationListeners: {
      "textDocument/didOpen": (
        client,
        params: lsp.DidOpenTextDocumentParams,
      ) => {
        updateDocumentSemantics(client, params.textDocument.uri);
      },
    },
    editorExtension: [semanticField],
  };
}
