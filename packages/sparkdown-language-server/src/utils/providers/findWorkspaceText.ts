import type {
  FindTextMatch,
  FindTextParams,
  FindTextResult,
  FindTextScript,
} from "@impower/spark-editor-protocol/src/protocols/workspace/FindTextMessage";

const LINE_BREAK = /\r\n|\r|\n/;

const WORD_CHAR = "[\\p{L}\\p{N}_]";

const escapeRegExp = (text: string) =>
  text.replace(/[\\^$.*+?()[\]{}|/-]/g, (c) => `\\${c}`);

export const compileFindPattern = (
  params: FindTextParams,
): RegExp | { error: string } | null => {
  const { query, matchCase, wholeWord, regex } = params;
  if (!query) {
    return null;
  }
  const body = regex ? query : escapeRegExp(query);
  const source = wholeWord
    ? `(?<!${WORD_CHAR})(?:${body})(?!${WORD_CHAR})`
    : body;
  try {
    return new RegExp(source, `gmu${matchCase ? "" : "i"}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
};

const expandReplacement = (replacement: string, match: RegExpExecArray) =>
  replacement.replace(/\$([$&]|\d+)/g, (whole, token: string) => {
    if (token === "&") {
      return match[0];
    }
    if (token === "$") {
      return "$";
    }
    for (let length = token.length; length > 0; length--) {
      const group = Number(token.slice(0, length));
      if (group > 0 && group < match.length) {
        return (match[group] ?? "") + token.slice(length);
      }
    }
    return whole;
  });

export const findWorkspaceText = (
  documents: Iterable<{ uri: string; text: string }>,
  params: FindTextParams,
): FindTextResult => {
  const pattern = compileFindPattern(params);
  if (pattern && !(pattern instanceof RegExp)) {
    return { error: pattern.error };
  }
  const scripts: FindTextScript[] = [];
  let total = 0;
  if (!pattern) {
    return { total, scripts };
  }
  const replacement = params.replacement;
  for (const { uri, text } of documents) {
    const matches: FindTextMatch[] = [];
    const lines = text.split(LINE_BREAK);
    for (let line = 0; line < lines.length; line++) {
      const lineText = lines[line]!;
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(lineText))) {
        if (!match[0]) {
          const codePoint = lineText.codePointAt(pattern.lastIndex) ?? 0;
          pattern.lastIndex += codePoint > 0xffff ? 2 : 1;
          continue;
        }
        const start = match.index;
        const found: FindTextMatch = {
          range: {
            start: { line, character: start },
            end: { line, character: start + match[0].length },
          },
          lineText,
        };
        if (replacement != null) {
          found.replacement = params.regex
            ? expandReplacement(replacement, match)
            : replacement;
        }
        matches.push(found);
      }
    }
    if (matches.length) {
      scripts.push({ uri, matches });
      total += matches.length;
    }
  }
  return { total, scripts };
};
