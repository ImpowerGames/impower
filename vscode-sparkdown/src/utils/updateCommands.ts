import * as vscode from "vscode";
import { commandDecorationProvider } from "../state/commandDecorationProvider";
import { commandViewProvider } from "../state/commandViewProvider";

export const updateCommands = (uri: vscode.Uri) => {
  commandViewProvider.update(uri);
  commandDecorationProvider.update(uri);
};
