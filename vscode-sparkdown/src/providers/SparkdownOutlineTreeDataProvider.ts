import { StructureItem } from "@impower/sparkdown/src/index";
import * as vscode from "vscode";
import { parseState } from "../state/parseState";
import { getEditor } from "../utils/getEditor";
import { getSuffixFromState } from "../utils/getSuffixFromState";
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

  makeTreeItem(
    structure: Record<string, StructureItem>,
    id: string,
    parent: OutlineTreeItem,
    context: vscode.ExtensionContext,
    uri?: vscode.Uri
  ): OutlineTreeItem | undefined {
    const token = structure[id];
    let item: OutlineTreeItem;
    if (!token) {
      return undefined;
    }
    switch (token.type) {
      case "section":
        item = new SectionTreeItem(token, parent, context, uri);
        break;
      case "scene":
        item = new SceneTreeItem(token, parent, context, uri);
        break;
      case "synopsis":
        item = new SynopsisTreeItem(token, parent, context, uri);
        break;
      default:
        item = new SceneTreeItem(token, parent, context, uri);
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
            (id) =>
              this.makeTreeItem(
                structure,
                id,
                parent,
                context,
                uri
              ) as OutlineTreeItem
          )
        );
      } else {
        item.children.push(
          ...token.children.map(
            (id) =>
              this.makeTreeItem(
                structure,
                id,
                item,
                context,
                uri
              ) as OutlineTreeItem
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
    // done this way to take care of root-level synopsis and notes
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

  update(uri?: vscode.Uri): void {
    const editor = getEditor(uri);
    const program = editor
      ? parseState.parsedPrograms[editor.document.uri.toString()]
      : parseState.parsedPrograms[parseState.lastParsedUri];
    const structure = program?.metadata?.structure || {};
    this.treeRoot = this.buildTree(this.context, structure, uri);
    this.onDidChangeTreeDataEmitter.fire(null);
  }
  reveal(uri?: vscode.Uri): void {
    if (!this.treeView) {
      return;
    }
    if (!this.treeRoot) {
      return;
    }
    const editor = getEditor(uri);
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
    context: vscode.ExtensionContext,
    uri?: vscode.Uri
  ) {
    super(token.text, token.id, parent);
    const sectionDepth = Math.min(token.level || 0, 5); //maximum depth is 5 - anything deeper is the same color as 5
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
        [token.id, getSuffixFromState(token.state)].join(".")
      );
    }
    this.tooltip = token.tooltip || "";
  }
}

class SceneTreeItem extends OutlineTreeItem {
  constructor(
    token: StructureItem,
    parent: OutlineTreeItem,
    context: vscode.ExtensionContext,
    uri?: vscode.Uri
  ) {
    super(token.text, token.id, parent);
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
        [token.id, getSuffixFromState(token.state)].join(".")
      );
    }
    this.tooltip = token.tooltip || "";
  }
}

class SynopsisTreeItem extends OutlineTreeItem {
  constructor(
    token: StructureItem,
    parent: OutlineTreeItem,
    context: vscode.ExtensionContext,
    uri?: vscode.Uri
  ) {
    super("", token.id, parent);
    const iconFileName = `synopsis.svg`;
    this.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      "out",
      "data",
      iconFileName
    );
    if (uri) {
      this.resourceUri = vscode.Uri.joinPath(
        uri,
        [token.id, getSuffixFromState(token.state)].join(".")
      );
    }
    this.tooltip = token.tooltip || "";
    this.description = token.text;
  }
}
