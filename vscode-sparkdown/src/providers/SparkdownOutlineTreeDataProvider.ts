import * as vscode from "vscode";
import { getSelectionFragment } from "../utils/getSelectionFragment";

export class SparkdownOutlineTreeDataProvider
  implements vscode.TreeDataProvider<OutlineTreeItem>
{
  private static _instance: SparkdownOutlineTreeDataProvider;
  static get instance(): SparkdownOutlineTreeDataProvider {
    if (!this._instance) {
      this._instance = new SparkdownOutlineTreeDataProvider();
    }
    return this._instance;
  }

  public readonly onDidChangeTreeDataEmitter: vscode.EventEmitter<OutlineTreeItem | null> =
    new vscode.EventEmitter<OutlineTreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<OutlineTreeItem | null> =
    this.onDidChangeTreeDataEmitter.event;

  protected _treeRoot?: OutlineTreeItem;

  protected _symbols: vscode.DocumentSymbol[] | null = null;

  protected _symbolUris: Record<string, vscode.Range> = {};

  async getTreeItem(element: OutlineTreeItem) {
    return element;
  }

  getChildren(element?: OutlineTreeItem) {
    if (element) {
      return element.children;
    }
    if (this._treeRoot && this._treeRoot.children) {
      return this._treeRoot.children;
    }
    return [];
  }

  getParent(element: OutlineTreeItem) {
    return element.parent;
  }

  getRange(uri: string) {
    return this._symbolUris[uri];
  }

  async update(
    uri: vscode.Uri,
    symbols?: vscode.SymbolInformation[] | vscode.DocumentSymbol[] | null
  ): Promise<void> {
    if (symbols !== undefined) {
      this._symbols = symbols as vscode.DocumentSymbol[];
    }
    this._symbols = this._symbols || [];
    const rootSymbol: vscode.DocumentSymbol = {
      name: "",
      detail: "",
      kind: vscode.SymbolKind.File,
      range: new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 0)
      ),
      selectionRange: new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 0)
      ),
      children: this._symbols,
    };
    this._treeRoot = new OutlineTreeItem(
      null,
      uri,
      rootSymbol,
      this._symbolUris
    );
    this.onDidChangeTreeDataEmitter.fire(null);
  }
}

export class OutlineTreeItem extends vscode.TreeItem {
  parent: OutlineTreeItem | null;
  children: OutlineTreeItem[] = [];

  constructor(
    parent: OutlineTreeItem | null,
    uri: vscode.Uri,
    symbol: vscode.DocumentSymbol,
    symbolUris: Record<string, vscode.Range>
  ) {
    const path = parent?.label ? `${parent.label}.${symbol.name}` : symbol.name;
    const resourceUri = vscode.Uri.file(uri.path).with({
      fragment: getSelectionFragment(symbol.range),
    });
    symbolUris[resourceUri.toString()] = symbol.range;
    const collapsibleState =
      symbol.children.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None;
    super(resourceUri, collapsibleState);
    this.parent = parent;
    this.label = symbol.name;
    this.resourceUri = resourceUri;
    this.tooltip = path;
    this.command = {
      command: "editor.action.goToLocations",
      title: "Go to location",
      arguments: [
        uri,
        new vscode.Position(0, 0),
        [new vscode.Location(uri, symbol.range)],
        "goto",
        "",
        false,
      ],
    };
    this.iconPath = new vscode.ThemeIcon(
      `symbol-${vscode.SymbolKind[symbol.kind].toLowerCase()}`
    );
    this.children =
      "children" in symbol
        ? symbol.children.map(
            (c) => new OutlineTreeItem(this, uri, c, symbolUris)
          )
        : [];
  }
}
