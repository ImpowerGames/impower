import { Range } from "@impower/spark-editor-protocol/src/types/Range";
import * as vscode from "vscode";

export const getRange = (range: Range): vscode.Range =>
  new vscode.Range(
    new vscode.Position(range.start.line, range.start.character),
    new vscode.Position(range.end.line, range.end.character)
  );
