/*
 * Copyright (c) 2018 Adrian Panella <ianchi74@outlook.com>
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import { INode } from "../parser.interface";
import { ParserContext } from "../parserContext";
import { IConfBinaryOp } from "../rules/operator/binary";
import { IConfMultipleRule } from "../rules/operator/multiple";
import { IConfUnaryOp } from "../rules/operator/unary";

export const BINARY_EXP = "BinaryExpression";
export const LOGICAL_EXP = "LogicalExpression";
export const ASSIGN_EXP = "AssignmentExpression";
export const ASSIGN_PAT = "AssignmentPattern";
export const ARRAY_PAT = "ArrayPattern";
export const OBJECT_PAT = "ObjectPattern";
export const LITERAL_EXP = "Literal";
export const TEMPLATE_EXP = "TemplateLiteral";
export const TEMPLATE_ELE = "TemplateElement";
export const TAGGED_EXP = "TaggedTemplateExpression";
export const IDENTIFIER_EXP = "Identifier";
export const THIS_EXP = "ThisExpression";
export const ARRAY_EXP = "ArrayExpression";
export const OBJECT_EXP = "ObjectExpression";
export const MEMBER_EXP = "MemberExpression";
export const CALL_EXP = "CallExpression";
export const CONDITIONAL_EXP = "ConditionalExpression";
export const SEQUENCE_EXP = "SequenceExpression";
export const UPDATE_EXP = "UpdateExpression";
export const UNARY_EXP = "UnaryExpression";
export const NEW_EXP = "NewExpression";
export const EXPRESSION_EXP = "ExpressionStatement";
export const SPREAD_EXP = "SpreadElement";
export const REST_ELE = "RestElement";
export const ARROW_EXP = "ArrowFunctionExpression";
export const OPER = "operator";
export const PREFIX = "prefix";
export const OBJECT = "object";
export const PROPERTY = "property";
export const EXPRESSION = "expression";
export const TEMPLATE_EXPR = "template_expr";
// eslint-disable-next-line prefer-template
export const EXPRESSIONS = EXPRESSION + "s";
export const STATEMENT = "statement";
export const NOCOMMA_EXPR = "nocomma_expr";
export const TERNARY_EXPR = "ternary_expr";
export const BINARY_ASSIGN_EXPR = "binary_assign_expr";
export const BINARY_LOGIC_EXPR = "binary_logic_expr";
export const BINARY_BIT_EXPR = "binary_bit_expr";
export const BINARY_OTHER_EXPR = "binary_other_expr";
export const TOKEN = "token";

export function checkRest(
  attr: string,
  node: INode,
  ctx: ParserContext
): INode {
  const rest = (node[attr] as [INode]).findIndex(
    (n) => n && n.type === REST_ELE
  );
  if (rest >= 0 && rest !== node[attr].length - 1)
    ctx.err("rest element must be the last");

  return node;
}
export const BINARY_TYPE: IConfBinaryOp = { type: BINARY_EXP, oper: OPER };
export const BINARY_TYPE_SP: IConfBinaryOp = { ...BINARY_TYPE, space: true };
export const LOGICAL_TYPE: IConfBinaryOp = { type: LOGICAL_EXP, oper: OPER };
export const ASSIGN_TYPE: IConfBinaryOp = {
  type: ASSIGN_EXP,
  ltypes: [IDENTIFIER_EXP, MEMBER_EXP],
  oper: OPER,
  rasoc: true,
  subRules: NOCOMMA_EXPR,
};
export const UNARY_TYPE: IConfUnaryOp = {
  type: UNARY_EXP,
  oper: OPER,
  prefix: PREFIX,
};
export const UNARY_TYPE_PRE: IConfUnaryOp = { ...UNARY_TYPE, isPre: true };
export const UNARY_TYPE_PRE_SP: IConfUnaryOp = {
  ...UNARY_TYPE_PRE,
  space: true,
};
export const UPDATE_TYPE: IConfUnaryOp = {
  type: UPDATE_EXP,
  oper: OPER,
  prefix: PREFIX,
  types: [IDENTIFIER_EXP, MEMBER_EXP],
};
export const UPDATE_TYPE_PRE: IConfUnaryOp = { ...UPDATE_TYPE, isPre: true };
export const ARRAY_TYPE: IConfUnaryOp = {
  type: ARRAY_EXP,
  prop: "elements",
  close: "]",
  separators: ",",
  sparse: true,
  trailing: true,
  empty: true,
  subRules: ARRAY_EXP,
};
export const PARAMS_TYPE: IConfUnaryOp = {
  type: "params",
  prop: "params",
  close: ")",
  separators: ",",
  trailing: true,
  empty: true,
  subRules: "bindElem",
  extra: checkRest.bind(null, "params"),
};
export const ARRAY_PAT_TYPE: IConfUnaryOp = {
  type: ARRAY_PAT,
  close: "]",
  prop: "elements",
  isPre: true,
  separators: ",",
  sparse: true,
  empty: true,
  trailing: true,

  subRules: ARRAY_PAT,
  extra: checkRest.bind(null, "elements"),
};
export const OBJECT_PAT_TYPE: IConfUnaryOp = {
  type: OBJECT_PAT,
  close: "}",
  prop: "properties",
  isPre: true,
  separators: ",",
  empty: true,
  trailing: true,
  subRules: OBJECT_PAT,
  extra: (node: INode, ctx: ParserContext) => {
    node.properties = node.properties?.map((n: INode) => {
      const ret =
        n.type !== IDENTIFIER_EXP && n.type !== ASSIGN_PAT
          ? n
          : {
              type: "Property",
              key: n.type === IDENTIFIER_EXP ? n : n.left,
              value: n,
              kind: "init",
              method: false,
              shorthand: true,
              computed: false,
            };
      ret.from = n.from;
      ret.to = n.to;
      return ret;
    });
    return checkRest("properties", node, ctx);
  },
};
export const OBJECT_TYPE: IConfUnaryOp = {
  type: OBJECT_EXP,
  prop: "properties",
  close: "}",
  separators: ",",
  trailing: true,
  empty: true,
  subRules: OBJECT,
  types: [IDENTIFIER_EXP, "Property", SPREAD_EXP],
  // eslint-disable-next-line no-return-assign
  extra: (node: INode) => {
    node.properties = node.properties?.map((n: INode) => {
      const ret =
        n.type !== IDENTIFIER_EXP
          ? n
          : {
              type: "Property",
              key: n,
              value: n,
              kind: "init",
              method: false,
              shorthand: true,
              computed: false,
            };
      ret.from = n.from;
      ret.to = n.to;
      return ret;
    });
    return node;
  },
};
export const PROPERTY_TYPE: IConfBinaryOp = {
  type: "Property",
  left: "key",
  right: "value",

  extra: (node: INode) => ({
    ...node,
    key: node.key?.type === EXPRESSION ? node.key.argument : node.key,
    kind: "init",
    method: false,
    shorthand: false,
    computed: node.key?.type === EXPRESSION,
  }),
  subRules: NOCOMMA_EXPR,
};
export const COMMA_TYPE: IConfMultipleRule = {
  type: SEQUENCE_EXP,
  prop: EXPRESSIONS,
  separators: ",",
};
export const GROUP_TYPE: IConfUnaryOp = { close: ")", subRules: EXPRESSION };
export const MEMBER_TYPE: IConfBinaryOp = {
  type: MEMBER_EXP,
  left: OBJECT,
  right: PROPERTY,
  extra: { computed: false },
  subRules: PROPERTY,
};
export const MEMBER_TYPE_COMP: IConfBinaryOp = {
  ...MEMBER_TYPE,
  close: "]",
  extra: { computed: true },
  subRules: EXPRESSION,
};
export const CALL_TYPE: IConfBinaryOp = {
  type: CALL_EXP,
  left: "callee",
  right: "arguments",
  separators: ",",
  close: ")",
  empty: true,
  subRules: NOCOMMA_EXPR,
};

export function opConf<T>(
  operators: string[] | string[][],
  config: T | T[]
): { [operator: string]: T } {
  const res: { [operator: string]: T } = {};
  if (!Array.isArray(config)) config = [config];
  if (!Array.isArray(operators[0])) operators = [<string[]>operators];

  for (let i = 0; i < config.length; i++) {
    const operator = operators[i];
    if (operator !== undefined) {
      for (let o = 0; o < operator.length; o++) {
        const k = operator[o];
        if (k !== undefined) {
          res[k] = config[i] as T;
        }
      }
    }
  }

  return res;
}
