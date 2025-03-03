import * as vscode from "vscode";
import { SparkdownOutlineTreeDataProvider } from "../providers/SparkdownOutlineTreeDataProvider";
import { SparkdownFileDecorationProvider } from "../providers/SparkdownFileDecorationProvider";

export const updateOutline = (uri: vscode.Uri) => {
  SparkdownFileDecorationProvider.instance.update(uri);
  SparkdownOutlineTreeDataProvider.instance.update(uri);
};
