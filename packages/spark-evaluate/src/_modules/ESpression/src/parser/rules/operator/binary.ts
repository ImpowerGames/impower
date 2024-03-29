/**
 * Copyright (c) 2018 Adrian Panella <ianchi74@outlook.com>
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import { INode, IOperatorDef } from "../../parser.interface";
import { IExtraConf, ParserContext } from "../../parserContext";
import { BaseRule } from "../baseRule";
import { IMultiConf, ISubRuleConf } from "../conf.interface";

/**
 * Configuration object for a single binary expression
 */
export interface IConfBinaryOp extends IMultiConf, ISubRuleConf, IExtraConf {
  /** AST node type for the binary expression */
  type: string;
  /** AST property name for the left operand's AST. @default "left" */
  left?: string;
  /** AST property name for the right operand's AST. @default "right" */
  right?: string;
  /**
   * AST property name to store the operator string.
   * If it is empty, the operator is not stored in the AST
   */
  oper?: string;
  /** Operator has right associativity */
  rasoc?: boolean;
  /** Operator needs a mandatory space afterwards. @example `a instanceof b` */
  space?: boolean;
  /** Restrict left operand to only the specified AST types */
  ltypes?: string[];
  /**
   * If set, the binary expression must be closed after right operand
   * using this closing character.
   */
  close?: string;
  /** Allow empty right operand. Only in closed operators */
  empty?: boolean;
}

/**
 * Configurator object for Binary operator rules.
 * Each property is an operator of the same priority, described using {@link confBinaryOp}
 */
export interface IConfBinaryRule extends IOperatorDef {
  [operator: string]: IConfBinaryOp;
}

/**
 * Rule to parse most expressions with two operands or sides
 *
 * @remarks
 * Closed operators allow for empty and multiple right operands and
 * to use different parsing rules to parse it.
 * Left operand can be restricted in its valid types
 *
 * @see [[confBinaryOp]]
 * @example
 * + left op right `a + b`
 * + left op right cl `obj[mem]`
 * + left op right sp right sp right cl `func(param1, param2, param3)`
 * + left op cl `func()`
 * @description The resulting AST node has the format:
 * ```
 * {
 *   "type": conf.type,
 *   [conf.left]: AST,
 *   [conf.right]: AST | AST[], // array if conf.multi
 *   [conf.oper]?: string, // if oper is not empty string
 *   ... conf.extra
 * }
 * ```
 *
 */
export class BinaryOperatorRule extends BaseRule<IConfBinaryRule> {
  constructor(
    public override config: IConfBinaryRule,
    public required: boolean = false
  ) {
    super();

    for (const op in config) {
      const c = config[op];
      if (c) {
        c.empty = (c.close && c.empty) || false;
        c.separators = (c.close && c.separators) || "";
        this.unwrapMulti(c);
      }
    }
  }

  override register(): IOperatorDef {
    return this.config;
  }

  override post(ctx: ParserContext, bubbledNode: INode): INode {
    const curPos = bubbledNode.from !== undefined ? bubbledNode.from : ctx.i;
    let op = ctx.gbOp(this.config);

    if (this.required && !op)
      return ctx.err(
        `Expected operator (${Object.keys(this.config).join(",")})`
      );

    while (op) {
      const c = this.config[op];

      if (!c) {
        break;
      }

      if (c.ltypes && c.ltypes.indexOf(bubbledNode.type) < 0)
        return ctx.err("Invalid left-hand side");

      const nodes = ctx.parseMulti(c, c.subRules || (c.rasoc ? 0 : 1));

      if (!nodes.length && !c.empty) return ctx.err("Expression expected.");
      delete nodes.match;

      if (c.close && !ctx.tyCh(c.close))
        return ctx.err("Closing character expected. Found");

      bubbledNode = this.addExtra(
        c,
        {
          type: c.type,
          [c.left || "left"]: bubbledNode,
          [c.right || "right"]: c.separators ? nodes : nodes[0],
        },
        ctx
      );
      if (c.oper) {
        bubbledNode[c.oper] = op;
      }
      bubbledNode.from = curPos;
      bubbledNode.to = ctx.ch;
      op = c.rasoc ? "" : ctx.gbOp(this.config);
    }

    return bubbledNode;
  }
}
