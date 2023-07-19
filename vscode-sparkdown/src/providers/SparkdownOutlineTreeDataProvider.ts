import { StructureItem } from "@impower/sparkdown/src/index";
import * as vscode from "vscode";
import { getEditor } from "../utils/getEditor";
import { getSuffixFromState } from "../utils/getSuffixFromState";
import { SparkProgramManager } from "./SparkProgramManager";

export class SparkdownOutlineTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private static _instance: SparkdownOutlineTreeDataProvider;
  static get instance(): SparkdownOutlineTreeDataProvider {
    if (!this._instance) {
      this._instance = new SparkdownOutlineTreeDataProvider();
    }
    return this._instance;
  }

  public readonly onDidChangeTreeDataEmitter: vscode.EventEmitter<vscode.TreeItem | null> =
    new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> =
    this.onDidChangeTreeDataEmitter.event;

  treeView: vscode.TreeView<vscode.TreeItem> | undefined;
  protected _treeRoot: OutlineTreeItem | undefined;

  constructor() {
    this.treeView = vscode.window.createTreeView("sparkdown-outline", {
      treeDataProvider: this,
      showCollapseAll: true,
    });
  }

  getTreeItem(
    element: vscode.TreeItem
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(
    element?: OutlineTreeItem
  ): vscode.ProviderResult<vscode.TreeItem[]> {
    if (element) {
      return element.children;
    }
    if (this._treeRoot && this._treeRoot.children) {
      return this._treeRoot.children;
    } else {
      return [];
    }
  }

  getParent(element: OutlineTreeItem): OutlineTreeItem {
    return element.parent as OutlineTreeItem;
  }

  makeTreeItem(
    structure: Record<string, StructureItem>,
    id: string,
    parent: OutlineTreeItem,
    context: vscode.ExtensionContext,
    uri?: vscode.Uri
  ): OutlineTreeItem | undefined {
    const item = structure[id];
    let treeItem: OutlineTreeItem;
    if (!item) {
      return undefined;
    }
    switch (item.type) {
      case "label":
        treeItem = new LabelTreeItem(item, parent, context, uri);
        break;
      case "section":
        treeItem = new SectionTreeItem(item, parent, context, uri);
        break;
      case "scene":
        treeItem = new SceneTreeItem(item, parent, context, uri);
        break;
      default:
        treeItem = new SceneTreeItem(item, parent, context, uri);
        break;
    }
    treeItem.children = [];
    if (item.children) {
      treeItem.children.push(
        ...item.children.map(
          (id) =>
            this.makeTreeItem(
              structure,
              id,
              treeItem,
              context,
              uri
            ) as OutlineTreeItem
        )
      );
    }
    if (treeItem.children.length > 0) {
      treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
    treeItem.children = treeItem.children.sort(
      (a, b) => a.lineNumber - b.lineNumber
    );
    return treeItem;
  }

  buildTree(
    context: vscode.ExtensionContext,
    structure: Record<string, StructureItem>,
    uri?: vscode.Uri
  ): OutlineTreeItem {
    const root = new OutlineTreeItem();
    if (!structure) {
      return root;
    }
    // done this way to take care of root-level label and notes
    const rootStructItem = structure?.[""];
    if (rootStructItem) {
      root.children.push(
        ...rootStructItem.children.map(
          (id) =>
            this.makeTreeItem(
              structure,
              id,
              root,
              context,
              uri
            ) as OutlineTreeItem
        )
      );
    }
    root.children = root.children.sort((a, b) => a.lineNumber - b.lineNumber);
    return root;
  }

  update(context: vscode.ExtensionContext, uri?: vscode.Uri): void {
    const editor = getEditor(uri);
    const program = editor
      ? SparkProgramManager.instance.get(editor.document.uri)
      : SparkProgramManager.instance.getLastParsed();
    const structure = program?.metadata?.structure || {};
    if (context) {
      this._treeRoot = this.buildTree(context, structure, uri);
    }
    this.onDidChangeTreeDataEmitter.fire(null);
  }

  reveal(uri?: vscode.Uri): void {
    if (!this.treeView) {
      return;
    }
    if (!this._treeRoot) {
      return;
    }
    const editor = getEditor(uri);
    if (!editor) {
      return;
    }
    const currentCursorLine = editor.selection.active.line;
    // find the closest node without going past the current cursor
    const closestNode = this._treeRoot
      .filter((node) => node.lineNumber <= currentCursorLine)
      .sort((a, b) => b.lineNumber - a.lineNumber)[0];

    if (closestNode) {
      this.treeView.reveal(closestNode, {
        select: true,
        focus: false,
        expand: 3,
      });
    }
  }
}

class OutlineTreeItem extends vscode.TreeItem {
  children: OutlineTreeItem[] = [];
  lineNumber = 0;

  constructor(label = "", public path = "", public parent?: OutlineTreeItem) {
    super(label);

    if (path) {
      const endDigits = path.match(/(\d+)$/);
      if (endDigits && endDigits.length > 1) {
        this.lineNumber = +(endDigits[1] || 0);
        this.command = {
          command: "sparkdown.jumpto",
          title: "",
          arguments: [this.lineNumber],
        };
      }
    }
  }

  /** returns all nodes in the tree that pass this predicate, including this node */
  filter(predicate: (node: OutlineTreeItem) => boolean): OutlineTreeItem[] {
    const result: OutlineTreeItem[] = [];

    if (predicate(this)) {
      result.push(this);
    }

    if (this.children) {
      this.children.forEach((child) => result.push(...child.filter(predicate)));
    }

    return result;
  }
}

class LabelTreeItem extends OutlineTreeItem {
  constructor(
    item: StructureItem,
    parent: OutlineTreeItem,
    context: vscode.ExtensionContext,
    uri?: vscode.Uri
  ) {
    super("", item.id, parent);
    const iconFileName = `label.svg`;
    this.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      "out",
      "data",
      iconFileName
    );
    if (uri) {
      this.resourceUri = vscode.Uri.joinPath(
        uri,
        [item.id, getSuffixFromState(item.state)].join(".")
      );
    }
    this.tooltip = item.tooltip || "";
    this.description = item.text;
  }
}

class SectionTreeItem extends OutlineTreeItem {
  constructor(
    item: StructureItem,
    parent: OutlineTreeItem,
    context: vscode.ExtensionContext,
    uri?: vscode.Uri
  ) {
    super(item.text, item.id, parent);
    const sectionDepth = Math.min(item.level ?? 0, 5); //maximum depth is 5 - anything deeper is the same color as 5
    const iconFileName = `section${sectionDepth}.svg`;
    this.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      "out",
      "data",
      iconFileName
    );
    if (uri) {
      this.resourceUri = vscode.Uri.joinPath(
        uri,
        [item.id, getSuffixFromState(item.state)].join(".")
      );
    }
    this.tooltip = item.tooltip || "";
  }
}

class SceneTreeItem extends OutlineTreeItem {
  constructor(
    item: StructureItem,
    parent: OutlineTreeItem,
    context: vscode.ExtensionContext,
    uri?: vscode.Uri
  ) {
    super(item.text, item.id, parent);
    const iconFileName = `scene.svg`;
    this.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      "out",
      "data",
      iconFileName
    );
    if (uri) {
      this.resourceUri = vscode.Uri.joinPath(
        uri,
        [item.id, getSuffixFromState(item.state)].join(".")
      );
    }
    this.tooltip = item.tooltip || "";
  }
}
