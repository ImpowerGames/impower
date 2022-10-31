import * as vscode from "vscode";
import { StructureItem } from "../../../sparkdown";
import { parseState } from "../state/parseState";
import { getEditor } from "../utils/getEditor";
import { uiPersistence } from "../utils/persistence";

export class SparkdownOutlineTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  public readonly onDidChangeTreeDataEmitter: vscode.EventEmitter<vscode.TreeItem | null> =
    new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> =
    this.onDidChangeTreeDataEmitter.event;

  treeView: vscode.TreeView<vscode.TreeItem> | undefined;
  private treeRoot: OutlineTreeItem | undefined;

  context: vscode.ExtensionContext;

  uri: vscode.Uri | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  getTreeItem(
    element: vscode.TreeItem
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    //throw new Error("Method not implemented.");
    return element;
  }
  getChildren(
    element?: OutlineTreeItem
  ): vscode.ProviderResult<vscode.TreeItem[]> {
    if (element) {
      return element.children;
    }
    if (this.treeRoot && this.treeRoot.children) {
      return this.treeRoot.children;
    } else {
      return [];
    }
  }
  getParent(element: OutlineTreeItem): OutlineTreeItem {
    // necessary for reveal() to work
    return element.parent as OutlineTreeItem;
  }
  update(uri?: vscode.Uri): void {
    this.uri = uri;
    this.treeRoot = buildTree(this.context, this.uri);
    this.onDidChangeTreeDataEmitter.fire(null);
  }
  reveal(uri?: vscode.Uri): void {
    this.uri = uri;
    if (!this.treeView) {
      return;
    }
    if (!this.treeRoot) {
      return;
    }
    const editor = getEditor(this.uri);
    if (!editor) {
      return;
    }
    const currentCursorLine = editor.selection.active.line;
    // find the closest node without going past the current cursor
    const closestNode = this.treeRoot
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

const buildTree = (
  context: vscode.ExtensionContext,
  uri?: vscode.Uri
): OutlineTreeItem => {
  const root = new OutlineTreeItem();
  const editor = getEditor(uri);
  const result = editor
    ? parseState.parsedDocuments[editor.document.uri.toString()]
    : parseState.parsedDocuments[parseState.lastParsedUri];

  if (!result) {
    return root;
  }
  const structure = result.properties?.structure;
  if (!structure) {
    return root;
  }
  // done this way to take care of root-level synopsis and notes
  root.children.push(
    ...structure.map(
      (token) => makeTreeItem(token, root, context) as OutlineTreeItem
    )
  );
  root.children = root.children.sort((a, b) => a.lineNumber - b.lineNumber);
  return root;
};

const makeTreeItem = (
  token: StructureItem,
  parent: OutlineTreeItem,
  context: vscode.ExtensionContext
): OutlineTreeItem | undefined => {
  let item: OutlineTreeItem;
  switch (token.type) {
    case "section":
      item = new SectionTreeItem(token, parent, context);
      break;
    case "scene":
      item = new SceneTreeItem(token, parent, context);
      break;
    case "synopsis":
      item = new SynopsisTreeItem(token, parent, context);
      break;
    default:
      item = new SceneTreeItem(token, parent, context);
      break;
  }

  const passthrough =
    (token.type === "section" && !uiPersistence.outline_visibleSections) ||
    (token.type !== "section" && !uiPersistence.outline_visibleScenes);

  item.children = [];

  if (token.children) {
    if (passthrough) {
      parent.children.push(
        ...token.children.map(
          (tok: StructureItem) =>
            makeTreeItem(tok, parent, context) as OutlineTreeItem
        )
      );
    } else {
      item.children.push(
        ...token.children.map(
          (tok: StructureItem) =>
            makeTreeItem(tok, item, context) as OutlineTreeItem
        )
      );
    }
  }

  if (item.children.length > 0) {
    item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
  }

  if (passthrough) {
    parent.children = parent.children.sort(
      (a, b) => a.lineNumber - b.lineNumber
    );
    return undefined;
  } else {
    item.children = item.children.sort((a, b) => a.lineNumber - b.lineNumber);
    return item;
  }
};

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

class SectionTreeItem extends OutlineTreeItem {
  constructor(
    token: StructureItem,
    parent: OutlineTreeItem,
    context: vscode.ExtensionContext
  ) {
    super(token.text, token.id, parent);
    const sectionDepth = Math.min((token.id.match(/\//g) || []).length, 5); //maximum depth is 5 - anything deeper is the same color as 5
    const iconFileName = `section${sectionDepth}.svg`;
    this.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      "data",
      iconFileName
    );
    this.tooltip = token.tooltip;
  }
}

class SceneTreeItem extends OutlineTreeItem {
  constructor(
    token: StructureItem,
    parent: OutlineTreeItem,
    context: vscode.ExtensionContext
  ) {
    super(token.text, token.id, parent);
    const iconFileName = `scene.svg`;
    this.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      "data",
      iconFileName
    );
    this.tooltip = token.tooltip;
  }
}

class SynopsisTreeItem extends OutlineTreeItem {
  constructor(
    token: StructureItem,
    parent: OutlineTreeItem,
    context: vscode.ExtensionContext
  ) {
    super("", token.id, parent);
    const iconFileName = `synopsis.svg`;
    this.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      "data",
      iconFileName
    );
    this.tooltip = token.tooltip;
    this.description = token.text;
  }
}
