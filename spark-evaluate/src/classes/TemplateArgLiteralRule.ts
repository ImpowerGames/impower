import {
  BaseRule,
  ICharClass,
  INode,
  LITERAL_EXP,
  ParserContext,
} from "../_modules/ESpression/src";

export interface IConfTemplateArgLiteralRule {
  /** AST node type for template arg literals. @default 'Literal' */
  type?: string;
  /** Invalid character classes marking the end of a literal */
  invalid?: ICharClass;
}

export class TemplateArgLiteralRule extends BaseRule<IConfTemplateArgLiteralRule> {
  constructor(config?: IConfTemplateArgLiteralRule) {
    super();
    this.config = config || {};
  }

  override pre(ctx: ParserContext): INode | null {
    const c = this.config;
    let value: string;

    value = ctx.gbCh();

    while (!ctx.eof()) {
      if (ctx.teIdPt(c.invalid)) {
        break;
      }
      value += ctx.gbCh();
    }

    return {
      type: c.type || LITERAL_EXP,
      value,
    };
  }
}
