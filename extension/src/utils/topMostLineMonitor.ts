/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { Disposable } from "./dispose";

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

/**
 * Get the top-most visible range of `editor`.
 *
 * Returns a fractional line number based the visible character within the line.
 * Floor to get real line number
 */
export function getVisibleLine(editor: vscode.TextEditor): number | undefined {
  if (!editor?.visibleRanges?.length) {
    return undefined;
  }

  const firstVisiblePosition = editor.visibleRanges[0].start;
  const lineNumber = firstVisiblePosition.line;
  const line = editor.document.lineAt(lineNumber);
  const progress =
    firstVisiblePosition.character / ((line?.text?.length || 0) + 2);
  return lineNumber + progress;
}
