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
  ColorInformation,
  CompletionItem,
  CompletionList,
  CompletionRequest,
  Diagnostic,
  Disposable,
  DocumentColorRequest,
  FoldingRange,
  FoldingRangeRequest,
  Hover,
  HoverRequest,
  MarkupContent,
  PublishDiagnosticsNotification,
  PublishDiagnosticsParams,
} from "vscode-languageserver-protocol";

import {
  DidParseTextDocument,
  DidParseTextDocumentParams,
} from "../../../../spark-editor-protocol/src/protocols/textDocument/messages/DidParseTextDocument";
import { languageClientConfig } from "../extensions/languageClient";
import { FileSystemReader } from "../types/FileSystemReader";
import { LanguageServerConnection } from "../types/LanguageServerConnection";
import { getClientCompletionType } from "../utils/getClientCompletionType";
import { getClientDiagnostics } from "../utils/getClientDiagnostics";
import { getClientMarkupContent } from "../utils/getClientMarkupContent";
import { getClientMarkupDom } from "../utils/getClientMarkupDom";
import { getServerCompletionContext } from "../utils/getServerCompletionContext";
import { offsetToPosition } from "../utils/offsetToPosition";
import { positionToOffset } from "../utils/positionToOffset";
import { prefixMatch } from "../utils/prefixMatch";
import ColorSupport from "./features/ColorSupport";
import CompletionSupport from "./features/CompletionSupport";
import FoldingSupport from "./features/FoldingSupport";
import HoverSupport, {
  HoverContext,
  HoverResult,
} from "./features/HoverSupport";

export default class LanguageClientPluginValue implements PluginValue {
  protected _view: EditorView;

  protected _connection: LanguageServerConnection;

  protected _fileSystemReader: FileSystemReader;

  protected _language: Language;

  protected _highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  };

  protected _textDocument: { uri: string; version: number };

  protected _supports: {
    folding: FoldingSupport;
    color: ColorSupport;
    completion: CompletionSupport;
    hover: HoverSupport;
  };

  protected _disposables: Disposable[] = [];

  constructor(
    view: EditorView,
    supports: {
      folding: FoldingSupport;
      color: ColorSupport;
      completion: CompletionSupport;
      hover: HoverSupport;
    }
  ) {
    this._view = view;
    this._supports = supports;
    const config = view.state.facet(languageClientConfig);
    this._textDocument = config.textDocument;
    this._connection = config.connection;
    this._fileSystemReader = config.fileSystemReader;
    this._language = config.language;
    this._highlighter = config.highlighter;

    this.bind();
  }

  destroy() {
    this.unbind();
  }

  bind() {
    this._disposables.push(
      this._connection.onNotification(
        PublishDiagnosticsNotification.method,
        (params: PublishDiagnosticsParams) => {
          this.handlePublishDiagnostics(params);
        }
      )
    );
    this._disposables.push(
      this._connection.onNotification(
        DidParseTextDocument.method,
        (params: DidParseTextDocumentParams) => {
          this.handleDidParseTextDocument(params);
        }
      )
    );
    this._supports.completion.addCompletionSource(this.handleCompletions);
    this._supports.hover.addHoverSource(this.handleHovers);
  }

  unbind() {
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
    this._supports.completion.removeCompletionSource(this.handleCompletions);
    this._supports.hover.removeHoverSource(this.handleHovers);
  }

  handleDidParseTextDocument = async (params: DidParseTextDocumentParams) => {
    if (params.textDocument.uri !== this._textDocument.uri) {
      return;
    }
    this.updateFoldingRanges(this._view);
    this.updateDocumentColors(this._view);
  };

  handlePublishDiagnostics = (params: PublishDiagnosticsParams) => {
    if (params.uri !== this._textDocument.uri) {
      return;
    }
    this.updateDiagnostics(this._view, params.diagnostics);
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
    const result: CompletionList | CompletionItem[] | null =
      await this._connection.sendRequest(CompletionRequest.method, {
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
        [[]];
        if (documentation) {
          completion.info = async () => {
            let content = documentation;
            let destroy: (() => void) | undefined = undefined;
            if (typeof content !== "string") {
              const { value, kind, urls } = await getClientMarkupContent(
                content,
                this._fileSystemReader
              );
              content = { value, kind };
              destroy = () => {
                urls.forEach((url) => URL.revokeObjectURL(url));
              };
            }
            const dom = getClientMarkupDom({
              detail,
              content,
              language: this._language,
              highlighter: this._highlighter,
            });
            return { dom, destroy };
          };
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

  handleHovers = async (
    clientContext: HoverContext
  ): Promise<HoverResult | null> => {
    if (this._connection.starting) {
      await this._connection.starting;
    }
    const position = offsetToPosition(
      clientContext.view.state.doc,
      clientContext.pos
    );
    const result: Hover = await this._connection.sendRequest(
      HoverRequest.method,
      {
        textDocument: this._textDocument,
        position,
      }
    );
    if (!result) {
      return null;
    }
    const contents = result.contents as MarkupContent;
    const range = result.range;
    const from = range?.start
      ? positionToOffset(clientContext.view.state.doc, range.start)
      : clientContext.pos;
    const to = range?.end
      ? positionToOffset(clientContext.view.state.doc, range.end)
      : clientContext.pos;
    const { value, kind, urls } = await getClientMarkupContent(
      contents,
      this._fileSystemReader
    );
    const dom = getClientMarkupDom({
      content: { value, kind },
      language: this._language,
      highlighter: this._highlighter,
    });
    const destroy = () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
    return {
      from,
      to,
      dom,
      destroy,
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
    const result: FoldingRange[] = await this._connection.sendRequest(
      FoldingRangeRequest.method,
      { textDocument: this._textDocument }
    );
    if (result) {
      const transaction = this._supports.folding.transaction(
        view.state,
        result
      );
      view.dispatch(transaction);
    }
  }

  async updateDocumentColors(view: EditorView) {
    const result: ColorInformation[] = await this._connection.sendRequest(
      DocumentColorRequest.method,
      { textDocument: this._textDocument }
    );
    const transaction = this._supports.color.transaction(view.state, result);
    view.dispatch(transaction);
  }
}
