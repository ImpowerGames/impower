import type { PreviewLineResult } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import type { PublishDiagnosticsParams } from "@impower/spark-editor-protocol/src/protocols/textDocument/PublishDiagnosticsMessage";
import { effect } from "@preact/signals";
import workspace, { type ShownBeatDescription } from "./WorkspaceStore";

export interface PreviewLineSources {
  caret: () => { uri: string; line: number } | undefined;
  shownBeatDescription: () => ShownBeatDescription;
  getPreviewLine: (uri: string, line: number) => Promise<PreviewLineResult>;
  onPublishedDiagnostics: (
    listener: (params: PublishDiagnosticsParams) => void,
  ) => () => void;
}

export default class WorkspacePreviewLine {
  protected readonly _sources: PreviewLineSources;

  protected readonly _disposers: (() => void)[];

  protected _caret: { uri: string; line: number } | undefined;

  protected _shown: ShownBeatDescription = null;

  protected _request = 0;

  constructor(sources: PreviewLineSources) {
    this._sources = sources;
    this._disposers = [
      sources.onPublishedDiagnostics(({ uri }) => {
        if (!this._shown && uri === this._caret?.uri) {
          void this.refresh();
        }
      }),
      effect(() => {
        const caret = sources.caret();
        const shown = sources.shownBeatDescription();
        if (
          caret?.uri !== this._caret?.uri ||
          caret?.line !== this._caret?.line ||
          shown !== this._shown
        ) {
          this._caret = caret;
          this._shown = shown;
          void this.refresh();
        }
      }),
    ];
  }

  async refresh() {
    const caret = this._caret;
    const shown = this._shown;
    const request = ++this._request;
    if (!caret) {
      workspace.previewLine.value = null;
      return;
    }
    if (shown) {
      workspace.previewLine.value = { ...caret, preview: shown };
      return;
    }
    try {
      const preview = await this._sources.getPreviewLine(caret.uri, caret.line);
      if (request !== this._request) {
        return;
      }
      workspace.previewLine.value = preview ? { ...caret, preview } : null;
    } catch (err) {
      console.error(err);
    }
  }

  dispose() {
    this._disposers.forEach((dispose) => dispose());
  }
}
