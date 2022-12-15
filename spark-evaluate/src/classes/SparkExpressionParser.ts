import {
  BinaryOperatorRule,
  BINARY_EXP,
  ESnextParser,
  EXPRESSIONS,
  ICharClass,
  IConfMultipleRule,
  MultiOperatorRule,
  NOCOMMA_EXPR,
  TEMPLATE_EXPR,
  UNARY_EXP,
} from "../_modules/ESpression/src";
import { biOpConfs } from "../_modules/ESpression/src/parser/presets/es5";
import { TemplateArgLiteralRule } from "./TemplateArgLiteralRule";

const TEMPLATE_ARG_LITERAL = "template_arg_literal";

const TEMPLATE_ARGS_TYPE: IConfMultipleRule = {
  type: "TemplateArgsExpression",
  prop: EXPRESSIONS,
  separators: "|:",
  subRules: TEMPLATE_ARG_LITERAL,
  includeSpace: true,
  empty: true,
  sparse: true,
  trailing: true,
};

export class SparkExpressionParser extends ESnextParser {
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
    this.rules[TEMPLATE_EXPR] = [
      new MultiOperatorRule(TEMPLATE_ARGS_TYPE),
      NOCOMMA_EXPR,
    ];
    this.rules[TEMPLATE_ARG_LITERAL] = [
      new TemplateArgLiteralRule({
        invalid: { re: /[}|:]/ },
      }),
    ];
  }
}
