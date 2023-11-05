import {
  BaseRule,
  INode,
  ISubRuleConf,
  ParserContext,
} from "../_modules/ESpression/src";

export interface IConfCustomTemplateExpressionRule extends ISubRuleConf {
  type: string;
}

export class CustomTemplateExpressionRule extends BaseRule<IConfCustomTemplateExpressionRule> {
  constructor(public override config: IConfCustomTemplateExpressionRule) {
    super();
  }

  override pre(ctx: ParserContext): INode | null {
    const c = this.config;
    let str = "";
    while (!ctx.eof() && ctx.gtCh(0) !== "}") {
      str += ctx.gbCh();
    }
    return {
      type: c.type,
      value: str,
      raw: str,
    };
  }
}
