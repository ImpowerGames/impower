/*!
 * simple-evaluate <https://github.com/shepherdwind/simple-evaluate>
 *
 * Copyright (c) 2017 sheperdwind <eward.song@gmail.com>
 * Released under the MIT License.
 */

import { OPERATION } from "../constants/operation";
import { CompilerConfig } from "../types/compilerConfig";
import { CompilerDiagnostic } from "../types/compilerDiagnostic";
import { CompilerNode } from "../types/compilerNode";
import { CompilerReference } from "../types/compilerReference";
import { CompilerToken } from "../types/compilerToken";
import { get } from "../utils/get";

export class Compiler {
  private index = -1;

  private tokens: CompilerToken[];

  private config?: CompilerConfig;

  private _diagnostics: CompilerDiagnostic[] = [];

  private _references: CompilerReference[] = [];

  public get diagnostics(): CompilerDiagnostic[] {
    return this._diagnostics.map((x) => ({ ...x }));
  }

  public get references(): CompilerReference[] {
    return this._references.map((x) => ({ ...x }));
  }

  constructor(tokens: CompilerToken[], config?: CompilerConfig) {
    this.tokens = tokens;
    this.config = config;
  }

  parse(): CompilerNode | CompilerToken {
    let tok: CompilerToken | CompilerNode | null;
    let root: CompilerNode = {
      type: "node",
      left: null,
      right: null,
      operation: null,
    };

    do {
      tok = this.parseStatement();

      if (!tok) {
        break;
      }
      if (root.left === null) {
        root.left = tok;
        const nextTok = this.nextToken();
        if (!nextTok) {
          return tok;
        }
        if (nextTok && nextTok.content === "]") {
          root.operation = nextTok;
          return root;
        }
        if (nextTok.content === ")") {
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

    if (!node.operation) {
      const prevToken = this.prevToken();
      if (prevToken && prevToken.content === "]") {
        return [];
      } else {
        const message = `expression expected`;
        this._diagnostics.push({
          content: "",
          from: 1,
          to: 1,
          severity: "error",
          type: "unknown-operation",
          message,
        });
        return undefined;
      }
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
    const operator = node.operation.content;

    if (operator === "!" && node.right) {
      return !this.getValue(node.right, context);
    }

    if (operator === "]" && !node.left) {
      return [];
    }

    const left = this.getValue(node.left, context) as number;
    if (node.operation === undefined) {
      return left;
    }

    if (operator === "]" && !node.right) {
      return [left];
    }

    const right = this.getValue(node.right, context) as number;
    if (left === undefined || right === undefined) {
      return undefined;
    }

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
      case ",": {
        const array = Array.isArray(left) ? left : [left, right];
        if (Array.isArray(left)) {
          array.push(right);
        }
        return array;
      }
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
    const result = this._calc(node, context);
    return result;
  }

  private nextToken(): CompilerToken | undefined {
    this.index += 1;
    return this.tokens[this.index];
  }

  private prevToken(): CompilerToken | undefined {
    return this.tokens[this.index - 1];
  }

  private addNode(
    operation: CompilerToken,
    right: CompilerNode | CompilerToken | null,
    root: CompilerNode
  ): CompilerNode {
    let pre = root;
    if (
      pre.operation &&
      this.compare(pre.operation, operation) < 0 &&
      !pre.grouped
    ) {
      while (
        pre.right != null &&
        pre.right.type === "node" &&
        pre.right.operation &&
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

    return {
      type: "node",
      left: pre,
      right,
      operation,
    };
  }

  private compare(a: CompilerToken, b: CompilerToken): number {
    const aOperation = OPERATION[a.content];
    const bOperation = OPERATION[b.content];
    if (!aOperation) {
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
    if (!bOperation) {
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
    return aOperation - bOperation;
  }

  private getValue(
    val: CompilerToken | CompilerNode | null,
    context: Record<string, unknown>
  ): unknown {
    if (val == null) {
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

    if (val.content.indexOf("$.") !== -1) {
      return get(context, val.content.slice(2));
    }

    if (val.content[0] === "'" || val.content[0] === '"') {
      return val.content.slice(1, -1);
    }

    if (val.content[0] === "`") {
      return this.parseTemplateString(val, context);
    }

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
    this._references.push({ from: val.from, to: val.to, content: val.content });
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
    const [result, diagnostics] = this.config?.formatter?.(input, context) || [
      input,
      [] as CompilerDiagnostic[],
    ];
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
      return null;
    }

    if (token.content === "[") {
      const node = this.parse();

      if (node.type === "node") {
        node.grouped = true;
      }
      return node;
    }

    if (token.content === "]") {
      return null;
    }

    if (token.content === "(") {
      const node = this.parse();

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
      (!this.prevToken() ||
        (OPERATION[this.prevToken()?.content || ""] || 0) > 0)
    ) {
      return {
        type: "node",
        left: {
          type: "token",
          content: "0",
          from: token.from,
          to: token.to,
          level: token.level,
        },
        operation: token,
        right: this.parseStatement(),
        grouped: true,
      };
    }

    return token;
  }
}
