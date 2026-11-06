import type { PublishDiagnosticsParams } from "@impower/spark-editor-protocol/src/protocols/textDocument/PublishDiagnosticsMessage";
import { effect } from "@preact/signals";
import type {
  Diagnostic,
  DocumentSymbol,
} from "vscode-languageserver-protocol";
import workspace from "./WorkspaceStore";

export interface OutlineSources {
  openedUri: () => string | undefined;
  getDocumentSymbols: (uri: string) => Promise<DocumentSymbol[]>;
  getFileText: (uri: string) => Promise<string>;
  onPublishedDiagnostics: (
    listener: (params: PublishDiagnosticsParams) => void,
  ) => () => void;
}

export const firstContentLine = (text: string): number | undefined => {
  const index = text.split(/\r?\n/).findIndex((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith("//");
  });
  return index < 0 ? undefined : index;
};

export default class WorkspaceOutline {
  protected readonly _sources: OutlineSources;

  protected readonly _diagnostics = new Map<string, readonly Diagnostic[]>();

  protected readonly _disposers: (() => void)[];

  protected _uri: string | undefined;

  protected _request = 0;

  constructor(sources: OutlineSources) {
    this._sources = sources;
    this._disposers = [
      sources.onPublishedDiagnostics(({ uri, diagnostics }) => {
        this._diagnostics.set(uri, diagnostics);
        if (uri === this._uri) {
          void this.refresh();
        }
      }),
      effect(() => {
        const uri = sources.openedUri();
        if (uri !== this._uri) {
          this._uri = uri;
          void this.refresh();
        }
      }),
    ];
  }

  async refresh() {
    const uri = this._uri;
    const request = ++this._request;
    if (!uri) {
      workspace.outline.value = null;
      return;
    }
    try {
      const [symbols, text] = await Promise.all([
        this._sources.getDocumentSymbols(uri),
        this._sources.getFileText(uri).catch(() => ""),
      ]);
      if (request !== this._request) {
        return;
      }
      workspace.outline.value = {
        uri,
        symbols,
        diagnostics: this._diagnostics.get(uri) ?? [],
        firstContentLine: firstContentLine(text),
      };
    } catch (err) {
      console.error(err);
    }
  }

  dispose() {
    this._disposers.forEach((dispose) => dispose());
  }
}
