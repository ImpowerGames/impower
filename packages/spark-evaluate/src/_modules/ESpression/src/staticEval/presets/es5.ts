/**
 * Copyright (c) 2018 Adrian Panella <ianchi74@outlook.com>
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

/* eslint-disable no-param-reassign */
/* eslint-disable no-return-assign */
/* eslint-disable no-bitwise */

import { INode } from "../../parser/parser.interface";
import {
  ARRAY_PAT,
  ASSIGN_EXP,
  CALL_EXP,
  IDENTIFIER_EXP,
  LITERAL_EXP,
  MEMBER_EXP,
  OBJECT_PAT,
  REST_ELE,
  SPREAD_EXP,
  UPDATE_EXP,
} from "../../parser/presets/const";
import { ILvalue, KeyedObject, unsupportedError } from "../eval";

import { BasicEval, RESOLVE_NORMAL } from "./basic";

/** Callback functions to actually perform an operation */
export const assignOpCB: {
  [operator: string]: (a: KeyedObject, m: string, b: any) => any;
} = {
  "=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] = b;
    }
  },
  "+=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] += b;
    }
  },
  "-=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] -= b;
    }
  },
  "*=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] *= b;
    }
  },
  "/=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] /= b;
    }
  },
  "%=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] %= b;
    }
  },
  "**=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] **= b;
    }
  },
  "<<=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] <<= b;
    }
  },
  ">>=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] >>= b;
    }
  },
  ">>>=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] >>>= b;
    }
  },
  "|=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] |= b;
    }
  },
  "&=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] &= b;
    }
  },
  "^=": (a: KeyedObject, m: string, b: any) => {
    if (a) {
      a[m] ^= b;
    }
  },
};
export const preUpdateOpCB: {
  [operator: string]: (a: KeyedObject, m: string) => any;
} = {
  "++": (a: KeyedObject, m: string) => ++a[m],
  "--": (a: KeyedObject, m: string) => --a[m],
};
export const postUpdateOpCB: {
  [operator: string]: (a: KeyedObject, m: string) => any;
} = {
  "++": (a: KeyedObject, m: string) => a[m]++,
  "--": (a: KeyedObject, m: string) => a[m]--,
};
export class ES5StaticEval extends BasicEval {
  override lvalue(node: INode | undefined, context: KeyedObject): ILvalue {
    let def;
    switch (node?.type) {
      case IDENTIFIER_EXP:
        return { o: context, m: node.name || "" };
      case MEMBER_EXP:
        def = this._MemberObject(node, context);
        if (!def) {
          throw new Error("Invalid left side expression");
        }
        return def;
      default:
        throw new Error("Invalid left side expression");
    }
  }

  /** Rule to evaluate `ArrayExpression` with spread operator */
  protected override ArrayExpression(node: INode, context: KeyedObject): any {
    return this._resolve(
      context,
      0,
      (...values: any[]) => {
        const result: any[] = [];
        node.elements?.forEach((n: INode, i: number) => {
          if (n && n.type === SPREAD_EXP) {
            for (const val of values[i]) result.push(val);
          } else if (n) result.push(values[i]);
          else result.length++;
        });
        return result;
      },
      ...(node.elements?.map((n: INode) =>
        n?.type === SPREAD_EXP ? n.argument : n
      ) || [])
    );
  }

  /** Rule to evaluate `ObjectExpression` */
  protected ObjectExpression(node: INode, context: KeyedObject): any {
    const keys: Array<string | undefined> = [];
    const computedNodes: INode[] = [];
    const computed: number[] = [];
    const spread: number[] = [];
    const nodes =
      node.properties?.map((n: INode, i: number) => {
        let key: string;
        if (n.type === SPREAD_EXP) {
          keys.push(undefined);
          spread.push(i);
          return n.argument;
        }

        if (n.computed) {
          keys.push(undefined);
          computed.push(i);
          if (n.key) {
            computedNodes.push(n.key);
          }
        } else {
          if (n.key?.type === IDENTIFIER_EXP) {
            key = n.key.name || "";
          } else if (n.key?.type === LITERAL_EXP) {
            key = n.key.value?.toString() || "";
          } else {
            throw new Error("Invalid property");
          }
          keys.push(key);
        }

        return n.value;
      }) || [];

    // add callback as first argument
    return this._resolve(
      context,
      RESOLVE_NORMAL,
      (...args: any[]) => {
        // completed resolved key names
        computed.forEach((idx) => (keys[idx] = args.shift()));
        // generate object
        return args.reduce((ret, val, i) => {
          if (spread.indexOf(i) >= 0)
            Object.keys(val ?? {}).forEach((key) => (ret[key] = val[key]));
          else ret[keys[i]!] = val;
          return ret;
        }, {});
      },
      ...computedNodes,
      ...nodes
    );
  }

