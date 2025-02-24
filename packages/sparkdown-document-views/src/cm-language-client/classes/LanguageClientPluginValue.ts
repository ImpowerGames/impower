import {
  Completion,
  CompletionContext,
  CompletionResult,
  insertCompletionText,
  pickedCompletion,
  snippet,
  startCompletion,
} from "@codemirror/autocomplete";
import { Language } from "@codemirror/language";
import { setDiagnostics } from "@codemirror/lint";
import { EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { NodeType } from "@lezer/common";
import { Tag } from "@lezer/highlight";
import { CompletionMessage } from "../../../../spark-editor-protocol/src/protocols/textDocument/CompletionMessage";
import { DocumentColorMessage } from "../../../../spark-editor-protocol/src/protocols/textDocument/DocumentColorMessage";
import { DocumentDiagnosticMessage } from "../../../../spark-editor-protocol/src/protocols/textDocument/DocumentDiagnosticMessage";
import { FoldingRangeMessage } from "../../../../spark-editor-protocol/src/protocols/textDocument/FoldingRangeMessage";
import { HoverMessage } from "../../../../spark-editor-protocol/src/protocols/textDocument/HoverMessage";
import { PublishDiagnosticsMessage } from "../../../../spark-editor-protocol/src/protocols/textDocument/PublishDiagnosticsMessage";
import {
  Disposable,
  InsertTextFormat,
  MarkupContent,
  MessageConnection,
  ServerCapabilities,
  Diagnostic,
} from "../../../../spark-editor-protocol/src/types";
import { getDocumentVersion } from "../../cm-versioning/versioning";
import { languageClientConfig } from "../extensions/languageClient";
import { FileSystemReader } from "../types/FileSystemReader";
import { getClientCompletionType } from "../utils/getClientCompletionType";
import { getClientCompletionValidFor } from "../utils/getClientCompletionValidFor";
import { getClientDiagnostics } from "../utils/getClientDiagnostics";
import { getClientMarkupContent } from "../utils/getClientMarkupContent";
import { getClientMarkupDom } from "../utils/getClientMarkupDom";
import { getServerCompletionContext } from "../utils/getServerCompletionContext";
import { offsetToPosition } from "../utils/offsetToPosition";
import { positionToOffset } from "../utils/positionToOffset";
import ColorSupport from "./features/ColorSupport";
import CompletionSupport from "./features/CompletionSupport";
import FoldingSupport from "./features/FoldingSupport";
import HoverSupport, {
  HoverContext,
  HoverResult,
} from "./features/HoverSupport";
import LintSupport from "./features/LintSupport";

export default class LanguageClientPluginValue implements PluginValue {
  protected _view: EditorView;

  protected _serverConnection: MessageConnection;

  protected _serverCapabilities: ServerCapabilities;

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
    lint: LintSupport;
  };

  protected _disposables: Disposable[] = [];

  constructor(
    view: EditorView,
    supports: {
      folding: FoldingSupport;
      color: ColorSupport;
      completion: CompletionSupport;
      hover: HoverSupport;
      lint: LintSupport;
    }
  ) {
    this._view = view;
    this._supports = supports;
    const config = view.state.facet(languageClientConfig);
    this._textDocument = config.textDocument;
    this._serverConnection = config.serverConnection;
    this._serverCapabilities = config.serverCapabilities;
    this._fileSystemReader = config.fileSystemReader;
    this._language = config.language;
    this._highlighter = config.highlighter;

    this.bind();

    this.setInitialDiagnostics(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      this._textDocument.version = getDocumentVersion(update.state);
    }
  }

  destroy() {
    this.unbind();
  }

  bind() {
    this._disposables.push(
      this._serverConnection.onNotification(
        PublishDiagnosticsMessage.type,
        (params) => {
          if (params.uri !== this._textDocument.uri) {
            return;
          }
          this.updateDiagnostics(
            this._view,
            params.diagnostics,
            params.version
          );
          this.updateFoldingRanges(this._view);
          this.updateDocumentColors(this._view);
        }
      )
    );
    this._supports.completion.addSource(this.pullCompletions);
    this._supports.hover.addSource(this.pullHovers);
  }

  unbind() {
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
    this._supports.completion.removeSource(this.pullCompletions);
    this._supports.hover.removeSource(this.pullHovers);
  }

  pullCompletions = async (
    clientContext: CompletionContext
  ): Promise<CompletionResult | null> => {
    const position = offsetToPosition(
      clientContext.state.doc,
      clientContext.pos
    );
    const serverContext = getServerCompletionContext(
      this._serverCapabilities,
      clientContext
    );
    if (!serverContext) {
      return null;
    }
    const result = await this._serverConnection.sendRequest(
      CompletionMessage.type,
      {
        textDocument: this._textDocument,
        position,
        context: serverContext,
      }
    );
    if (!result) {
      return null;
    }
    const items = Array.isArray(result) ? result : result.items;
    const itemDefaults = Array.isArray(result) ? {} : result.itemDefaults;
    let options = items
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
      .map((item, index) => {
        const {
          detail,
          label,
          labelDetails,
          insertText,
          filterText,
          kind,
          documentation,
          command,
          textEdit,
        } = item;
        const insertTextFormat =
          item.insertTextFormat ?? itemDefaults?.insertTextFormat;
        const commitCharacters =
          item.commitCharacters ?? itemDefaults?.commitCharacters;
        const applyText = textEdit?.newText || insertText || label;
        const completion: Completion & {
          command?: {
            title: string;
            command: string;
          };
        } = {
          label,
          detail: labelDetails?.description,
          apply: (
            view: EditorView,
            completion: Completion,
            from: number,
            to: number
          ) => {
            if (
              insertTextFormat === (2 satisfies typeof InsertTextFormat.Snippet)
            ) {
              snippet(applyText.replaceAll(/\$(\d+)/g, "$${$1}"))(
                view,
                completion,
                from,
                to
              );
            } else {
              view.dispatch({
                ...insertCompletionText(view.state, applyText, from, to),
                annotations: pickedCompletion.of(completion),
              });
            }
            if (command?.command === "editor.action.triggerSuggest") {
              startCompletion(view);
            }
          },
          type: getClientCompletionType(kind),
          boost: -index,
          command,
          commitCharacters,
        };

        if (filterText != null && filterText !== label) {
          completion.label = filterText;
          completion.displayLabel = label;
        }
        if (documentation) {
          completion.info = async () => {
            let content = documentation;
            if (typeof content !== "string") {
              const { value, kind } = await getClientMarkupContent(
                content,
                this._fileSystemReader
              );
              content = { value, kind };
            }
            const dom = getClientMarkupDom({
              detail,
              content,
              language: this._language,
              highlighter: this._highlighter,
            });
            return { dom };
          };
        }
        return completion;
      });
    if (options.length === 0) {
      return null;
    }
    const triggerCharacters =
      this._serverCapabilities.completionProvider?.triggerCharacters;
    const validFor = getClientCompletionValidFor(triggerCharacters);
    const active = clientContext.matchBefore(validFor);
    const from = active?.from ?? clientContext.pos;
    // TODO: Ensure all options are shown again after backspacing until completed range is empty
    return {
      from,
      validFor,
      options,
      commitCharacters: itemDefaults?.commitCharacters,
    };
  };

  pullHovers = async (
    clientContext: HoverContext
  ): Promise<HoverResult | null> => {
    const position = offsetToPosition(
      clientContext.view.state.doc,
      clientContext.pos
    );
    const result = await this._serverConnection.sendRequest(HoverMessage.type, {
      textDocument: this._textDocument,
      position,
    });
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
    const { value, kind } = await getClientMarkupContent(
      contents,
      this._fileSystemReader
    );
    const dom = getClientMarkupDom({
      content: { value, kind },
      language: this._language,
      highlighter: this._highlighter,
    });
    return {
      from,
      to,
      dom,
    };
  };

  async setInitialDiagnostics(view: EditorView) {
    const result = await this._serverConnection.sendRequest(
      DocumentDiagnosticMessage.type,
      {
        textDocument: this._textDocument,
      }
    );
    if (result.kind === "full") {
      this.updateDiagnostics(view, result.items);
    }
  }

  async updateDiagnostics(
    view: EditorView,
    diagnostics: Diagnostic[],
    version?: number
  ) {
    const docVersion = getDocumentVersion(view.state);
    if (version === docVersion) {
      const transaction = setDiagnostics(
        view.state,
        getClientDiagnostics(view.state, diagnostics)
      );
      view.dispatch(transaction);
    }
  }

  async updateFoldingRanges(view: EditorView) {
    const result =
      (await this._serverConnection.sendRequest(FoldingRangeMessage.type, {
        textDocument: this._textDocument,
      })) || [];
    const transaction = this._supports.folding.transaction(view.state, result);
    view.dispatch(transaction);
  }

  async updateDocumentColors(view: EditorView) {
    const result = await this._serverConnection.sendRequest(
      DocumentColorMessage.type,
      { textDocument: this._textDocument }
    );
    const transaction = this._supports.color.transaction(view.state, result);
    view.dispatch(transaction);
  }
}
