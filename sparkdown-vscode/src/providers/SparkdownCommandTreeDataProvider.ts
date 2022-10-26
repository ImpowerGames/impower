import * as fs from "fs";
import * as vscode from "vscode";
import { createFileExportTreeItem } from "../utils/createFileExportTreeItem";
import { getEditor } from "../utils/getEditor";

export class SparkdownCommandTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  public readonly onDidChangeTreeDataEmitter: vscode.EventEmitter<vscode.TreeItem | null> =
    new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> =
    this.onDidChangeTreeDataEmitter.event;

  uri: vscode.Uri | undefined;

  getTreeItem(
    element: vscode.TreeItem
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }
  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!this.uri) {
      return;
    }
    const editor = getEditor(this.uri);
    if (!editor) {
      return;
    }
    const elements: vscode.TreeItem[] = [];
    const filename = editor.document.fileName.replace(/(\.[^.]*)$/, "");

    // Export Pdf Command
    const pdfFilename = filename + ".pdf";
    const pdfExists = fs.existsSync(vscode.Uri.file(pdfFilename)?.fsPath);
    elements.push(
      createFileExportTreeItem(
        pdfExists ? "sync" : "export",
        "pdf",
        pdfExists
          ? `Sync screenplay to ${pdfFilename}`
          : "Export screenplay as formatted .pdf"
      )
    );

    // Export Html Command
    const htmlFilename = filename + ".html";
    const htmlExists = fs.existsSync(vscode.Uri.file(htmlFilename)?.fsPath);
    elements.push(
      createFileExportTreeItem(
        htmlExists ? "sync" : "export",
        "html",
        htmlExists
          ? `Sync screenplay to ${htmlFilename}`
          : "Export screenplay as .html document"
      )
    );

    // Export CSV Command
    const csvFilename = filename + ".csv";
    const csvExists = fs.existsSync(vscode.Uri.file(csvFilename)?.fsPath);
    elements.push(
      createFileExportTreeItem(
        csvExists ? "sync" : "export",
        "csv",
        csvExists
          ? `Sync screenplay to ${csvFilename}`
          : "Export screenplay as translatable .csv document"
      )
    );

    // Export JSON Command
    const jsonFilename = filename + ".json";
    const jsonExists = fs.existsSync(vscode.Uri.file(jsonFilename)?.fsPath);
    elements.push(
      createFileExportTreeItem(
        jsonExists ? "sync" : "export",
        "json",
        jsonExists
          ? `Sync screenplay to ${jsonFilename}`
          : "Export screenplay tokens to .json document"
      )
    );

    // Preview Game Command
    const treePreviewGame = new vscode.TreeItem("Preview Game");
    treePreviewGame.iconPath = new vscode.ThemeIcon("open-preview");
    treePreviewGame.command = {
      command: "sparkdown.previewgame",
      title: "",
    };
    elements.push(treePreviewGame);

    // Preview Screenplay Command
    const treePreviewScreenplay = new vscode.TreeItem("Preview Screenplay");
    treePreviewScreenplay.iconPath = new vscode.ThemeIcon("open-preview");
    treePreviewScreenplay.command = {
      command: "sparkdown.previewscreenplay",
      title: "",
    };
    elements.push(treePreviewScreenplay);

    // Show Statistics Command
    // const statistics = new vscode.TreeItem("View Statistics");
    // statistics.iconPath = new vscode.ThemeIcon("pulse");
    // statistics.command = {
    //   command: "sparkdown.statistics",
    //   title: "",
    // };
    // elements.push(statistics);

    return elements;
  }
  update(uri?: vscode.Uri): void {
    this.uri = uri;
    this.onDidChangeTreeDataEmitter.fire(null);
  }
}
