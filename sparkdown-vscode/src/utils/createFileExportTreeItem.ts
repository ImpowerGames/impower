import * as vscode from "vscode";

export const createFileExportTreeItem = (
  sourceStat: vscode.FileStat | undefined,
  commandUri: vscode.Uri | undefined,
  commandStat: vscode.FileStat | undefined,
  exporting: boolean | undefined,
  extension: string,
  tooltip = ""
): vscode.TreeItem => {
  const action = commandStat ? "Sync" : "Export";
  const modified =
    sourceStat &&
    commandStat &&
    (sourceStat?.mtime || 0) > (commandStat?.mtime || 0);
  const item = new vscode.TreeItem(`${action} ${extension.toUpperCase()}`);
  item.resourceUri = commandUri;
  item.iconPath = new vscode.ThemeIcon(
    exporting ? "sync~spin" : action?.toLowerCase(),
    modified
      ? new vscode.ThemeColor("gitDecoration.modifiedResourceForeground")
      : undefined
  );
  item.tooltip = tooltip;
  item.command = {
    command: `sparkdown.export${extension.toLowerCase()}`,
    title: "",
  };
  return item;
};
