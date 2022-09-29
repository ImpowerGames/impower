/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { editorState } from "../state/editorState";
import { Disposable } from "../utils/dispose";
import { getEditor } from "../utils/getEditor";
import { getSparkdownConfig } from "../utils/getSparkdownConfig";
import { getVisibleLine } from "../utils/getVisibleLine";
import { scrollPreviewToLine } from "../utils/scrollPreviewToLine";

export class TopmostLineMonitor extends Disposable {
  private readonly pendingUpdates: Record<string, number> = {};
  private readonly throttle = 50;

  constructor() {
    super();
    this._register(
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor.document.languageId === "sparkdown") {
          const line = getVisibleLine(event.textEditor);
          if (typeof line === "number") {
            this.updateLine(event.textEditor.document.uri, line);
          }
        }
      })
    );
  }

  private readonly _onChanged = this._register(
    new vscode.EventEmitter<{
      readonly resource: vscode.Uri;
      readonly line: number;
    }>()
  );
  public readonly onDidChanged = this._onChanged.event;

  private updateLine(resource: vscode.Uri, line: number) {
    const key = resource.toString();
    if (!this.pendingUpdates[key]) {
      // schedule update
      setTimeout(() => {
        if (this.pendingUpdates[key]) {
          this._onChanged.fire({
            resource,
            line: this.pendingUpdates[key] as number,
          });
          delete this.pendingUpdates[key];
        }
      }, this.throttle);
    }

    this.pendingUpdates[key] = line;
  }
}

const _topmostLineMonitor = new TopmostLineMonitor();
_topmostLineMonitor.onDidChanged((event) => {
  scrollTo(event.line, event.resource);
});

const scrollTo = (topLine: number, resource: vscode.Uri): void => {
  if (editorState.isScrolling) {
    editorState.isScrolling = false;
    return;
  }

  const editor = getEditor(resource);
  if (!editor) {
    return;
  }

  const config = getSparkdownConfig(editor.document.uri);
  if (config.game_preview_synchronized_with_cursor) {
    scrollPreviewToLine("game", "scroll", topLine, editor);
  }
  if (config.screenplay_preview_synchronized_with_cursor) {
    scrollPreviewToLine("screenplay", "scroll", topLine, editor);
  }
};
