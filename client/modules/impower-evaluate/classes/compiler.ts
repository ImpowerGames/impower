import { OPERATION } from "../constants/operation";
import { CompilerDiagnostic } from "../types/compilerDiagnostic";
import { CompilerNode } from "../types/compilerNode";
import { CompilerReference } from "../types/compilerReference";
import { CompilerToken } from "../types/compilerToken";
import { format } from "../utils/format";
import { get } from "../utils/get";

export class Compiler {
  blockLevel = 0;

  private index = -1;

  private tokens: CompilerToken[];

  private _diagnostics: CompilerDiagnostic[] = [];

  private _references: CompilerReference[] = [];

  public get diagnostics(): CompilerDiagnostic[] {
    return this._diagnostics.map((x) => ({ ...x }));
  }

  public get references(): CompilerReference[] {
    return this._references.map((x) => ({ ...x }));
  }

  constructor(tokens: CompilerToken[]) {
    this.tokens = tokens;
  }

  parse(): CompilerNode | CompilerToken {
    let tok: CompilerToken | CompilerNode;
    let root: CompilerNode = {
      type: "node",
      left: null,
      right: null,
      operation: null,
    };

    do {
      tok = this.parseStatement();
      // 括号结束
      if (tok === null || tok === undefined) {
        break;
      }

      if (root.left === null) {
        root.left = tok;
        const nextTok = this.nextToken();
        // 只有一个左节点 !!$foo
        if (!nextTok || nextTok.content === ")") {
          return tok;
        }
        root.operation = nextTok;
        root.right = this.parseStatement();
      } else {
        if (tok.type !== "token") {
          throw new Error(
            `operation must be token, but get ${JSON.stringify(tok)}`
          );
        }
        root = this.addNode(tok, this.parseStatement(), root);
      }
    } while (tok);

    return root;
  }

  private _calc(
    node: CompilerNode | CompilerToken,
    context: Record<string, unknown>
  ): unknown {
    if (node.type === "token") {
      return this.getValue(node, context);
    }

    // 不支持的运算符号
    if (!node.operation) {
      const message = `Invalid operation`;
      this._diagnostics.push({
        content: "",
        from: 0,
        to: 0,
        severity: "error",
        type: "unknown-operation",
        message,
      });
      return undefined;
    }
    if (!OPERATION[node.operation.content]) {
      const message = `Unknown operation ${node.operation.content}`;
      this._diagnostics.push({
        content: node.operation.content,
        from: node.operation.from,
        to: node.operation.to,
        severity: "error",
        type: "unknown-operation",
        message,
      });
      return undefined;
    }

    if (node.operation.content === "!" && node.right) {
      return !this.getValue(node.right, context);
    }

    const left = this.getValue(node.left, context);
    if (node.operation === undefined) {
      return left;
    }

    const right = this.getValue(node.right, context);

    if (left === undefined || right === undefined) {
      return undefined;
    }

    const operator = node.operation.content;
    const message = `Operator '${operator}' cannot be applied to types '${typeof left}' and '${typeof right}'`;
    const unsupportedError: CompilerDiagnostic = {
      content: node.operation.content,
      from: node.operation.from,
      to: node.operation.to,
      severity: "error",
      type: "unsupported-operation",
      message,
    };
    switch (operator) {
      case "+": {
        if (typeof left === "number" && typeof right === "number") {
          return left + right;
        }
        if (typeof left === "string" && typeof right === "string") {
          return left + right;
        }
        this._diagnostics.push(unsupportedError);
        return undefined;
      }
      case "-":
        if (typeof left === "number" && typeof right === "number") {
          return left - right;
        }
        this._diagnostics.push(unsupportedError);
        return undefined;
      case "*":
        if (typeof left === "number" && typeof right === "number") {
          return left * right;
        }
        this._diagnostics.push(unsupportedError);
        return undefined;
      case "/":
        if (typeof left === "number" && typeof right === "number") {
          return left / right;
        }
        this._diagnostics.push(unsupportedError);
        return undefined;
      case "%":
        if (typeof left === "number" && typeof right === "number") {
          return left % right;
        }
        this._diagnostics.push(unsupportedError);
        return undefined;
      case ">":
        return left > right;
      case "<":
        return left < right;
      case ">=":
        return left >= right;
      case "<=":
        return left <= right;
      case "==":
        // tslint:disable-next-line:triple-equals
        // eslint-disable-next-line eqeqeq
        return left == right;
      case "===":
        // tslint:disable-next-line:triple-equals
        return left === right;
      case "!==":
        // tslint:disable-next-line:triple-equals
        return left !== right;
      case "!=":
        // tslint:disable-next-line:triple-equals
        // eslint-disable-next-line eqeqeq
        return left != right;
      case "&&":
      case "?":
        return left && right;
      case "||":
      case ":":
        return left || right;
      default:
        return undefined;
    }
  }

