import { Range } from "@impower/spark-editor-protocol/src/types/Range";
import * as vscode from "vscode";

export const getServerRange = (range: vscode.Range): Range => ({
  start: {
    line: range.start.line ?? 0,
    character: range.start.character ?? 0,
  },
  end: {
    line: range.end.line ?? 0,
    character: range.end.character ?? 0,
  },
});
