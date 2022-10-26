import * as vscode from "vscode";
import { commandViewProvider } from "../state/commandViewProvider";

export const updateCommands = (doc: vscode.TextDocument) => {
  commandViewProvider.update(doc.uri);
};
