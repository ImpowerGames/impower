import * as vscode from "vscode";
import { createFileExportTreeItem } from "../utils/createFileExportTreeItem";
import { fileExists } from "../utils/fileExists";
import { getEditor } from "../utils/getEditor";

export class SparkdownCommandTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  public readonly onDidChangeTreeDataEmitter: vscode.EventEmitter<vscode.TreeItem | null> =
    new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> =
    this.onDidChangeTreeDataEmitter.event;

  commands: {
    pdf?: "export" | "sync";
    html?: "export" | "sync";
    csv?: "export" | "sync";
    json?: "export" | "sync";
  } = {
    pdf: "export",
    html: "export",
    csv: "export",
    json: "export",
  };

  getTreeItem(
    element: vscode.TreeItem
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }
  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    const elements: vscode.TreeItem[] = [];

    // Export Pdf Command
    if (this.commands.pdf) {
      elements.push(
        createFileExportTreeItem(
          this.commands.pdf,
          "pdf",
          this.commands.pdf === "sync"
            ? `Sync screenplay to pdf`
            : "Export screenplay as formatted .pdf"
        )
      );
    }

    // Export Html Command
    if (this.commands.html) {
      elements.push(
        createFileExportTreeItem(
          this.commands.html,
          "html",
          this.commands.html === "sync"
            ? `Sync screenplay to html`
            : "Export screenplay as .html document"
        )
      );
    }

    // Export CSV Command
    if (this.commands.csv) {
      elements.push(
        createFileExportTreeItem(
          this.commands.csv,
          "csv",
          this.commands.csv === "sync"
            ? `Sync screenplay to csv`
            : "Export screenplay as translatable .csv document"
        )
      );
    }

    // Export JSON Command
    if (this.commands.json) {
      elements.push(
        createFileExportTreeItem(
          this.commands.json,
          "json",
          this.commands.json === "sync"
            ? `Sync screenplay to json`
            : "Export screenplay tokens to .json document"
        )
      );
    }

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
  async update(uri?: vscode.Uri): Promise<void> {
    if (!uri) {
      return;
    }
    const editor = getEditor(uri);
    if (!editor) {
      return;
    }
    const filename = editor.document.fileName.replace(/(\.[^.]*)$/, "");
    const [pdfExists, htmlExists, csvExists, jsonExists] = await Promise.all([
      fileExists(`${filename}.pdf`),
      fileExists(`${filename}.html`),
      fileExists(`${filename}.csv`),
      fileExists(`${filename}.json`),
    ]);
    this.commands = {
      pdf: pdfExists ? "sync" : "export",
      html: htmlExists ? "sync" : "export",
      csv: csvExists ? "sync" : "export",
      json: jsonExists ? "sync" : "export",
    };
    this.onDidChangeTreeDataEmitter.fire(null);
  }
}
