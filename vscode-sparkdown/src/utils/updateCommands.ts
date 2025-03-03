import * as vscode from "vscode";
import { SparkdownFileDecorationProvider } from "../providers/SparkdownFileDecorationProvider";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";

export const updateCommands = (uri: vscode.Uri) => {
  SparkdownFileDecorationProvider.instance.update(uri);
  SparkdownCommandTreeDataProvider.instance.update(uri);
};
