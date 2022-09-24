import * as vscode from "vscode";
import { StructureItem } from "../../../sparkdown";
import { getActiveParsedDocument } from "../utils/getActiveParsedDocument";
import { getActiveSparkdownDocument } from "../utils/getActiveSparkdownDocument";
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
  update(): void {
    this.treeRoot = buildTree();
    this.onDidChangeTreeDataEmitter.fire(null);
  }
  reveal(): void {
    if (!this.treeView) {
      return;
    }
    if (!this.treeRoot) {
      return;
    }
    const uri = getActiveSparkdownDocument();
    if (!uri) {
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

const buildTree = (): OutlineTreeItem => {
  const root = new OutlineTreeItem();
  const result = getActiveParsedDocument();
  if (!result) {
    return root;
  }
  const structure = result.properties?.structure;
  if (!structure) {
    return root;
  }
  // done this way to take care of root-level synopsis and notes
  root.children.push(
    ...structure.map((token) => makeTreeItem(token, root) as OutlineTreeItem)
  );
  root.children = root.children.sort((a, b) => a.lineNumber - b.lineNumber);
  return root;
};

const makeTreeItem = (
  token: StructureItem,
  parent: OutlineTreeItem
): OutlineTreeItem | undefined => {
  let item: OutlineTreeItem;
  if (token.type === "section") {
    item = new SectionTreeItem(token, parent);
  } else {
    item = new SceneTreeItem(token, parent);
  }

  const passthrough =
    (token.type === "section" && !uiPersistence.outline_visibleSections) ||
    (token.type !== "section" && !uiPersistence.outline_visibleScenes);

  item.children = [];

  if (token.children) {
    if (passthrough) {
      parent.children.push(
        ...token.children.map(
          (tok: StructureItem) => makeTreeItem(tok, parent) as OutlineTreeItem
        )
      );
    } else {
      item.children.push(
        ...token.children.map(
          (tok: StructureItem) => makeTreeItem(tok, item) as OutlineTreeItem
        )
      );
    }
  }

  /* notes and synopses get pushed to this item, or to it's parent if it's a scene */
  {
    if (token.synopses && uiPersistence.outline_visibleSynopses) {
      if (token.type === "section" && uiPersistence.outline_visibleSections) {
        item.children.push(
          ...token.synopses.map((syn) => new SynopsisTreeItem(syn, item))
        );
      } else {
        parent.children.push(
          ...token.synopses.map((syn) => new SynopsisTreeItem(syn, parent))
        );
      }
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
        this.lineNumber = +endDigits[1];
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
  constructor(token: StructureItem, parent: OutlineTreeItem) {
    super(token.content, token.id, parent);

    const sectionDepth = Math.min((token.id.match(/\//g) || []).length, 5); //maximum depth is 5 - anything deeper is the same color as 5
    this.iconPath =
      __filename + "/../../../assets/images/section" + sectionDepth + ".svg";
    if (token.synopses && token.synopses.length > 0) {
      this.tooltip = token.synopses.map((s) => s.synopsis).join("\n");
    }
  }
}

class SceneTreeItem extends OutlineTreeItem {
  constructor(token: StructureItem, parent: OutlineTreeItem) {
    super(token.content, token.id, parent);

    this.iconPath = __filename + "/../../../assets/images/scene.svg";
    if (token.synopses && token.synopses.length > 0) {
      this.tooltip = token.synopses.map((s) => s.synopsis).join("\n");
    }
  }
}

class SynopsisTreeItem extends OutlineTreeItem {
  constructor(
    token: { synopsis: string; line: number },
    parent: OutlineTreeItem
  ) {
    super("", String(token.line), parent);

    this.iconPath =
      __filename + "/../../../../assets/images/synopse_offset.svg";
    this.description = token.synopsis;
    this.tooltip = this.description;
  }
}
