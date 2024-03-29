/**
 * Copyright (c) 2018 Adrian Panella <ianchi74@outlook.com>
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import { ICharClass, INode } from "../../parser.interface";
import { ParserContext } from "../../parserContext";
import { IDENTIFIER_EXP, LITERAL_EXP, THIS_EXP } from "../../presets/const";
import { BaseRule } from "../baseRule";

export interface IConfIdentifierRule {
  /** AST node type for literal expressions. @default 'Literal' */
  typeLiteral?: string;
  /** AST property name for the literal's value. @default "value" */
  propLiteral?: string;
  /** AST node type for identifier expressions. @default 'Identifier' */
  type?: string;
  /** AST property name for the Identifiers's name. @default "name" */
  prop?: string;
  /** Map of 'literal identifier':value */
  literals?: { [literal: string]: any };
  /** Match "this" as a `ThisExpression` */
  this?: boolean;
  /** Array of reserved words not valid as identifiers */
  reserved?: string[];
  /** Valid character classes marking the start of an identifier */
  identStart?: ICharClass;
  /** Valid character classes for identifier part */
  identPart?: ICharClass;
}

/**
 * Rule to parse identifiers, constant literals or `this`
 *
 * @see [[IConfIdentifierRule]]
 *
 * ## Syntax
 * ```
 * identifier
 * ```
 *
 * ## AST
 * The resulting AST node has the format:
 * ### Literals
 * ```
 * {
 *   "type": conf.typeLiteral,
 *   [conf.propLiteral]: string,
 *   "raw": string
 * }
 * ```
 * @example `null` `true` `false`
 *
 * ### This
 * ```
 * {
 *   "type": "ThisExpression",
 * }
 * ```
 * ### Identifier
 * ```
 * {
 *   "type": conf.typeIdent,
 *   [conf.propIdent]: string
 * }
 * ```
 */
export class IdentifierRule extends BaseRule<IConfIdentifierRule> {
  constructor(config?: IConfIdentifierRule) {
    super();
    this.config = config || {};
  }

  override pre(ctx: ParserContext): INode | null {
    const c = this.config;
    let identifier: string;

    if (!ctx.teIdSt(c.identStart)) return null;
    identifier = ctx.gbCh();

    while (!ctx.eof()) {
      if (!ctx.teIdPt(c.identPart)) break;
      identifier += ctx.gbCh();
    }

    if (c.this && identifier === "this") return { type: THIS_EXP };

    if (c.literals && identifier in c.literals)
      return {
        type: c.typeLiteral || LITERAL_EXP,
        [c.propLiteral || "value"]: c.literals[identifier],
        raw: identifier,
      };

    if (c.reserved && c.reserved.indexOf(identifier) >= 0)
      return ctx.err("Invalid reserved identifier");

    return {
      type: c.type || IDENTIFIER_EXP,
      [c.prop || "name"]: identifier,
    };
  }
}
