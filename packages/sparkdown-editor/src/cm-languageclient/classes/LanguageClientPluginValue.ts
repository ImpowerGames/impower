import { EditorView, PluginValue, ViewUpdate } from "@codemirror/view";

import { setDiagnostics } from "@codemirror/lint";
import {
  Diagnostic,
  PublishDiagnosticsParams,
} from "vscode-languageserver-protocol";
import { languageClientConfig } from "../extensions/languageClient";
import { DidParseParams } from "../types/DidParseTextDocument";
import { getEditorDiagnostics } from "../utils/getEditorDiagnostics";
import throttle from "../utils/throttle";
import { colorSupport } from "./ColorSupport";
import { foldingSupport } from "./FoldingSupport";
import type LanguageServerConnection from "./LanguageServerConnection";

export default class LanguageClientPluginValue implements PluginValue {
  protected _view: EditorView;

  protected _connection: LanguageServerConnection;
  protected _document: { uri: string };
  protected _documentVersion: number;

  protected declare throttledChange: () => void;

  constructor(view: EditorView) {
    this._view = view;
    const config = view.state.facet(languageClientConfig);
    this._connection = config.connection;
    this._document = { uri: config.documentUri };
    this._documentVersion = 0;

    this.bind();

    this.initialize(view, view.state.doc.toString());

    const throttleDelay = config?.throttleDelay;
    this.throttledChange = throttle(() => {
      this.sendChange(view.state.doc.toString());
    }, throttleDelay);
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
  }

  async initializeFoldingSupport(view: EditorView) {
    foldingSupport.activate(view);
  }

  async initializeDocumentColors(view: EditorView) {
    colorSupport.activate(view);
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
      getEditorDiagnostics(view.state, diagnostics)
    );
    view.dispatch(transaction);
  }

  async updateFoldingRanges(view: EditorView) {
    const result = await this._connection.requestFoldingRanges({
      textDocument: this._document,
    });
    if (result) {
      const transaction = foldingSupport.transaction(view.state, result);
      view.dispatch(transaction);
    }
  }

  async updateDocumentColors(view: EditorView) {
    const result = await this._connection.requestDocumentColors({
      textDocument: this._document,
    });
    const transaction = colorSupport.transaction(view.state, result);
    view.dispatch(transaction);
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
