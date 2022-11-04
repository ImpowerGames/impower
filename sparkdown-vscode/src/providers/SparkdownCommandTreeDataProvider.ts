import * as vscode from "vscode";
import { createFileExportTreeItem } from "../utils/createFileExportTreeItem";
import { fileStat } from "../utils/fileStat";
import { getEditor } from "../utils/getEditor";

export class SparkdownCommandTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  public readonly onDidChangeTreeDataEmitter: vscode.EventEmitter<vscode.TreeItem | null> =
    new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> =
    this.onDidChangeTreeDataEmitter.event;

  private _exporting: {
    pdf?: boolean;
    html?: boolean;
    csv?: boolean;
    json?: boolean;
  } = {};

  private _stat?: vscode.FileStat;

  private _commandUris: {
    pdf?: vscode.Uri;
    html?: vscode.Uri;
    csv?: vscode.Uri;
    json?: vscode.Uri;
  } = {};

  private _commandStats: Record<string, vscode.FileStat | undefined> = {};

  getTreeItem(
    element: vscode.TreeItem
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    const elements: vscode.TreeItem[] = [];

    // Export Pdf Command
    {
      const uri = this._commandUris.pdf;
      const stat = this._commandStats[this._commandUris.pdf?.path || ""];
      const exporting = this._exporting.pdf;
      elements.push(
        createFileExportTreeItem(
          this._stat,
          uri,
          stat,
          exporting,
          "pdf",
          !stat ? "Export screenplay as formatted .pdf document" : ""
        )
      );
    }

    // Export Html Command
    {
      const uri = this._commandUris.html;
      const stat = this._commandStats[this._commandUris.html?.path || ""];
      const exporting = this._exporting.html;
      elements.push(
        createFileExportTreeItem(
          this._stat,
          uri,
          stat,
          exporting,
          "html",
          !stat ? "Export screenplay as formatted .html document" : ""
        )
      );
    }

    // Export CSV Command
    {
      const uri = this._commandUris.csv;
      const stat = this._commandStats[this._commandUris.csv?.path || ""];
      const exporting = this._exporting.csv;
      elements.push(
        createFileExportTreeItem(
          this._stat,
          uri,
          stat,
          exporting,
          "csv",
          !stat ? "Export screenplay as translatable .csv document" : ""
        )
      );
    }

    // Export JSON Command
    {
      const uri = this._commandUris.json;
      const stat = this._commandStats[this._commandUris.json?.path || ""];
      const exporting = this._exporting.json;
      elements.push(
        createFileExportTreeItem(
          this._stat,
          uri,
          stat,
          exporting,
          "json",
          !stat ? "Export screenplay as tokens to .json file" : ""
        )
      );
    }

    // Preview Screenplay Command
    const treePreviewScreenplay = new vscode.TreeItem("Preview Screenplay");
    treePreviewScreenplay.iconPath = new vscode.ThemeIcon("open-preview");
    treePreviewScreenplay.command = {
      command: "sparkdown.previewscreenplay",
      title: "",
    };
    elements.push(treePreviewScreenplay);

    // Preview Game Command
    const treePreviewGame = new vscode.TreeItem("Preview Game");
    treePreviewGame.iconPath = new vscode.ThemeIcon("open-preview");
    treePreviewGame.command = {
      command: "sparkdown.previewgame",
      title: "",
    };
    elements.push(treePreviewGame);

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

  async update(uri: vscode.Uri | undefined): Promise<void> {
    if (!uri) {
      return;
    }
    const editor = getEditor(uri);
    if (!editor) {
      return;
    }
    const filename = editor.document.fileName.replace(/(\.[^.]*)$/, "");
    this._commandUris.pdf = vscode.Uri.file(`${filename}.pdf`);
    this._commandUris.html = vscode.Uri.file(`${filename}.html`);
    this._commandUris.csv = vscode.Uri.file(`${filename}.csv`);
    this._commandUris.json = vscode.Uri.file(`${filename}.json`);
    const [stat, pdfStat, htmlStat, csvStat, jsonStat] = await Promise.all([
      fileStat(uri),
      fileStat(this._commandUris.pdf),
      fileStat(this._commandUris.html),
      fileStat(this._commandUris.csv),
      fileStat(this._commandUris.json),
    ]);
    this._stat = stat;
    this._commandStats[this._commandUris.pdf.path] = pdfStat;
    this._commandStats[this._commandUris.html.path] = htmlStat;
    this._commandStats[this._commandUris.csv.path] = csvStat;
    this._commandStats[this._commandUris.json.path] = jsonStat;
    this.onDidChangeTreeDataEmitter.fire(null);
  }

  notifyExportStarted(type: "pdf" | "html" | "csv" | "json"): void {
    this._exporting[type] = true;
    this.onDidChangeTreeDataEmitter.fire(null);
  }

  notifyExportEnded(type: "pdf" | "html" | "csv" | "json"): void {
    this._exporting[type] = false;
  }
}
