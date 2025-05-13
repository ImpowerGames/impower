import * as vscode from "vscode";

export interface InstructionNode {
  label: string;
  id: string;
  type: string;
  parent: InstructionNode | null;
  children?: InstructionNode[];
}

export class SparkdownCompilationTreeDataProvider
  implements vscode.TreeDataProvider<InstructionNode>
{
  private static _instance: SparkdownCompilationTreeDataProvider;
  static get instance(): SparkdownCompilationTreeDataProvider {
    if (!this._instance) {
      this._instance = new SparkdownCompilationTreeDataProvider();
    }
    return this._instance;
  }

  private _onDidChangeTreeData: vscode.EventEmitter<
    InstructionNode | undefined | void
  > = new vscode.EventEmitter<InstructionNode | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    InstructionNode | undefined | void
  > = this._onDidChangeTreeData.event;

  private _treeData: InstructionNode = {
    label: "",
    id: "",
    type: "",
    parent: null,
    children: [],
  };

  private nodeMap: Map<string, InstructionNode> = new Map();

  private _uri?: vscode.Uri;
  get uri() {
    return this._uri;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getParent(element: InstructionNode): vscode.ProviderResult<InstructionNode> {
    return element.parent;
  }

  setTreeData(uri: vscode.Uri, compiled: string | undefined) {
    this._uri = uri;
    const compiledObj = compiled ? JSON.parse(compiled) : undefined;
    this._treeData = this.buildNodes(compiledObj?.root);
    this.refresh();
  }

  getTreeItem(element: InstructionNode): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.label,
      element.children
        ? element.children[0]?.type === "json"
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );

    if (element.id) {
      treeItem.tooltip = element.id;
    }

    if (element.type) {
      const color =
        element.type === "newline"
          ? "terminal.ansiBrightCyan"
          : element.type === "string"
          ? "terminal.ansiBrightCyan"
          : element.type === "number"
          ? "terminal.ansiBrightCyan"
          : element.type === "boolean"
          ? "terminal.ansiBrightCyan"
          : element.type === "operator"
          ? "chart.axis"
          : element.type === "command"
          ? "charts.orange"
          : element.type === "divert reference"
          ? "charts.blue"
          : element.type === "variable reference"
          ? "charts.blue"
          : element.type === "divert to"
          ? "terminal.ansiBrightMagenta"
          : element.type === "tunnel to"
          ? "terminal.ansiBrightMagenta"
          : element.type === "call function"
          ? "terminal.ansiBrightMagenta"
          : element.type === "call external function"
          ? "terminal.ansiBrightMagenta"
          : element.type === "list"
          ? "charts.red"
          : element.type === "set global variable"
          ? "charts.red"
          : element.type === "set local variable"
          ? "charts.red"
          : element.type === "get variable value"
          ? "terminal.ansiBrightGreen"
          : element.type === "get read count"
          ? "terminal.ansiBrightGreen"
          : element.type === "choice"
          ? "terminal.ansiBrightYellow"
          : "";

      if (color) {
        treeItem.iconPath = new vscode.ThemeIcon(
          "circle-filled",
          new vscode.ThemeColor(color)
        );
      }
    }

    return treeItem;
  }

  getChildren(element?: InstructionNode): Thenable<InstructionNode[]> {
    return Promise.resolve(
      element ? element.children || [] : this._treeData.children || []
    );
  }

  getNodeById(id: string): InstructionNode | undefined {
    return this.nodeMap.get(id);
  }

  getContainerSuffix(arr: any) {
    const flags = Array.isArray(arr) ? arr.at(-1)?.["#f"] : undefined;
    const flagsSummaryParts = [];
    if (flags & 0x1) {
      flagsSummaryParts.push("visits");
    }
    if (flags & 0x2) {
      flagsSummaryParts.push("turns");
    }
    if (flags & 0x4) {
      flagsSummaryParts.push("start");
    }
    const flagsSummary =
      flagsSummaryParts.length > 0
        ? `  (${flagsSummaryParts.join(" & ")})`
        : "";
    return flagsSummary;
  }

  private buildNodes(data: any): InstructionNode {
    this.nodeMap.clear();

    const toLabel = (label: string) => {
      return `${label} `;
    };

    const traverse = (
      node: any,
      depth: number,
      parent: InstructionNode | null,
      idPrefix = "",
      labelSuffix = ""
    ): InstructionNode => {
      let instructionNode: InstructionNode;
      if (typeof node === "string") {
        const label =
          node === "\n"
            ? JSON.stringify(node)
            : node[0] === "^"
            ? JSON.stringify(node.slice(1))
            : node;
        const type =
          node === "\n"
            ? "newline"
            : node[0] === "^"
            ? "string"
            : [
                "+",
                "-",
                "/",
                "*",
                "%",
                "_",
                "==",
                ">",
                "<",
                ">=",
                "<=",
                "!=",
                "!",
                "&&",
                "||",
                "MIN",
                "MAX",
              ].includes(node)
            ? "operator"
            : "command";
        instructionNode = {
          label: `${label}`,
          id: idPrefix,
          type,
          parent,
        };
        this.nodeMap.set(instructionNode.id, instructionNode);
      } else if (typeof node === "number") {
        const label = node;
        const type = "number";
        instructionNode = {
          label: `${label}`,
          id: idPrefix,
          type,
          parent,
        };
        this.nodeMap.set(instructionNode.id, instructionNode);
      } else if (typeof node === "boolean") {
        const label = node;
        const type = "boolean";
        instructionNode = {
          label: `${label}`,
          id: idPrefix,
          type,
          parent,
        };
        this.nodeMap.set(instructionNode.id, instructionNode);
      } else if (Array.isArray(node)) {
        const container = node.at(-1);
        const label = idPrefix;
        const type = "container";
        instructionNode = {
          label: `${label}${labelSuffix}`,
          id: idPrefix,
          type,
          parent,
          children: node
            .flatMap((child, i) => {
              if (i === node.length - 1) {
                if (typeof container === "object" && container) {
                  return Object.entries(container).map(([key, value]) => {
                    if (key !== "#n" && key !== "#f") {
                      const prefix = idPrefix ? idPrefix + "." : "";
                      const containerLabelSuffix =
                        this.getContainerSuffix(value);
                      return traverse(
                        value,
                        depth + 1,
                        instructionNode,
                        `${prefix}${key}`,
                        containerLabelSuffix
                      );
                    }
                    return null;
                  });
                }
                return null;
              } else {
                const name = Array.isArray(child)
                  ? child.at(-1)?.["#n"]
                  : undefined;
                const containerLabelSuffix = this.getContainerSuffix(child);
                const containerName = name ?? i ?? 0;
                const prefix = idPrefix ? idPrefix + "." : "";
                return traverse(
                  child,
                  depth + 1,
                  instructionNode,
                  `${prefix}${containerName}`,
                  containerLabelSuffix
                );
              }
            })
            .filter((n): n is InstructionNode => Boolean(n)),
        };
        this.nodeMap.set(instructionNode.id, instructionNode);
      } else if (typeof node === "object" && node !== null) {
        if (node["^->"]) {
          const label = toLabel("^->");
          const arg1 = node["^->"];
          const type = "divert reference";
          instructionNode = {
            label: [label, arg1].join("  "),
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else if (node["^var"]) {
          const label = toLabel("^var");
          const arg1 = node["^var"];
          const arg2 = node["^ci"];
          const arg2Summary =
            typeof arg2 === "number"
              ? arg2 === 0
                ? "(global)"
                : arg2 >= 1
                ? "(local)"
                : ""
              : "";
          const type = "variable reference";
          instructionNode = {
            label: [label, arg1, arg2Summary].join("  "),
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else if (node["->"]) {
          const label = toLabel("->");
          const arg1 = node["->"];
          const arg2SummaryParts: string[] = [];
          if (node["var"]) {
            arg2SummaryParts.push("var");
          }
          if (node["c"]) {
            arg2SummaryParts.push("conditional");
          }
          const arg2Summary =
            arg2SummaryParts.length > 0
              ? `(${arg2SummaryParts.join(" & ")})`
              : "";
          const type = "divert to";
          instructionNode = {
            label: [label, arg1, arg2Summary].join("  "),
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else if (node["->t->"]) {
          const label = toLabel("->t->");
          const arg1 = node["->t->"];
          const arg2SummaryParts: string[] = [];
          if (node["var"]) {
            arg2SummaryParts.push("var");
          }
          if (node["c"]) {
            arg2SummaryParts.push("conditional");
          }
          const arg2Summary =
            arg2SummaryParts.length > 0
              ? `(${arg2SummaryParts.join(" & ")})`
              : "";
          const type = "tunnel to";
          instructionNode = {
            label: [label, arg1, arg2Summary].join("  "),
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else if (node["f()"]) {
          const label = toLabel("f()");
          const arg1 = node["f()"];
          const type = "call function";
          instructionNode = {
            label: `${label} ${arg1}`,
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else if (node["x()"]) {
          const label = toLabel("x()");
          const arg1 = node["x()"];
          const arg2 = node["exArgs"];
          const arg2Summary = `(${arg2 ?? 0} args)`;
          const type = "call external function";
          instructionNode = {
            label: [label, arg1, arg2Summary].join("  "),
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else if (node["VAR="]) {
          const label = toLabel("VAR=");
          const arg1 = node["VAR="];
          const arg2 = node["re"];
          const arg2Summary = arg2 ? "" : "(init)";
          const type = "set global variable";
          instructionNode = {
            label: [label, arg1, arg2Summary].join("  "),
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else if (node["temp="]) {
          const label = toLabel("temp=");
          const arg1 = node["temp="];
          const arg2 = node["re"];
          const arg2Summary = arg2 ? "" : "(init)";
          const type = "set local variable";
          instructionNode = {
            label: [label, arg1, arg2Summary].join("  "),
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else if (node["VAR?"]) {
          const label = toLabel("VAR?");
          const arg1 = node["VAR?"];
          const type = "get variable value";
          instructionNode = {
            label: [label, arg1].join("  "),
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else if (node["CNT?"]) {
          const label = toLabel("CNT?");
          const arg1 = node["CNT?"];
          const type = "get read count";
          instructionNode = {
            label: [label, arg1].join("  "),
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else if (node["*"]) {
          const label = toLabel("*");
          const arg1 = node["*"];
          const arg2 = node["flg"];
          const arg2SummaryParts = [];
          if (arg2 & 0x10) {
            arg2SummaryParts.push("once");
          }
          if (arg2 & 0x1) {
            arg2SummaryParts.push("conditional");
          }
          if (arg2 & 0x8) {
            arg2SummaryParts.push("fallback");
          }
          if (arg2 & 0x2) {
            arg2SummaryParts.push("stext");
          }
          if (arg2 & 0x4) {
            arg2SummaryParts.push("ctext");
          }
          const arg2Summary = `(${arg2SummaryParts.join(" & ")})`;
          const type = "choice";
          instructionNode = {
            label: [label, arg1, arg2Summary].join("  "),
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else if (node["list"]) {
          const label = toLabel("list");
          const arg1 = node["origins"];
          const arg1Summary = arg1 ? `[${arg1}]` : "";
          const type = "list";
          instructionNode = {
            label: [label, arg1Summary].join("  "),
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        } else {
          const type = "";
          instructionNode = {
            label: `<unknown>`,
            id: idPrefix,
            type,
            parent,
          };
          this.nodeMap.set(instructionNode.id, instructionNode);
        }
      } else {
        const type = "";
        instructionNode = {
          label: `<unknown>`,
          id: idPrefix,
          type,
          parent,
        };
        this.nodeMap.set(instructionNode.id, instructionNode);
      }
      return instructionNode;
    };

    return traverse(data, 0, null);
  }
}
