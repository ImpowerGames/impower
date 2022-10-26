import * as vscode from "vscode";
import { capitalize } from "./capitalize";

export const createFileExportTreeItem = (
  action: "export" | "sync",
  extension: string,
  tooltip = ""
): vscode.TreeItem => {
  const item = new vscode.TreeItem(
    `${capitalize(action)} ${extension.toUpperCase()}`
  );
  item.iconPath = new vscode.ThemeIcon(action);
  item.tooltip = tooltip;
  item.command = {
    command: `sparkdown.export${extension.toLowerCase()}`,
    title: "",
  };
  return item;
};
