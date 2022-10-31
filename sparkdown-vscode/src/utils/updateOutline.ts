import * as vscode from "vscode";
import { outlineViewProviderState } from "../state/outlineViewProviderState";

export const updateOutline = (doc: vscode.TextDocument) => {
  if (outlineViewProviderState.provider) {
    outlineViewProviderState.provider.update(doc.uri);
  }
};
