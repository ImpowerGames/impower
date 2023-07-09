import * as vscode from "vscode";
import { SparkdownOutlineFileDecorationProvider } from "../providers/SparkdownOutlineFileDecorationProvider";
import { SparkdownOutlineTreeDataProvider } from "../providers/SparkdownOutlineTreeDataProvider";

export const updateOutline = (
  context: vscode.ExtensionContext,
  doc: vscode.TextDocument
) => {
  performance.mark("updateOutline-start");
  SparkdownOutlineTreeDataProvider.instance.update(context, doc.uri);
  SparkdownOutlineFileDecorationProvider.instance.update(doc.uri);
  performance.mark("updateOutline-end");
  performance.measure(
    "updateOutline",
    "updateOutline-start",
    "updateOutline-end"
  );
};
