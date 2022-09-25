import * as vscode from "vscode";

export class SparkdownCommandTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  getTreeItem(
    element: vscode.TreeItem
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }
  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    const elements: vscode.TreeItem[] = [];

    // Export Pdf Command
    const treeExportPdf = new vscode.TreeItem("Export PDF");
    treeExportPdf.iconPath = new vscode.ThemeIcon("export");
    treeExportPdf.command = {
      command: "sparkdown.exportpdf",
      title: "",
    };
    elements.push(treeExportPdf);

    // Export Html Command
    const treeExportHtml = new vscode.TreeItem("Export HTML");
    treeExportHtml.iconPath = new vscode.ThemeIcon("export");
    treeExportHtml.tooltip = "Export live preview as .html document";
    treeExportHtml.iconPath = new vscode.ThemeIcon("export");
    treeExportHtml.command = {
      command: "sparkdown.exporthtml",
      title: "",
    };
    elements.push(treeExportHtml);

    // Show Screenplay Preview Command
    const treeLivePreview = new vscode.TreeItem("Show Screenplay Preview");
    treeLivePreview.iconPath = new vscode.ThemeIcon("open-preview");
    treeLivePreview.command = {
      command: "sparkdown.livepreview",
      title: "",
    };
    elements.push(treeLivePreview);

    // Show Screenplay Statistics Command
    // const statistics = new vscode.TreeItem("Show Screenplay Statistics");
    // statistics.iconPath = new vscode.ThemeIcon("pulse");
    // statistics.command = {
    //   command: "sparkdown.statistics",
    //   title: "",
    // };
    // elements.push(statistics);

    return elements;
  }
}