  /** Rule to evaluate `TemplateLiteral` */
  protected TemplateLiteral(node: INode, context: KeyedObject): any {
    return this._resolve(
      context,
      RESOLVE_NORMAL,
      (...values: any[]) =>
        values.reduce(
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          (r, e, i) => (r += e + node.quasis?.[i + 1]?.value.cooked),
          node.quasis?.[0]?.value.cooked
        ),
      ...(node.expressions || [])
    );
  }

  protected TaggedTemplateExpression(node: INode, context: KeyedObject): any {
    return this.CallExpression(
      {
        type: CALL_EXP,
        callee: node.tag,
        optional: node.optional,
        shortCircuited: node.shortCircuited,
        arguments: [
          { type: "ArrayExpression", elements: node.quasi?.quasis },
          ...(node.quasi?.expressions || []),
        ],
      },
      context
    );
  }

  protected TemplateElement(node: INode, _context: KeyedObject): any {
    return node.value.cooked;
  }

  _assignPattern(
    node: INode | undefined,
    operator: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    right: any,
    context: KeyedObject,
    defaultsContext?: KeyedObject
  ): any {
    if (node) {
      switch (node.type) {
        case ARRAY_PAT:
          if (operator !== "=") {
            throw new Error("Invalid left-hand side in assignment");
          }
          if (!Array.isArray(right)) {
            throw new Error("TypeError: must be array");
          }

          if (node.elements) {
            for (let i = 0; i < node.elements.length; i++) {
              const el = node.elements[i];
              if (!el) {
                continue;
              }

              if (el.type === REST_ELE && el.argument) {
                this._assignPattern(
                  el.argument,
                  operator,
                  right.slice(i),
                  context,
                  defaultsContext
                );
              } else {
                this._assignPattern(
                  el,
                  operator,
                  right[i],
                  context,
                  defaultsContext
                );
              }
            }
          }
          break;

        case OBJECT_PAT:
          if (operator !== "=") {
            throw new Error("Invalid left-hand side in assignment");
          }
          if (right === null || typeof right === "undefined") {
            throw new Error("TypeError: must be convertible to object");
          }

          const visited: any = {};
          if (node.properties) {
            node.properties.forEach((prop) => {
              if (prop.type === REST_ELE) {
                const rest = Object.keys(right)
                  .filter((k) => !(k in visited))
                  // eslint-disable-next-line no-loop-func
                  .reduce((r: any, k) => {
                    r[k] = right[k];
                    return r;
                  }, {});
                this._assignPattern(
                  prop.argument,
                  operator,
                  rest,
                  context,
                  defaultsContext
                );
              } else {
                const key = prop.computed
                  ? this._eval(prop.key, context)
                  : prop.key?.type === LITERAL_EXP
                  ? prop.key.value
                  : prop.key?.name;
                visited[key] = true;
                this._assignPattern(
                  prop.value,
                  operator,
                  right[key],
                  context,
                  defaultsContext
                );
              }
            });
          }

          break;

        case "AssignmentPattern":
          if (typeof right === "undefined") {
            right = this._eval(node.right, defaultsContext ?? context);
          }

          return this._assignPattern(
            node.left,
            operator,
            right,
            context,
            defaultsContext
          );

        default:
          const left = this.lvalue(node, context);

          return assignOpCB[operator]?.(left.o, left.m, right);
      }
    }

    return right;
  }

  /** Rule to evaluate `AssignmentExpression` */
  protected AssignmentExpression(node: INode, context: KeyedObject): any {
    if (!node.operator || !(node.operator in assignOpCB)) {
      throw unsupportedError(ASSIGN_EXP, node.operator);
    }

    const right = this._eval(node.right, context);

    return this._assignPattern(node.left, node.operator, right, context);
  }

  /** Rule to evaluate `UpdateExpression` */
  protected UpdateExpression(node: INode, context: KeyedObject): any {
    const cb = node.prefix ? preUpdateOpCB : postUpdateOpCB;
    if (!node.operator || !(node.operator in cb)) {
      throw unsupportedError(UPDATE_EXP, node.operator);
    }
    const left = this.lvalue(node.argument, context);

    return cb[node.operator]?.(left.o, left.m);
  }

  /** Rule to evaluate `UnaryExpression` */
  protected override UnaryExpression(node: INode, context: KeyedObject): any {
    if (node.operator === "delete") {
      const obj = this.lvalue(node.argument, context);
      return delete obj.o[obj.m];
    }

    return super.UnaryExpression(node, context);
  }

  /** Rule to evaluate `NewExpression` */
  protected NewExpression(node: INode, context: KeyedObject): any {
    return this._resolve(
      context,
      RESOLVE_NORMAL,
      // eslint-disable-next-line new-cap
      (callee: new (...args: any[]) => any, ...args: any[]) =>
        new callee(...args),
      node.callee,
      ...(node.arguments || [])
    );
  }
}
