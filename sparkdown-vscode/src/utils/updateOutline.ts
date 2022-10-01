import * as vscode from "vscode";
import { outlineViewProvider } from "../state/outlineViewProvider";

export const updateOutline = (doc: vscode.TextDocument) => {
  outlineViewProvider.update(doc.uri);
};
