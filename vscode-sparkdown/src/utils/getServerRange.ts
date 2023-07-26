import * as vscode from "vscode";
import { Range } from "vscode-languageclient";

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
