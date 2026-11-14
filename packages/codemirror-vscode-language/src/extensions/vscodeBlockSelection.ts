import { ensureSyntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  type Extension,
  type SelectionRange,
} from "@codemirror/state";
import { type SyntaxNode, type Tree } from "@lezer/common";
import { type LanguageReader } from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";

import { VSCodeConfigDefinition } from "../types/VSCodeConfigDefinition";
import { configOf } from "../utils/languageAt";

export const DOUBLE_CLICK_BLOCK = "doubleClickBlock";

export type DoubleClickBlock = (
  state: EditorState,
  pos: number,
) => SelectionRange | null;

const PARSE_TIMEOUT_MS = 100;

const OTHER = 0;
const COMMENT = 1;
const STRING = 2;
const REGEX = 3;

type StandardTokenType =
  | typeof OTHER
  | typeof COMMENT
  | typeof STRING
  | typeof REGEX;

const STANDARD_TOKEN_TYPE = /\b(comment|string|regex|meta\.embedded)\b/;

const QUOTES = new Set(['"', "'", "`"]);

const RTL =
  /(?:[־׀׃׆א-״؈؋؍؛-ي٭-ٯٱ-ەۥۦۮۯۺ-ܐܒ-ܯݍ-ޥޱ-ߪߴߵߺ߾-ࠕࠚࠤࠨ࠰-ࡘ࡞-ࢎࢠ-ࣉ‏יִײַ-ﬨשׁ-ﴽﵐ-ﷇﷰ-﷼ﹰ-ﻼ]|\uD802[\uDC00-\uDD1B\uDD20-\uDE00\uDE10-\uDE35\uDE40-\uDEE4\uDEEB-\uDF35\uDF40-\uDFFF]|\uD803[\uDC00-\uDD23\uDE80-\uDEA9\uDEAD-\uDF45\uDF51-\uDF81\uDF86-\uDFF6]|\uD83A[\uDC00-\uDCCF\uDD00-\uDD43\uDD4B-\uDFFF]|\uD83B[\uDC00-\uDEBB])/;

interface Range {
  from: number;
  to: number;
}

interface BracketPair {
  open: Range;
  close: Range;
}

interface Bracket extends Range {
  key: string;
  opening: boolean;
}

const standardTokenTypeOf = (
  reader: LanguageReader,
  node: SyntaxNode | null,
): StandardTokenType => {
  for (; node; node = node.parent) {
    const scopes = reader.scope(node.type)?.split(/\s+/) ?? [];
    for (let i = scopes.length - 1; i >= 0; i--) {
      const match = STANDARD_TOKEN_TYPE.exec(scopes[i]!);
      if (!match) continue;
      switch (match[1]) {
        case "comment":
          return COMMENT;
        case "string":
          return STRING;
        case "regex":
          return REGEX;
        default:
          return OTHER;
      }
    }
  }
  return OTHER;
};

const sameToken = (a: SyntaxNode, b: SyntaxNode) =>
  a.type === b.type && a.from === b.from && a.to === b.to;

interface Token extends Range {
  type: StandardTokenType;
}

const lineTokens = (
  reader: LanguageReader,
  tree: Tree,
  from: number,
  to: number,
): Token[] => {
  const tokens: Token[] = [];
  let previous: SyntaxNode | null = null;
  for (let pos = from; pos < to; pos++) {
    const node = tree.resolveInner(pos, 1);
    const last = tokens[tokens.length - 1];
    if (last && previous && sameToken(previous, node)) {
      last.to = pos + 1;
    } else {
      tokens.push({ from: pos, to: pos + 1, type: standardTokenTypeOf(reader, node) });
    }
    previous = node;
  }
  return tokens;
};

