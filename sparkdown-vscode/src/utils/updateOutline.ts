import * as vscode from "vscode";
import { outlineViewProviderState } from "../state/outlineViewProviderState";

export const updateOutline = (doc: vscode.TextDocument) => {
  performance.mark("updateOutline-start");
  if (outlineViewProviderState.provider) {
    outlineViewProviderState.provider.update(doc.uri);
  }
  performance.mark("updateOutline-end");
  performance.measure(
    "updateOutline",
    "updateOutline-start",
    "updateOutline-end"
  );
};
