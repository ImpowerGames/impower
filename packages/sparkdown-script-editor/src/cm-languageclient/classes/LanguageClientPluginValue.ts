import { EditorView, PluginValue, ViewUpdate } from "@codemirror/view";

import {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { Language } from "@codemirror/language";
import { setDiagnostics } from "@codemirror/lint";
import {
  Diagnostic,
  PublishDiagnosticsParams,
} from "vscode-languageserver-protocol";
import { languageClientConfig } from "../extensions/languageClient";
import { DidParseParams } from "../types/DidParseTextDocument";
import debounce from "../utils/debounce";
import { getClientCompletionInfo } from "../utils/getClientCompletionInfo";
import { getClientCompletionType } from "../utils/getClientCompletionType";
import { getClientDiagnostics } from "../utils/getClientDiagnostics";
import { getServerCompletionContext } from "../utils/getServerCompletionContext";
import { offsetToPosition } from "../utils/offsetToPosition";
import { prefixMatch } from "../utils/prefixMatch";
import throttle from "../utils/throttle";
import type LanguageServerConnection from "./LanguageServerConnection";
import ColorSupport from "./features/ColorSupport";
import CompletionSupport from "./features/CompletionSupport";
import FoldingSupport from "./features/FoldingSupport";

export default class LanguageClientPluginValue implements PluginValue {
  protected _view: EditorView;

  protected _connection: LanguageServerConnection;
  protected _language: Language;
  protected _document: { uri: string };
  protected _documentVersion: number;

  protected _foldingSupport: FoldingSupport;
  protected _colorSupport: ColorSupport;
  protected _completionSupport: CompletionSupport;

  protected declare throttledChange: () => void;
  protected declare debouncedChange: () => void;

  constructor(view: EditorView) {
    this._view = view;
    const config = view.state.facet(languageClientConfig);
    this._connection = config.connection;
    this._language = config.language;
    this._document = { uri: config.documentUri };
    this._documentVersion = 0;
    this._foldingSupport = new FoldingSupport();
    this._colorSupport = new ColorSupport();
    this._completionSupport = new CompletionSupport([
      (context) => this.requestCompletions(context),
    ]);

    this.bind();

    this.initialize(view, view.state.doc.toString());

    const throttleDelay = config?.throttleDelay;
    this.throttledChange = throttle(() => {
      this.sendChange(view.state.doc.toString());
    }, throttleDelay);

    const debounceDelay = config?.debounceDelay;
    this.debouncedChange = debounce(() => {
      this.sendChange(view.state.doc.toString());
    }, debounceDelay);
  }

  update(u: ViewUpdate) {
    if (!u.docChanged) {
      return;
    }
    this.throttledChange();
    this.debouncedChange();
  }

  destroy() {
    this.unbind();
  }

  bind() {
    this._connection.publishDiagnosticsEvent.addListener(
      this.handleDiagnostics
    );
    this._connection.parseEvent.addListener(this.handleParse);
  }

  unbind() {
    this._connection.publishDiagnosticsEvent.removeListener(
      this.handleDiagnostics
    );
    this._connection.parseEvent.removeListener(this.handleParse);
  }

  protected async initialize(view: EditorView, text: string) {
    if (this._connection.starting) {
      await this._connection.starting;
    }
    this._connection.notifyDidOpenTextDocument({
      textDocument: {
        uri: this._document.uri,
        languageId: this._connection.id,
        text,
        version: this._documentVersion,
      },
    });
    const serverCapabilities = this._connection.serverCapabilities;
    if (serverCapabilities?.foldingRangeProvider) {
      this.initializeFoldingSupport(view);
    }
    if (serverCapabilities?.colorProvider) {
      this.initializeDocumentColors(view);
    }
    if (serverCapabilities?.completionProvider) {
      this.initializeCompletionSupport(view);
    }
  }

  async initializeFoldingSupport(view: EditorView) {
    this._foldingSupport.activate(view);
  }

  async initializeDocumentColors(view: EditorView) {
    this._colorSupport.activate(view);
  }

  async initializeCompletionSupport(view: EditorView) {
    this._completionSupport.activate(view);
  }

  handleDiagnostics = (params: PublishDiagnosticsParams) => {
    if (
      params.uri !== this._document.uri ||
      (params.version != null && params.version !== this._documentVersion)
    ) {
      return;
    }
    this.updateDiagnostics(this._view, params.diagnostics);
  };

  handleParse = async (params: DidParseParams) => {
    if (
      params.uri !== this._document.uri ||
      (params.version != null && params.version !== this._documentVersion)
    ) {
      return;
    }
    this.updateFoldingRanges(this._view);
    this.updateDocumentColors(this._view);
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
      textDocument: this._document,
    });
    if (result) {
      const transaction = this._foldingSupport.transaction(view.state, result);
      view.dispatch(transaction);
    }
  }

  async updateDocumentColors(view: EditorView) {
    const result = await this._connection.requestDocumentColors({
      textDocument: this._document,
    });
    const transaction = this._colorSupport.transaction(view.state, result);
    view.dispatch(transaction);
  }

  async requestCompletions(
    clientContext: CompletionContext
  ): Promise<CompletionResult | null> {
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
      textDocument: this._document,
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
            this._language
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
  }

  protected async sendChange(text: string) {
    this._documentVersion += 1;
    await this._connection.notifyDidChangeTextDocument({
      textDocument: {
        uri: this._document.uri,
        version: this._documentVersion,
      },
      contentChanges: [{ text }],
    });
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