  calc(
    node: CompilerNode | CompilerToken,
    context: Record<string, unknown>
  ): unknown {
    this._diagnostics = [];
    return this._calc(node, context);
  }

  private nextToken(): CompilerToken {
    this.index += 1;
    return this.tokens[this.index];
  }

  private prevToken(): CompilerToken {
    return this.tokens[this.index - 1];
  }

  private addNode(
    operation: CompilerToken,
    right: CompilerNode | CompilerToken | null,
    root: CompilerNode
  ): CompilerNode {
    let pre = root;
    // 增加右节点
    if (this.compare(pre.operation, operation) < 0 && !pre.grouped) {
      // 依次找到最右一个节点
      while (
        pre.right != null &&
        pre.right.type === "node" &&
        this.compare(pre.right.operation, operation) < 0 &&
        !pre.right.grouped
      ) {
        pre = pre.right;
      }

      pre.right = {
        type: "node",
        operation,
        left: pre.right,
        right,
      };
      return root;
    }

    // 增加一个左节点
    return {
      type: "node",
      left: pre,
      right,
      operation,
    };
  }

  private compare(a: CompilerToken, b: CompilerToken): number {
    if (!OPERATION[a.content]) {
      const message = `Unknown operation ${a.content}`;
      this._diagnostics.push({
        content: a.content,
        from: a.from,
        to: a.to,
        severity: "error",
        type: "unknown-operation",
        message,
      });
      throw new Error(message);
    }
    if (!OPERATION[b.content]) {
      const message = `Unknown operation ${b.content}`;
      this._diagnostics.push({
        content: b.content,
        from: b.from,
        to: b.to,
        severity: "error",
        type: "unknown-operation",
        message,
      });
      throw new Error(message);
    }
    return OPERATION[a.content] - OPERATION[b.content];
  }

  private getValue(
    val: CompilerToken | CompilerNode | null,
    context: Record<string, unknown>
  ): unknown {
    if (val === null) {
      const message = `Unknown value`;
      throw new Error(message);
    }

    if (val.type === "node") {
      return this._calc(val, context);
    }

    if (OPERATION[val.content]) {
      const message = `Reserved keyword: ${val.content}`;
      this._diagnostics.push({
        content: val.content,
        from: val.from,
        to: val.to,
        severity: "error",
        type: "reserved-keyword",
        message,
      });
      throw new Error(message);
    }

    // 上下文查找
    if (val.content.indexOf("$.") !== -1) {
      return get(context, val.content.slice(2));
    }

    // 字符串
    if (val.content[0] === "'" || val.content[0] === '"') {
      return val.content.slice(1, -1);
    }

    if (val.content[0] === "`") {
      return this.parseTemplateString(val, context);
    }

    // 布尔
    if (val.content === "true") {
      return true;
    }

    if (val.content === "false") {
      return false;
    }
    // is number
    const value = parseFloat(val.content);
    if (!Number.isNaN(value)) {
      return value;
    }

    // all other lookup from context
    const found = get<Record<string, unknown>, unknown>(context, val.content);
    this._references.push({ from: val.from, to: val.to, name: val.content });
    if (found === undefined) {
      this._diagnostics.push({
        content: val.content,
        from: val.from,
        to: val.to,
        severity: "error",
        type: "variable-not-found",
        message: `Cannot find variable named '${val.content}'`,
      });
    }
    return found;
  }

  private parseTemplateString(
    val: CompilerToken,
    context: Record<string, unknown>
  ): string {
    const input = val.content.slice(1, -1);
    const [result, , diagnostics] = format(input, context);
    diagnostics.forEach((d) => {
      this._diagnostics.push({
        ...d,
        from: val.from + 1 + d.from,
        to: val.from + 1 + d.to,
      });
    });
    return result;
  }

  private parseStatement(): CompilerToken | CompilerNode | null {
    const token = this.nextToken();

    if (!token) {
      return token;
    }

    if (token.content === "(") {
      this.blockLevel += 1;
      const node = this.parse();
      this.blockLevel -= 1;

      if (node.type === "node") {
        node.grouped = true;
      }
      return node;
    }

    if (token.content === ")") {
      return null;
    }

    if (token.content === "!") {
      return {
        type: "node",
        left: null,
        operation: token,
        right: this.parseStatement(),
      };
    }

    // 3 > -12 or -12 + 10
    if (
      token.content === "-" &&
      (!this.prevToken() || OPERATION[this.prevToken().content] > 0)
    ) {
      return {
        type: "node",
        left: { type: "token", content: "0", from: token.from, to: token.to },
        operation: token,
        right: this.parseStatement(),
        grouped: true,
      };
    }

    return token;
  }
}
