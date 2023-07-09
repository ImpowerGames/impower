import * as vscode from "vscode";
import { SparkdownCommandFileDecorationProvider } from "../providers/SparkdownCommandFileDecorationProvider";
import { SparkdownCommandTreeDataProvider } from "../providers/SparkdownCommandTreeDataProvider";

export const updateCommands = (uri: vscode.Uri) => {
  SparkdownCommandTreeDataProvider.instance.update(uri);
  SparkdownCommandFileDecorationProvider.instance.update(uri);
};
