import {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { Language } from "@codemirror/language";
import { setDiagnostics } from "@codemirror/lint";
import { EditorView, PluginValue } from "@codemirror/view";
import { NodeType } from "@lezer/common";
import { Tag } from "@lezer/highlight";

import {
  Diagnostic,
  PublishDiagnosticsParams,
} from "vscode-languageserver-protocol";

import { languageClientConfig } from "../extensions/languageClient";
import { DidParseParams } from "../types/DidParseTextDocument";
import { getClientCompletionInfo } from "../utils/getClientCompletionInfo";
import { getClientCompletionType } from "../utils/getClientCompletionType";
import { getClientDiagnostics } from "../utils/getClientDiagnostics";
import { getServerCompletionContext } from "../utils/getServerCompletionContext";
import { offsetToPosition } from "../utils/offsetToPosition";
import { prefixMatch } from "../utils/prefixMatch";
import type LanguageServerConnection from "./LanguageServerConnection";
import ColorSupport from "./features/ColorSupport";
import CompletionSupport from "./features/CompletionSupport";
import FoldingSupport from "./features/FoldingSupport";

export default class LanguageClientPluginValue implements PluginValue {
  protected _view: EditorView;

  protected _connection: LanguageServerConnection;
  protected _textDocument: { uri: string; version: number };
  protected _language: Language;
  protected _highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  };

  protected _supports: {
    folding: FoldingSupport;
    color: ColorSupport;
    completion: CompletionSupport;
  };

  constructor(
    view: EditorView,
    supports: {
      folding: FoldingSupport;
      color: ColorSupport;
      completion: CompletionSupport;
    }
  ) {
    this._view = view;
    this._supports = supports;
    const config = view.state.facet(languageClientConfig);
    this._connection = config.connection;
    this._language = config.language;
    this._highlighter = config.highlighter;
    this._textDocument = config.textDocument;

    this.bind();

    this.initialize(view.state.doc.toString());
  }

  destroy() {
    this.unbind();
  }

  bind() {
    this._connection.publishDiagnosticsEvent.addListener(
      this.handleDiagnostics
    );
    this._connection.parseEvent.addListener(this.handleParse);
    this._supports.completion.addCompletionSource(this.handleCompletions);
  }

  unbind() {
    this._connection.publishDiagnosticsEvent.removeListener(
      this.handleDiagnostics
    );
    this._connection.parseEvent.removeListener(this.handleParse);
    this._supports.completion.removeCompletionSource(this.handleCompletions);
  }

  protected async initialize(text: string) {
    if (this._connection.starting) {
      await this._connection.starting;
    }
    this._connection.notifyDidOpenTextDocument({
      textDocument: {
        uri: this._textDocument.uri,
        version: this._textDocument.version,
        languageId: this._connection.id,
        text,
      },
    });
  }

  handleDiagnostics = (params: PublishDiagnosticsParams) => {
    if (params.uri !== this._textDocument.uri) {
      return;
    }
    this.updateDiagnostics(this._view, params.diagnostics);
  };

  handleParse = async (params: DidParseParams) => {
    if (params.uri !== this._textDocument.uri) {
      return;
    }
    this.updateFoldingRanges(this._view);
    this.updateDocumentColors(this._view);
  };

  handleCompletions = async (
    clientContext: CompletionContext
  ): Promise<CompletionResult | null> => {
    if (this._connection.starting) {
      await this._connection.starting;
    }
    const position = offsetToPosition(
      clientContext.state.doc,
      clientContext.pos
    );
    const serverContext = getServerCompletionContext(
      this._connection.serverCapabilities,
      clientContext
    );
    if (!serverContext) {
      return null;
    }
    const result = await this._connection.requestCompletions({
      textDocument: this._textDocument,
      position,
      context: serverContext,
    });
    if (!result) {
      return null;
    }
    const items = "items" in result ? result.items : result;
    if (items.length === 0) {
      return null;
    }
    let options = items.map(
      ({
        detail,
        label,
        labelDetails,
        insertText,
        kind,
        textEdit,
        documentation,
        sortText,
        filterText,
      }) => {
        const completion: Completion & {
          filterText: string;
          sortText?: string;
          apply: string;
        } = {
          label,
          detail: labelDetails?.description,
          apply: textEdit?.newText ?? insertText ?? label,
          type: getClientCompletionType(kind),
          sortText: sortText ?? label,
          filterText: filterText ?? label,
        };
        if (documentation) {
          completion.info = getClientCompletionInfo(
            detail,
            documentation,
            this._language,
            this._highlighter
          );
        }
        return completion;
      }
    );
    const [, match] = prefixMatch(options);
    const token = clientContext.matchBefore(match);
    let from = clientContext.pos;
    if (token) {
      from = token.from;
      const word = token.text.toLowerCase();
      if (/^\w+$/.test(word)) {
        options = options
          .filter(({ filterText }) => filterText.toLowerCase().startsWith(word))
          .sort(({ apply: a }, { apply: b }) => {
            switch (true) {
              case a.startsWith(token.text) && !b.startsWith(token.text):
                return -1;
              case !a.startsWith(token.text) && b.startsWith(token.text):
                return 1;
            }
            return 0;
          });
      }
    }
    return {
      from,
      options,
    };
  };

  updateDiagnostics(view: EditorView, diagnostics: Diagnostic[]) {
    const transaction = setDiagnostics(
      view.state,
      getClientDiagnostics(view.state, diagnostics)
    );
    view.dispatch(transaction);
  }

  async updateFoldingRanges(view: EditorView) {
    const result = await this._connection.requestFoldingRanges({
      textDocument: this._textDocument,
    });
    if (result) {
      const transaction = this._supports.folding.transaction(
        view.state,
        result
      );
      view.dispatch(transaction);
    }
  }

  async updateDocumentColors(view: EditorView) {
    const result = await this._connection.requestDocumentColors({
      textDocument: this._textDocument,
    });
    const transaction = this._supports.color.transaction(view.state, result);
    view.dispatch(transaction);
  }

  // async requestHoverTooltip(
  //   view: EditorView,
  //   { line, character }: { line: number; character: number }
  // ): Promise<Tooltip | null> {
  //   if (!this.client.ready || !this.client.capabilities!.hoverProvider)
  //     return null;

  //   this.sendChange({ documentText: view.state.doc.toString() });
  //   const result = await this.client.textDocumentHover({
  //     textDocument: { uri: this.documentUri },
  //     position: { line, character },
  //   });
  //   if (!result) return null;
  //   const { contents, range } = result;
  //   let pos = posToOffset(view.state.doc, { line, character })!;
  //   let end: number;
  //   if (range) {
  //     pos = posToOffset(view.state.doc, range.start)!;
  //     end = posToOffset(view.state.doc, range.end);
  //   }
  //   if (pos === null) return null;
  //   const dom = document.createElement("div");
  //   dom.classList.add("documentation");
  //    dom.innerHTML = formatContents(contents);
  //   else dom.textContent = formatContents(contents);
  //   return { pos, end, create: (view) => ({ dom }), above: true };
  // }
}
