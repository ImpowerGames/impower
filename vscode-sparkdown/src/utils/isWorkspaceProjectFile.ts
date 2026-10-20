import * as vscode from "vscode";

/** Discovery is relative to each workspace root, including hidden checkouts. */
export const isWorkspaceProjectFile = (uri: vscode.Uri): boolean => {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return false;
  const root = folder.uri.path.replace(/\/$/, "") + "/";
  const relative = uri.path.slice(root.length);
  return !relative.split("/").slice(0, -1).some(
    part => part === "node_modules" || part.startsWith("."),
  );
};
