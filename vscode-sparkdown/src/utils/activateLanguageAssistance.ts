import * as vscode from "vscode";
import { SparkdownCompletionProvider } from "../providers/Completion";

export const activateLanguageAssistance = (
  _context: vscode.ExtensionContext
): void => {
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
