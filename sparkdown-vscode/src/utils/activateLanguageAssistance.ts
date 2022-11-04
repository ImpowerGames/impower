import * as vscode from "vscode";
import { SparkdownCompletionProvider } from "../providers/Completion";
import { SparkdownFoldingRangeProvider } from "../providers/Folding";
import { diagnosticCollection } from "../state/diagnosticCollection";

export const activateLanguageAssistance = (
  context: vscode.ExtensionContext
): void => {
  // Setup language folding
  vscode.languages.registerFoldingRangeProvider(
    { language: "sparkdown" },
    new SparkdownFoldingRangeProvider()
  );
  // Setup language autocomplete
  vscode.languages.registerCompletionItemProvider(
    { language: "sparkdown" },
    new SparkdownCompletionProvider(),
    "\n",
    "\r",
    "-",
    " "
  );
  context.subscriptions.push(diagnosticCollection);
};
