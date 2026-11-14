import type { PreviewLineResult } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import type { PublishDiagnosticsParams } from "@impower/spark-editor-protocol/src/protocols/textDocument/PublishDiagnosticsMessage";
import { effect } from "@preact/signals";
import workspace from "./WorkspaceStore";

export interface PreviewLineSources {
  caret: () => { uri: string; line: number } | undefined;
  getPreviewLine: (uri: string, line: number) => Promise<PreviewLineResult>;
  onPublishedDiagnostics: (
    listener: (params: PublishDiagnosticsParams) => void,
  ) => () => void;
}

export default class WorkspacePreviewLine {
  protected readonly _sources: PreviewLineSources;

  protected readonly _disposers: (() => void)[];

  protected _caret: { uri: string; line: number } | undefined;

  protected _request = 0;

  constructor(sources: PreviewLineSources) {
    this._sources = sources;
    this._disposers = [
      sources.onPublishedDiagnostics(({ uri }) => {
        if (uri === this._caret?.uri) {
          void this.refresh();
        }
      }),
      effect(() => {
        const caret = sources.caret();
        if (caret?.uri !== this._caret?.uri || caret?.line !== this._caret?.line) {
          this._caret = caret;
          void this.refresh();
        }
      }),
    ];
  }

  async refresh() {
    const caret = this._caret;
    const request = ++this._request;
    if (!caret) {
      workspace.previewLine.value = null;
      return;
    }
    try {
      const preview = await this._sources.getPreviewLine(caret.uri, caret.line);
      if (request !== this._request || !preview) {
        return;
      }
      workspace.previewLine.value = { ...caret, preview };
    } catch (err) {
      console.error(err);
    }
  }

  dispose() {
    this._disposers.forEach((dispose) => dispose());
  }
}
