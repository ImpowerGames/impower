import * as vscode from "vscode";
import { SparkdownCompletionProvider } from "../providers/Completion";
import { SparkdownFoldingRangeProvider } from "../providers/Folding";

export const activateLanguageAssistance = (): void => {
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
};
