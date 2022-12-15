/**
 * Copyright (c) 2018 Adrian Panella <ianchi74@outlook.com>
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import { INode } from "../../parser/parser.interface";
import { BINARY_EXP, MEMBER_EXP, UNARY_EXP } from "../../parser/presets/const";
import { ILvalue, KeyedObject, StaticEval, unsupportedError } from "../eval";

/* eslint-disable no-bitwise */

/** Callback functions to actually perform an operation */
export const binaryOpCB: { [operator: string]: (a: any, b: any) => any } = {
  "|": (a: any, b: any) => a | b,
  "^": (a: any, b: any) => a ^ b,
  "&": (a: any, b: any) => a & b,
  "==": (a: any, b: any) => a == b, // eslint-disable-line
  "!=": (a: any, b: any) => a != b, // eslint-disable-line
  "===": (a: any, b: any) => a === b,
  "!==": (a: any, b: any) => a !== b,
  "<": (a: any, b: any) => a < b,
  ">": (a: any, b: any) => a > b,
  "<=": (a: any, b: any) => a <= b,
  ">=": (a: any, b: any) => a >= b,
  instanceof: (a: any, b: any) => a instanceof b,
  in: (a: any, b: any) => a in b,
  "<<": (a: any, b: any) => a << b,
  ">>": (a: any, b: any) => a >> b,
  ">>>": (a: any, b: any) => a >>> b,
  "+": (a: any, b: any) => a + b, // eslint-disable-line
  "-": (a: any, b: any) => a - b,
  "*": (a: any, b: any) => a * b,
  "/": (a: any, b: any) => a / b,
  "%": (a: any, b: any) => a % b,
  "**": (a: any, b: any) => a ** b,
};
export const unaryOpCB: { [operator: string]: (a: any) => any } = {
  "-": (a: any) => -a,
  "+": (a: any) => +a,
  "!": (a: any) => !a,
  "~": (a: any) => ~a,
  typeof: (a: any) => typeof a,
  // eslint-disable-next-line no-void
  void: (a: any) => void a,
};

export const RESOLVE_NORMAL = 0;
export const RESOLVE_SHORT_CIRCUITED = 1;
export const RESOLVE_MEMBER = 2;

export class BasicEval extends StaticEval {
  /** Dummy implementation, it is not used */
  lvalue(_node: INode, _context: KeyedObject): ILvalue {
    return { o: {}, m: "" };
  }

  /** Rule to evaluate `LiteralExpression` */
  protected Literal(n: INode): unknown {
    return n.value;
  }

  /** Rule to evaluate `IdentifierExpression` */
  protected Identifier(node: INode, context: KeyedObject): unknown {
    const content = `${node.name}`;
    const result = context[content];
    const from = node.from || 0;
    const to = node.to || 0;

    if (from !== undefined && to !== undefined && content !== undefined) {
      if (result === undefined) {
        this.diagnostics.push({
          content,
          from,
          to,
          severity: "warning",
          message: `Cannot find variable named '${content}'`,
        });
      } else {
        this.references.push({ from, to, content });
      }
    }
    return result;
  }

  /** Rule to evaluate `ThisExpression` */
  protected ThisExpression(_node: INode, context: KeyedObject): unknown {
    return context;
  }

  /** Rule to evaluate `ArrayExpression` */
  protected ArrayExpression(node: INode, context: KeyedObject): unknown {
    return this._resolve(
      context,
      0,
      (...values: any[]) => values,
      ...(node.elements || [])
    );
  }

  /** Rule to evaluate `MemberExpression` */
  protected MemberExpression(node: INode, context: KeyedObject): unknown {
    return this._member(node, context, (val) => val && val.o[val.m]);
  }

  protected _MemberObject(node: INode, context: KeyedObject): any {
    return this._member(node, context, (val) => val);
  }

  protected _member<T>(
    node: INode,
    context: KeyedObject,
    project: (m: ILvalue | undefined) => T
  ): T {
    const short = node.optional || node.shortCircuited;
    const name = node.property?.name || "";
    return this._resolve(
      context,
      short ? RESOLVE_MEMBER + RESOLVE_SHORT_CIRCUITED : RESOLVE_MEMBER,
      (o: any, m: any) =>
        short
          ? o === null || typeof o === "undefined"
            ? project(undefined)
            : node.computed
            ? this._resolve(
                context,
                RESOLVE_NORMAL,
                (prop) => project({ o, m: prop }),
                node.property
              )
            : project({ o, m: name })
          : project({ o, m: node.computed ? m : name }),
      node.object,
      short || !node.computed ? undefined : node.property
    );
  }

