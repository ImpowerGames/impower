import { EditorView, PluginValue, ViewUpdate } from "@codemirror/view";

import { setDiagnostics } from "@codemirror/lint";
import {
  Diagnostic,
  PublishDiagnosticsParams,
} from "vscode-languageserver-protocol";
import { DidParseParams } from "../types/DidParseTextDocument";
import { getEditorDiagnostics } from "../utils/getEditorDiagnostics";
import throttle from "../utils/throttle";
import ColorSupport from "./ColorSupport";
import FoldingSupport from "./FoldingSupport";
import type LanguageServerConnection from "./LanguageServerConnection";

export default class LanguageClientPlugin implements PluginValue {
  protected _view: EditorView;
  protected _connection: LanguageServerConnection;

  protected _document: { uri: string };
  protected _documentVersion: number;

  protected declare throttledChange: () => void;

  protected _foldingSupport?: FoldingSupport;
  protected _colorSupport?: ColorSupport;

  constructor(
    view: EditorView,
    connection: LanguageServerConnection,
    documentUri: string,
    options?: {
      changeDelay?: number;
    }
  ) {
    this._view = view;
    this._connection = connection;
    this._document = { uri: documentUri };
    this._documentVersion = 0;

    this.bind();

    this.initialize({
      documentText: this._view.state.doc.toString(),
    });

    const changeDelay = options?.changeDelay ?? 500;
    this.throttledChange = throttle(() => {
      this.sendChange({
        documentText: this._view.state.doc.toString(),
      });
    }, changeDelay);
  }

  update(u: ViewUpdate) {
    if (!u.docChanged) {
      return;
    }
    this.throttledChange();
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

  protected async initialize({ documentText }: { documentText: string }) {
    if (this._connection.starting) {
      await this._connection.starting;
    }
    this._connection.notifyDidOpenTextDocument({
      textDocument: {
        uri: this._document.uri,
        languageId: this._connection.id,
        text: documentText,
        version: this._documentVersion,
      },
    });
    const serverCapabilities = this._connection.serverCapabilities;
    if (serverCapabilities?.foldingRangeProvider) {
      this.initializeFoldingSupport();
    }
    if (serverCapabilities?.colorProvider) {
      this.initializeDocumentColors();
    }
  }

  async initializeFoldingSupport() {
    const support = new FoldingSupport();
    support.activate(this._view);
    this._foldingSupport = support;
  }

  async initializeDocumentColors() {
    const support = new ColorSupport();
    support.activate(this._view);
    this._colorSupport = support;
  }

  handleDiagnostics = (params: PublishDiagnosticsParams) => {
    if (
      params.uri !== this._document.uri ||
      (params.version != null && params.version !== this._documentVersion)
    ) {
      return;
    }
    this.updateDiagnostics(params.diagnostics);
  };

  handleParse = async (params: DidParseParams) => {
    if (
      params.uri !== this._document.uri ||
      (params.version != null && params.version !== this._documentVersion)
    ) {
      return;
    }
    this.updateFoldingRanges();
    this.updateDocumentColors();
  };

  updateDiagnostics(diagnostics: Diagnostic[]) {
    const transaction = setDiagnostics(
      this._view.state,
      getEditorDiagnostics(this._view.state, diagnostics)
    );
    this._view.dispatch(transaction);
  }

  async updateFoldingRanges() {
    if (this._foldingSupport) {
      const result = await this._connection.requestFoldingRanges({
        textDocument: this._document,
      });
      if (result) {
        const transaction = this._foldingSupport.transaction(
          this._view.state,
          result
        );
        this._view.dispatch(transaction);
      }
    }
  }

  async updateDocumentColors() {
    if (this._colorSupport) {
      const result = await this._connection.requestDocumentColors({
        textDocument: this._document,
      });
      const transaction = this._colorSupport.transaction(
        this._view.state,
        result
      );
      this._view.dispatch(transaction);
    }
  }

  protected async sendChange({ documentText }: { documentText: string }) {
    this._documentVersion += 1;
    await this._connection.notifyDidChangeTextDocument({
      textDocument: {
        uri: this._document.uri,
        version: this._documentVersion,
      },
      contentChanges: [{ text: documentText }],
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

  // async requestCompletion(
  //   context: CompletionContext,
  //   { line, character }: { line: number; character: number },
  //   {
  //     triggerKind,
  //     triggerCharacter,
  //   }: {
  //     triggerKind: CompletionTriggerKind;
  //     triggerCharacter: string | undefined;
  //   }
  // ): Promise<CompletionResult | null> {
  //   if (!this.client.ready || !this.client.capabilities!.completionProvider)
  //     return null;
  //   this.sendChange({
  //     documentText: context.state.doc.toString(),
  //   });

  //   const result = await this.client.textDocumentCompletion({
  //     textDocument: { uri: this.documentUri },
  //     position: { line, character },
  //     context: {
  //       triggerKind,
  //       triggerCharacter,
  //     },
  //   });

  //   if (!result) return null;

  //   const items = "items" in result ? result.items : result;

  //   let options = items.map(
  //     ({
  //       detail,
  //       label,
  //       kind,
  //       textEdit,
  //       documentation,
  //       sortText,
  //       filterText,
  //     }) => {
  //       const completion: Completion & {
  //         filterText: string;
  //         sortText?: string;
  //         apply: string;
  //       } = {
  //         label,
  //         detail,
  //         apply: textEdit?.newText ?? label,
  //         type: kind && CompletionItemKindMap[kind].toLowerCase(),
  //         sortText: sortText ?? label,
  //         filterText: filterText ?? label,
  //       };
  //       if (documentation) {
  //         completion.info = formatContents(documentation);
  //       }
  //       return completion;
  //     }
  //   );

  //   const [span, match] = prefixMatch(options);
  //   const token = context.matchBefore(match);
  //   let { pos } = context;

  //   if (token) {
  //     pos = token.from;
  //     const word = token.text.toLowerCase();
  //     if (/^\w+$/.test(word)) {
  //       options = options
  //         .filter(({ filterText }) => filterText.toLowerCase().startsWith(word))
  //         .sort(({ apply: a }, { apply: b }) => {
  //           switch (true) {
  //             case a.startsWith(token.text) && !b.startsWith(token.text):
  //               return -1;
  //             case !a.startsWith(token.text) && b.startsWith(token.text):
  //               return 1;
  //           }
  //           return 0;
  //         });
  //     }
  //   }
  //   return {
  //     from: pos,
  //     options,
  //   };
  // }
}
