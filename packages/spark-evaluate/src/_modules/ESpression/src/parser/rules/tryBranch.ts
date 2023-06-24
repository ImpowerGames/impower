/*
 * Copyright (c) 2018 Adrian Panella <ianchi74@outlook.com>
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import { INode } from "../parser.interface";
import { IExtraConf, ParserContext } from "../parserContext";

import { BaseRule } from "./baseRule";
import { ISubRuleConf } from "./conf.interface";

/**
 * Configuration object for a try branch rule
 */
export interface IConfTryBranch extends ISubRuleConf, IExtraConf {
  /** AST node type for string expressions. */
  type?: string;
  subRules: string;
  /** if present, list of opening characters to test for in order to branch */
  test?: string;
}

export class TryBranchRule extends BaseRule<IConfTryBranch> {
  constructor(public override config: IConfTryBranch) {
    super();
  }

  override pre(ctx: ParserContext): INode | null {
    const initState: [number, boolean, boolean] = [ctx.i, ctx.lt, ctx.sp];

    if (this.config.test && !this.config.test.includes(ctx.gtCh())) return null;

    try {
      const node = ctx.parseNext(this.config.subRules);
      return this.addExtra(this.config, node, ctx);
    } catch (e) {
      [ctx.i, ctx.lt, ctx.sp] = initState;
      return null;
    }
  }
}
