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
import { escapeCssIdentifier } from "./themeVariableName.js";

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

const OPENERS = new Set<TokenType>([
  TokenType.OpenParen,
  TokenType.OpenSquare,
  TokenType.OpenCurly,
]);

const CLOSERS = new Set<TokenType>([
  TokenType.CloseParen,
  TokenType.CloseSquare,
  TokenType.CloseCurly,
]);

const SEPARATORS = new Set<TokenType>([
  TokenType.Whitespace,
  TokenType.Comment,
  TokenType.Comma,
  TokenType.EOF,
]);

const CSS_ESCAPE = /\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\n\r\f])?|([\s\S]))/g;

const unescapeCss = (text: string): string =>
  text.replace(CSS_ESCAPE, (_, hex: string | undefined, char: string) => {
    if (hex === undefined) {
      return char;
    }
    const code = parseInt(hex, 16);
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
      ? "�"
      : String.fromCodePoint(code);
  });

const TIME_UNITS = new Set(["s", "ms"]);

const isNameToken = (token: CSSToken): boolean =>
  token[0] === TokenType.Ident || token[0] === TokenType.String;

const isAnimationToken = (token: CSSToken): boolean =>
  isNameToken(token) ||
  token[0] === TokenType.Number ||
  (token[0] === TokenType.Dimension &&
    TIME_UNITS.has((token[4] as { unit: string }).unit.toLowerCase()));

const escapeWords = (css: string, keeps: (token: CSSToken) => boolean): string => {
  const edits: SourceEdit[] = [];
  const walked: boolean[] = [true];
  let word: CSSToken[] = [];
  const flush = () => {
    const first = word[0];
    const last = word[word.length - 1];
    if (first && last && !(word.length === 1 && keeps(first))) {
      edits.push({
        start: first[2],
        end: last[3] + 1,
        text: escapeCssIdentifier(unescapeCss(css.slice(first[2], last[3] + 1))),
      });
    }
    word = [];
  };
  for (const token of tokenize({ css })) {
    if (SEPARATORS.has(token[0])) {
      flush();
    } else if (token[0] === TokenType.Function) {
      flush();
      const name = (token[4] as { value: string }).value.toLowerCase();
      walked.push(walked[walked.length - 1]! && name === "var");
    } else if (OPENERS.has(token[0])) {
      flush();
      walked.push(false);
    } else if (CLOSERS.has(token[0])) {
      flush();
      if (walked.length > 1) {
        walked.pop();
      }
    } else if (walked[walked.length - 1]) {
      word.push(token);
    }
  }
  return applyEdits(css, edits);
};

export const escapeCssNames = (css: string): string =>
  escapeWords(css, isNameToken);

export const escapeCssAnimationNames = (css: string): string =>
  escapeWords(css, isAnimationToken);

export const applyEdits = (css: string, edits: SourceEdit[]): string => {
  let result = css;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
};
