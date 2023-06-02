import * as vscode from "vscode";

export const typingState: { disposeTyping?: vscode.Disposable } = {
  disposeTyping: undefined,
};
