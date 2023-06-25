import { EditorView, PluginValue, ViewUpdate } from "@codemirror/view";

import { Diagnostic, setDiagnostics } from "@codemirror/lint";
import {
  PublishDiagnosticsNotification,
  PublishDiagnosticsParams,
} from "vscode-languageserver-protocol";
import debounce from "../utils/debounce";
import { getActions } from "../utils/getActions";
import { getSeverity } from "../utils/getSeverity";
import { positionToOffset } from "../utils/positionToOffset";
import type LanguageClient from "./LanguageClient";

export default class LanguageClientPlugin implements PluginValue {
  protected _view: EditorView;
  protected _client: LanguageClient;

  protected _documentUri: string;
  protected _documentVersion: number;

  protected declare debouncedChange: () => void;

  constructor(
    view: EditorView,
    client: LanguageClient,
    documentUri: string,
    options?: {
      changeDelay?: number;
    }
  ) {
    this._view = view;
    this._client = client;
    this._documentUri = documentUri;
    this._documentVersion = 0;

    this._client.attachPlugin(this);

    this.initialize({
      documentText: this._view.state.doc.toString(),
    });

    const changeDelay = options?.changeDelay ?? 500;

    this.debouncedChange = debounce(() => {
      this.sendChange({
        documentText: this._view.state.doc.toString(),
      });
    }, changeDelay);
  }

  update(u: ViewUpdate) {
    if (!u.docChanged) {
      return;
    }
    this.debouncedChange();
  }

  destroy() {
    this._client.detachPlugin(this);
  }

  protected async initialize({ documentText }: { documentText: string }) {
    if (this._client.starting) {
      await this._client.starting;
    }
    this._client.textDocumentDidOpen({
      textDocument: {
        uri: this._documentUri,
        languageId: this._client.id,
        text: documentText,
        version: this._documentVersion,
      },
    });
  }

  handleNotification(method: string, params: any): void {
    try {
      switch (method) {
        case PublishDiagnosticsNotification.method: {
          this.processDiagnostics(params);
          break;
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  protected async sendChange({ documentText }: { documentText: string }) {
    return this._client.textDocumentDidChange({
      textDocument: {
        uri: this._documentUri,
        version: this._documentVersion++,
      },
      contentChanges: [{ text: documentText }],
    });
  }

  protected processDiagnostics(params: PublishDiagnosticsParams) {
    if (params.uri !== this._documentUri) {
      return;
    }
    const diagnostics: Diagnostic[] = params.diagnostics
      .map(
        (d): Diagnostic => ({
          from: positionToOffset(this._view.state.doc, d.range.start),
          to: positionToOffset(this._view.state.doc, d.range.end),
          severity: getSeverity(d.severity),
          message: d.message,
          actions: getActions(d.data),
        })
      )
      .filter(
        ({ from, to }) =>
          from !== null && to !== null && from !== undefined && to !== undefined
      )
      .sort((a, b) => {
        switch (true) {
          case a.from < b.from:
            return -1;
          case a.from > b.from:
            return 1;
        }
        return 0;
      });
    this._view.dispatch(setDiagnostics(this._view.state, diagnostics));
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
