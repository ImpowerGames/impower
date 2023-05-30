/**
 * Copyright (c) 2018 Adrian Panella <ianchi74@outlook.com>
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import { Parser } from "../parser";
import { ICharClass, INode } from "../parser.interface";
import { IRuleSet } from "../parserContext";
import { BaseRule } from "../rules/baseRule";
import { BinaryOperatorRule, IConfBinaryRule } from "../rules/operator/binary";
import {
  IConfMultipleRule,
  MultiOperatorRule,
} from "../rules/operator/multiple";
import { TernaryOperatorRule } from "../rules/operator/ternary";
import { UnaryOperatorRule } from "../rules/operator/unary";
import { IdentifierRule } from "../rules/token/identifier";
import { NumberRule } from "../rules/token/number";
import { RegexRule } from "../rules/token/regex";
import { StringRule } from "../rules/token/string";

import {
  ARRAY_EXP,
  ARRAY_TYPE,
  ASSIGN_TYPE,
  BINARY_EXP,
  BINARY_TYPE,
  BINARY_TYPE_SP,
  CALL_EXP,
  CALL_TYPE,
  COMMA_TYPE,
  CONDITIONAL_EXP,
  EXPRESSION,
  EXPRESSION_EXP,
  GROUP_TYPE,
  LITERAL_EXP,
  LOGICAL_EXP,
  LOGICAL_TYPE,
  MEMBER_EXP,
  MEMBER_TYPE,
  MEMBER_TYPE_COMP,
  NEW_EXP,
  NOCOMMA_EXPR,
  OBJECT,
  OBJECT_TYPE,
  opConf,
  PROPERTY,
  PROPERTY_TYPE,
  SPREAD_EXP,
  STATEMENT,
  TAGGED_EXP,
  TEMPLATE_EXPR,
  TOKEN,
  UNARY_EXP,
  UNARY_TYPE_PRE,
  UNARY_TYPE_PRE_SP,
  UPDATE_EXP,
  UPDATE_TYPE,
  UPDATE_TYPE_PRE,
} from "./const";
import { es5IdentifierConf } from "./identStartConf";

const PROGRAM_CONF: IConfMultipleRule = {
  type: "Program",
  prop: "body",
  extra: { sourceType: "script" },
  separators: ";\n",
  sparse: { type: "EmptyStatement" },
  trailing: true,
  empty: true,
};

export const biLogicOpConfs: IConfBinaryRule[] = [
  { "||": LOGICAL_TYPE },
  { "&&": LOGICAL_TYPE },
];
export const biBitOpConfs: IConfBinaryRule[] = [
  { "|": BINARY_TYPE },
  { "^": BINARY_TYPE },
  { "&": BINARY_TYPE },
];
export const biOpConfs: IConfBinaryRule[] = [
  opConf(["==", "!=", "===", "!=="], BINARY_TYPE),
  opConf(
    [
      ["<", ">", "<=", ">="],
      ["instanceof", "in"],
    ],
    [BINARY_TYPE, BINARY_TYPE_SP]
  ),
  opConf(["<<", ">>", ">>>"], BINARY_TYPE),
  opConf(["+", "-"], BINARY_TYPE),
  opConf(["*", "/", "%"], BINARY_TYPE),
];

export const numberRules: Array<BaseRule<any>> = [
  new NumberRule({ radix: 16, prefix: "0x" }),
  new NumberRule({ radix: 8, prefix: "0o" }),
  new NumberRule({ radix: 2, prefix: "0b" }),
  new NumberRule(),
];
export const memberRule = new BinaryOperatorRule({
  ".": MEMBER_TYPE,
  "[": MEMBER_TYPE_COMP,
});
export function es5Rules(
  identStart?: ICharClass,
  identPart?: ICharClass
): IRuleSet {
  // basic tokens used also in parsing object literal's properties

  const identifierRule = new IdentifierRule(
    es5IdentifierConf(identStart, identPart)
  );
  // object needs subset of tokens for parsing properties.
  const tokenRules = numberRules.concat([
    new StringRule({
      LT: true,
      hex: true,
      cp: true,
      raw: true,
      templateRules: TEMPLATE_EXPR,
    }),
    identifierRule,
    new UnaryOperatorRule({ "[": ARRAY_TYPE }),
    new RegexRule(),
    new UnaryOperatorRule({ "{": OBJECT_TYPE }),
  ]);

  const newRule = new UnaryOperatorRule({
    new: {
      type: NEW_EXP,
      prop: "callee",
      isPre: true,
      space: true,
      subRules: NEW_EXP,
      extra: (node: INode) => {
        if (node.callee?.type !== CALL_EXP) node.arguments = [];
        else {
          node.arguments = node.callee.arguments;
          node.callee = node.callee.callee;
        }
        return node;
      },
    },
  });

  const groupingRule = new UnaryOperatorRule({ "(": GROUP_TYPE });
  const propertyRule = new IdentifierRule({ identStart, identPart });

  return {
    [STATEMENT]: [
      new MultiOperatorRule(PROGRAM_CONF),
      new MultiOperatorRule({
        type: EXPRESSION_EXP,
        prop: EXPRESSION,
        extra: (node: INode): INode =>
          node.expression?.type === LITERAL_EXP &&
          typeof node.expression.value === "string"
            ? {
                ...node,
                directive: node.expression.raw?.substring(
                  1,
                  node.expression.raw.length - 1
                ),
              }
            : node,
      }),
      EXPRESSION,
    ],
    [EXPRESSION]: [new MultiOperatorRule(COMMA_TYPE), NOCOMMA_EXPR],
    [NOCOMMA_EXPR]: [
      new BinaryOperatorRule(
        opConf(
          [
            "=",
            "+=",
            "-=",
            "*=",
            "/=",
            "%=",
            ">>=",
            "<<=",
            ">>>=",
            "|=",
            "&=",
            "^=",
          ],
          ASSIGN_TYPE
        )
      ),

      new TernaryOperatorRule({
        type: CONDITIONAL_EXP,
        subRules: NOCOMMA_EXPR,
      }),

      LOGICAL_EXP,
    ],

    [LOGICAL_EXP]: [
      ...biLogicOpConfs.map((conf) => new BinaryOperatorRule(conf)),
      BINARY_EXP,
    ],
    [BINARY_EXP]: [
      ...biBitOpConfs.map((conf) => new BinaryOperatorRule(conf)),
      ...biOpConfs.map((conf) => new BinaryOperatorRule(conf)),
      UNARY_EXP,
    ],

    [UNARY_EXP]: [
      new UnaryOperatorRule(
        opConf(
          [
            ["+", "-", "!", "~"],
            ["typeof", "void", "delete"],
          ],
          [UNARY_TYPE_PRE, UNARY_TYPE_PRE_SP]
        )
      ),
      UPDATE_EXP,
    ],

    [UPDATE_EXP]: [
      new UnaryOperatorRule(opConf(["++", "--"], UPDATE_TYPE_PRE)),
      new UnaryOperatorRule(opConf(["++", "--"], UPDATE_TYPE)),
      MEMBER_EXP,
    ],

    [MEMBER_EXP]: [
      new BinaryOperatorRule({
        ".": MEMBER_TYPE,
        "[": MEMBER_TYPE_COMP,
        "(": CALL_TYPE,
        "`": {
          type: TAGGED_EXP,
          left: "tag",
          right: "quasi",
          subRules: "template",
        },
      }),
      newRule,
      groupingRule,
      TOKEN,
    ],

    [TOKEN]: tokenRules,

    // auxiliary branches
    // member identifier (allows reserved words)
    [PROPERTY]: [propertyRule],
    // new operator

    [NEW_EXP]: [
      newRule,
      new BinaryOperatorRule({ "(": CALL_TYPE }),
      memberRule,
      groupingRule,
      TOKEN,
    ],

    // object literal
    [OBJECT]: [
      new BinaryOperatorRule({ ":": PROPERTY_TYPE }),
      new UnaryOperatorRule({
        "[": { type: EXPRESSION, close: "]", subRules: NOCOMMA_EXPR },
      }),

      ...numberRules,
      propertyRule,
      new StringRule({ LT: true, hex: true, raw: true }),
    ],

    [ARRAY_EXP]: [
      new UnaryOperatorRule({
        "...": { type: SPREAD_EXP, isPre: true, subRules: NOCOMMA_EXPR },
      }),
      NOCOMMA_EXPR,
    ],
    template: [
      new StringRule({
        LT: true,
        hex: true,
        raw: true,
        unquoted: false,
        templateRules: TEMPLATE_EXPR,
      }),
    ],
    lvalue: [memberRule, identifierRule],
    [TEMPLATE_EXPR]: [EXPRESSION],
  };
}

export class ES5Parser extends Parser {
  constructor(
    noStatement?: boolean,
    identStart?: ICharClass,
    identPart?: ICharClass
  ) {
    super(
      es5Rules(identStart, identPart),
      noStatement ? EXPRESSION : STATEMENT,
      identStart,
      identPart
    );
  }
}
