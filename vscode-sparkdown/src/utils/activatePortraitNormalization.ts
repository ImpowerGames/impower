import { normalizeSVGAttributeNames } from "@impower/sparkdown/src/attributes";
import * as vscode from "vscode";

/** Preserve artist-authored names without changing SVG IDs or references. */
export const activatePortraitNormalization = (context: vscode.ExtensionContext) => {
  context.subscriptions.push(vscode.commands.registerCommand(
    "sparkdown.normalizePortraitLayerNames",
    async (selected?: vscode.Uri) => {
      const uri = selected ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri || !uri.path.toLowerCase().endsWith(".svg")) {
        await vscode.window.showInformationMessage("Open an SVG or select one in the Explorer first.");
        return;
      }
      const document = await vscode.workspace.openTextDocument(uri);
      const source = document.getText();
      const normalized = normalizeSVGAttributeNames(source);
      if (source === normalized) {
        await vscode.window.showInformationMessage("This SVG's layer names are already normalized.");
        return;
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(source.length)), normalized);
      // A workspace edit participates in undo and leaves saving to the author.
      await vscode.workspace.applyEdit(edit);
    },
  ));
};
