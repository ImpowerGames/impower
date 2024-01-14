import {
  BINARY_EXP,
  BinaryOperatorRule,
  ESnextParser,
  ICharClass,
  StringRule,
  TOKEN,
  UNARY_EXP,
} from "../_modules/ESpression/src";
import { biOpConfs } from "../_modules/ESpression/src/parser/presets/es5";
import CustomTemplateExpressionRule, {
  IConfCustomTemplateExpressionRule,
} from "./CustomTemplateExpressionRule";

const UNPREFIXED_TEMPLATE_EXPR = "unprefixed_template_expr";

const CUSTOM_TEMPLATE_EXPR_TYPE: IConfCustomTemplateExpressionRule = {
  type: "CustomTemplateExpression",
};

export default class SparkExpressionParser extends ESnextParser {
  constructor(
    noStatement?: boolean,
    identStart?: ICharClass,
    identPart?: ICharClass
  ) {
    super(noStatement, identStart, identPart);
    this.rules[BINARY_EXP] = [
      ...biOpConfs.map((conf) => new BinaryOperatorRule(conf)),
      UNARY_EXP,
    ];
    this.rules[UNPREFIXED_TEMPLATE_EXPR] = [
      new CustomTemplateExpressionRule(CUSTOM_TEMPLATE_EXPR_TYPE),
    ];
    [...(this.rules[TOKEN] || []), ...(this.rules["template"] || [])]?.forEach(
      (r) => {
        if (r instanceof StringRule && r.config.templateRules) {
          r.config.unprefixedTemplateRules = UNPREFIXED_TEMPLATE_EXPR;
        }
      }
    );
  }
}