  /** Rule to evaluate `CallExpression` */
  protected CallExpression(node: INode, context: KeyedObject): unknown {
    const short = node.optional || node.shortCircuited;
    // eslint-disable-next-line @typescript-eslint/ban-types
    const project = (obj: any, func: Function, args: any[]): unknown => {
      if (short && (func === null || typeof func === "undefined"))
        return undefined;
      if (typeof func !== "function")
        throw new TypeError("Callee is not a function");

      return short
        ? this._resolve(
            context,
            RESOLVE_NORMAL,
            (...ar) => func.apply(obj, ar),
            ...(node.arguments || [])
          )
        : func.apply(obj, args);
    };

    return this._resolve(
      context,
      RESOLVE_SHORT_CIRCUITED, // always resolve short circuited, as called function could return observable
      (def, ...args) =>
        node.callee?.type === MEMBER_EXP
          ? project(def?.o, def?.o[def.m], args)
          : project(context, def, args),
      node.callee?.type === MEMBER_EXP
        ? { ...node.callee, type: "_MemberObject" }
        : node.callee,
      ...(short ? [] : node.arguments || [])
    );
  }

  /** Rule to evaluate `ConditionalExpression` */
  protected ConditionalExpression(node: INode, context: KeyedObject): unknown {
    // can't resolve all operands together as it needs short circuit evaluation
    return this._resolve(
      context,
      RESOLVE_SHORT_CIRCUITED,
      (t) => this._eval(t ? node.consequent : node.alternate, context),
      node.test
    );
  }

  /** Rule to evaluate `CommaExpression` */
  protected SequenceExpression(node: INode, context: KeyedObject): unknown {
    return this._resolve(
      context,
      RESOLVE_NORMAL,
      (...values: any[]) => values.pop(),
      ...(node.expressions || [])
    );
  }

  /** Rule to evaluate `LogicalExpression` */
  protected LogicalExpression(node: INode, context: KeyedObject): unknown {
    // can't resolve all operands together as it needs short circuit evaluation

    return this._resolve(
      context,
      RESOLVE_SHORT_CIRCUITED,
      (test) => {
        switch (node.operator) {
          case "||":
            return test || this._eval(node.right, context);
          case "&&":
            return test && this._eval(node.right, context);
          case "??":
            return test ?? this._eval(node.right, context);
          case "##":
            return this._eval(node.right, context);
          default:
            throw unsupportedError(BINARY_EXP, node.operator);
        }
      },
      node.left
    );
  }

  /** Rule to evaluate `BinaryExpression` */
  protected BinaryExpression(node: INode, context: KeyedObject): unknown {
    if (!node.operator || !(node.operator in binaryOpCB)) {
      throw unsupportedError(BINARY_EXP, node.operator);
    }

    return this._resolve(
      context,
      RESOLVE_NORMAL,
      binaryOpCB[node.operator],
      node.left,
      node.right
    );
  }

  /** Rule to evaluate `UnaryExpression` */
  protected UnaryExpression(node: INode, context: KeyedObject): unknown {
    if (!node.operator || !(node.operator in unaryOpCB)) {
      throw unsupportedError(UNARY_EXP, node.operator);
    }

    return this._resolve(
      context,
      RESOLVE_NORMAL,
      unaryOpCB[node.operator],
      node.argument
    );
  }

  /** Rule to evaluate `ExpressionStatement` */
  protected ExpressionStatement(node: INode, context: KeyedObject): unknown {
    return this._eval(node.expression, context);
  }

  /** Rule to evaluate `Program` */
  protected Program(node: INode, context: KeyedObject): unknown {
    return this._resolve(
      context,
      RESOLVE_NORMAL,
      (...values: any[]) => values.pop(),
      ...(node.body || [])
    );
  }

  /** Rule to evaluate JSEP's `CompoundExpression` */
  protected Compound(node: INode, context: KeyedObject): unknown {
    return this.Program(node, context);
  }
}
