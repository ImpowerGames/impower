import * as vscode from "vscode";

export const onDidChangeCodeLensesEmitter: vscode.EventEmitter<void> =
  new vscode.EventEmitter<void>();
