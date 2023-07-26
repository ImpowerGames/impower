import * as vscode from "vscode";
import { Range } from "vscode-languageclient";

export const getClientRange = (range: Range): vscode.Range =>
  new vscode.Range(
    new vscode.Position(range.start.line, range.start.character),
    new vscode.Position(range.end.line, range.end.character)
  );
