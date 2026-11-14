import type { PreviewLineResult } from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import type { PublishDiagnosticsParams } from "@impower/spark-editor-protocol/src/protocols/textDocument/PublishDiagnosticsMessage";
import { effect } from "@preact/signals";
import workspace, { type ShownBeat } from "./WorkspaceStore";

export interface PreviewLineSources {
  caret: () => { uri: string; line: number } | undefined;
  shownBeat: () => ShownBeat;
  getPreviewLine: (
    uri: string,
    line: number,
    shownBeat: ShownBeat,
  ) => Promise<PreviewLineResult>;
  onPublishedDiagnostics: (
    listener: (params: PublishDiagnosticsParams) => void,
  ) => () => void;
}

export default class WorkspacePreviewLine {
  protected readonly _sources: PreviewLineSources;

  protected readonly _disposers: (() => void)[];

  protected _caret: { uri: string; line: number } | undefined;

  protected _shownBeat: ShownBeat = null;

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
        const shownBeat = sources.shownBeat();
        if (
          caret?.uri !== this._caret?.uri ||
          caret?.line !== this._caret?.line ||
          shownBeat !== this._shownBeat
        ) {
          this._caret = caret;
          this._shownBeat = shownBeat;
          void this.refresh();
        }
      }),
    ];
  }

  async refresh() {
    const caret = this._caret;
    const shownBeat = this._shownBeat;
    const request = ++this._request;
    if (!caret) {
      workspace.previewLine.value = null;
      return;
    }
    try {
      const preview = await this._sources.getPreviewLine(
        caret.uri,
        caret.line,
        shownBeat,
      );
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
