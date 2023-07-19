import * as vscode from "vscode";
import { typingState } from "../state/typingState";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";
import { registerTyping } from "./registerTyping";

export const activateParentheticalNewlineHelper = (
  context: vscode.ExtensionContext
): void => {
  registerTyping();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (
        change.affectsConfiguration(
          "sparkdown.general.parentheticalNewLineHelper"
        )
      ) {
        const uri = getActiveSparkdownDocument();
        if (!uri) {
          return;
        }
        const config = getSparkdownPreviewConfig(uri);
        if (typingState.disposeTyping) {
          typingState.disposeTyping.dispose();
        }
        if (config.editor_parenthetical_newline_helper) {
          registerTyping();
        }
      }
    })
  );
};
