import {
  isFunctionNode,
  isSimpleBlockNode,
  isTokenNode,
  isWhiteSpaceOrCommentNode,
  parseListOfComponentValues,
  type ComponentValue,
  type FunctionNode,
  type SimpleBlockNode,
  type TokenNode,
} from "@csstools/css-parser-algorithms";
import { tokenize, TokenType, type CSSToken } from "@csstools/css-tokenizer";

export type { ComponentValue, FunctionNode, SimpleBlockNode, TokenNode };
export { isFunctionNode, isSimpleBlockNode, isTokenNode, TokenType };

export interface SourceEdit {
  start: number;
  end: number;
  text: string;
}

export const parseComponentValues = (css: string): ComponentValue[] =>
  parseListOfComponentValues(tokenize({ css }));

export const tokenOf = (node: ComponentValue): CSSToken | undefined =>
  isTokenNode(node) ? node.value : undefined;

export const isTokenType = (
  node: ComponentValue | undefined,
  type: TokenType,
): node is TokenNode => !!node && isTokenNode(node) && node.value[0] === type;

export const identName = (
  node: ComponentValue | undefined,
): string | undefined =>
  isTokenType(node, TokenType.Ident)
    ? (node.value[4] as { value: string }).value
    : undefined;

export const decodeIdentifier = (text: string): string | undefined => {
  const values = significant(parseComponentValues(text));
  return values.length === 1 ? identName(values[0]) : undefined;
};

export const significant = (nodes: ComponentValue[]): ComponentValue[] =>
  nodes.filter((node) => !isWhiteSpaceOrCommentNode(node));

export const splitAt = (
  nodes: ComponentValue[],
  type: TokenType,
): ComponentValue[][] => {
  const parts: ComponentValue[][] = [[]];
  for (const node of nodes) {
    if (isTokenType(node, type)) {
      parts.push([]);
    } else {
      parts[parts.length - 1]!.push(node);
    }
  }
  return parts;
};

export const isCurlyBlock = (node: ComponentValue): node is SimpleBlockNode =>
  isSimpleBlockNode(node) && node.startToken[0] === TokenType.OpenCurly;

export const applyEdits = (css: string, edits: SourceEdit[]): string => {
  let result = css;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
};