const bracketsOf = (
  reader: LanguageReader,
  state: EditorState,
  tree: Tree,
  documentLanguage: string,
  configs: Readonly<Record<string, VSCodeConfigDefinition>>,
): Bracket[] => {
  const pairsByLanguage = new Map<string, string[][]>();
  const pairsOf = (language: string) => {
    let pairs = pairsByLanguage.get(language);
    if (!pairs) {
      pairs = (configOf(configs, language, documentLanguage)?.brackets ?? []).filter(
        (pair) => pair.length === 2 && pair[0] && pair[1],
      );
      pairsByLanguage.set(language, pairs);
    }
    return pairs;
  };
  const firstChars = new Set(
    Object.values(configs).flatMap(({ brackets }) =>
      (brackets ?? []).flat().map((text) => text.charAt(0)),
    ),
  );
  const text = state.doc.toString();
  const brackets: Bracket[] = [];
  for (let pos = 0; pos < text.length; pos++) {
    if (!firstChars.has(text.charAt(pos))) continue;
    const node = tree.resolveInner(pos, 1);
    if (standardTokenTypeOf(reader, node) !== OTHER) continue;
    const language = reader.character(tree, pos, documentLanguage);
    let found: Bracket | null = null;
    for (const [open, close] of pairsOf(language)) {
      for (const [bracket, opening] of [
        [open!, true],
        [close!, false],
      ] as const) {
        if (
          text.startsWith(bracket, pos) &&
          (!found || bracket.length > found.to - found.from)
        ) {
          found = {
            from: pos,
            to: pos + bracket.length,
            key: `${language}:::${open}`,
            opening,
          };
        }
      }
    }
    if (found) {
      brackets.push(found);
      pos = found.to - 1;
    }
  }
  return brackets;
};

const pairBrackets = (brackets: readonly Bracket[]): BracketPair[] => {
  const pairs: BracketPair[] = [];
  const open: Bracket[] = [];
  for (const bracket of brackets) {
    if (bracket.opening) {
      open.push(bracket);
      continue;
    }
    for (let i = open.length - 1; i >= 0; i--) {
      if (open[i]!.key === bracket.key) {
        pairs.push({ open: open[i]!, close: bracket });
        open.length = i;
        break;
      }
    }
  }
  return pairs;
};

const contains = ({ from, to }: Range, pos: number) => from <= pos && pos <= to;

const matchBracket = (
  pairs: readonly BracketPair[],
  pos: number,
): BracketPair | null => {
  let best: BracketPair | null = null;
  let bestRange: Range | null = null;
  for (const pair of pairs) {
    const range = contains(pair.open, pos)
      ? pair.open
      : contains(pair.close, pos)
        ? pair.close
        : null;
    if (!range) continue;
    if (
      !bestRange ||
      range.from > bestRange.from ||
      (range.from === bestRange.from && range.to >= bestRange.to)
    ) {
      best = pair;
      bestRange = range;
    }
  }
  return best;
};

const bracketContent = (
  pairs: readonly BracketPair[],
  state: EditorState,
  pos: number,
): SelectionRange | null => {
  const line = state.doc.lineAt(pos);
  if (pos > line.from) {
    const pair = matchBracket(pairs, pos - 1);
    if (pair && pair.open.to === pos) {
      return EditorSelection.range(pair.open.to, pair.close.from);
    }
  }
  const pair = matchBracket(pairs, pos);
  if (pair && pair.close.from === pos) {
    return EditorSelection.range(pair.open.to, pair.close.from);
  }
  return null;
};

const stringContent = (
  reader: LanguageReader,
  tree: Tree,
  state: EditorState,
  pos: number,
): SelectionRange | null => {
  const line = state.doc.lineAt(pos);
  const tokens = lineTokens(reader, tree, line.from, line.to);
  if (tokens.length === 0) return null;
  let startIndex = tokens.findIndex((token) => pos < token.to);
  if (startIndex < 0) startIndex = tokens.length - 1;
  let endIndex = startIndex;
  while (startIndex > 0 && tokens[startIndex - 1]!.type === STRING) {
    startIndex--;
  }
  while (endIndex + 1 < tokens.length && tokens[endIndex + 1]!.type === STRING) {
    endIndex++;
  }
  const start = tokens[startIndex]!.from;
  const end = tokens[endIndex]!.to;
  if (pos !== start + 1 && pos !== end - 1) return null;
  const quote = state.sliceDoc(start, start + 1);
  if (!QUOTES.has(quote) || state.sliceDoc(end - 1, end) !== quote) {
    return null;
  }
  if (RTL.test(state.sliceDoc(start + 1, end - 1))) return null;
  return EditorSelection.range(start + 1, end - 1);
};

export const vscodeBlockSelection = (
  reader: LanguageReader,
  documentLanguage: string,
  configs: Readonly<Record<string, VSCodeConfigDefinition>>,
): Extension => {
  const doubleClickBlock: DoubleClickBlock = (state, pos) => {
    const tree = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT_MS);
    if (!tree) return null;
    const pairs = pairBrackets(
      bracketsOf(reader, state, tree, documentLanguage, configs),
    );
    return (
      bracketContent(pairs, state, pos) ??
      stringContent(reader, tree, state, pos)
    );
  };
  return EditorState.languageData.of(() => [
    { [DOUBLE_CLICK_BLOCK]: doubleClickBlock },
  ]);
};
