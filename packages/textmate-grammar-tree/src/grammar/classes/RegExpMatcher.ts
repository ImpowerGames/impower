/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Matcher } from "../types/Matcher";
import { analyzeCaptureGroups } from "../utils/analyzeCaptureGroups";
import { escapeRegExpPattern } from "../utils/escapeRegExpPattern";
import {
  ONIGURUMA_CLASS_WORD_RANGES,
  ONIGURUMA_DIGIT_RANGES,
  ONIGURUMA_SPACE_RANGES,
  ONIGURUMA_WORD_RANGES,
} from "../utils/onigurumaRanges";

export type RegExpMatchResult = (string | undefined)[] & {
  indices?: ([number, number] | undefined)[];
};

const BACK_REFERENCE = /\\(\d+)/g;

const ANCHOR = "\\G";

const ANCHOR_REFUSED = "(?!)";

const LEADING_ANCHOR_ALLOWED = "(?:)";

const anchorAt = (before: number) =>
  `(?<![\\s\\S]{${before + 1}})(?<=[\\s\\S]{${before}})`;

const resolveAnchor = (pattern: string, replacement: string) => {
  let resolved = "";
  let from = 0;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charCodeAt(i);
    if (c === 91) {
      inClass = true;
    } else if (c === 93) {
      inClass = false;
    }
    if (c !== 92) {
      continue;
    }
    if (!inClass && pattern[i + 1] === "G") {
      resolved += pattern.slice(from, i) + replacement;
      from = i + 2;
    }
    i++;
  }
  return from === 0 ? null : resolved + pattern.slice(from);
};

const LINE_START = "(?:(?<![\\s\\S])|(?<=\\n)(?=[\\s\\S]))";

const resolveLineStart = (pattern: string) => {
  let resolved = "";
  let from = 0;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charCodeAt(i);
    if (c === 92) {
      i++;
    } else if (c === 91) {
      inClass = true;
    } else if (c === 93) {
      inClass = false;
    } else if (c === 94 && !inClass) {
      resolved += pattern.slice(from, i) + LINE_START;
      from = i + 1;
    }
  }
  return from === 0 ? null : resolved + pattern.slice(from);
};

const isExhaustedLineEnd = (str: string, pos: number) => {
  if (pos === 0 || pos !== str.length) {
    return false;
  }
  const c = str.charCodeAt(pos - 1);
  return c === 10 || c === 13;
};

const codePointsBefore =(str: string, pos: number) => {
  let count = pos;
  for (let i = 1; i < pos; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff) {
      const p = str.charCodeAt(i - 1);
      if (p >= 0xd800 && p <= 0xdbff) {
        count--;
      }
    }
  }
  return count;
};

interface UnicodeEscapes {
  outside: Record<string, string>;
  afterWord: Record<string, string>;
  beforeWord: Record<string, string>;
  inside: Record<string, string>;
}

type CodeRange = [number, number];

const BMP_END = 0xffff;

const MAX_CODE_POINT = 0x10ffff;

const parseRanges = (ranges: string): CodeRange[] =>
  ranges.split(",").map((range) => {
    const [from, to = from] = range.split("-");
    return [parseInt(from!, 16), parseInt(to!, 16)];
  });

const WORD = parseRanges(ONIGURUMA_WORD_RANGES);

const CLASS_WORD = parseRanges(ONIGURUMA_CLASS_WORD_RANGES);

const DIGIT = parseRanges(ONIGURUMA_DIGIT_RANGES);

const SPACE = parseRanges(ONIGURUMA_SPACE_RANGES);

const bmpPart = (ranges: CodeRange[]): CodeRange[] =>
  ranges
    .filter(([from]) => from <= BMP_END)
    .map(([from, to]) => [from, Math.min(to, BMP_END)]);

const astralPart = (ranges: CodeRange[]): CodeRange[] =>
  ranges
    .filter(([, to]) => to > BMP_END)
    .map(([from, to]) => [Math.max(from, BMP_END + 1), to]);

const complement = (ranges: CodeRange[]): CodeRange[] => {
  const result: CodeRange[] = [];
  let next = 0;
  for (const [from, to] of ranges) {
    if (from > next) {
      result.push([next, from - 1]);
    }
    next = to + 1;
  }
  if (next <= MAX_CODE_POINT) {
    result.push([next, MAX_CODE_POINT]);
  }
  return result;
};

const codePoint = (c: number) => "\\u{" + c.toString(16) + "}";

const classBody = (ranges: CodeRange[]) =>
  ranges
    .map(([from, to]) =>
      from === to ? codePoint(from) : `${codePoint(from)}-${codePoint(to)}`,
    )
    .join("");

const unicodeEscapes = (
  word: CodeRange[],
  classWord: CodeRange[],
  digit: CodeRange[],
): UnicodeEscapes => {
  const isWord = `[${classBody(word)}]`;
  return {
    outside: {
      w: isWord,
      W: `[^${classBody(word)}]`,
      d: `[${classBody(digit)}]`,
      D: `[^${classBody(digit)}]`,
      s: `[${classBody(SPACE)}]`,
      S: `[^${classBody(SPACE)}]`,
      b: `(?:(?<=${isWord})(?!${isWord})|(?<!${isWord})(?=${isWord}))`,
      B: `(?:(?<=${isWord})(?=${isWord})|(?<!${isWord})(?!${isWord}))`,
    },
    afterWord: { b: `(?!${isWord})`, B: `(?=${isWord})` },
    beforeWord: { b: `(?<!${isWord})`, B: `(?<=${isWord})` },
    inside: {
      w: classBody(classWord),
      W: classBody(complement(classWord)),
      d: classBody(digit),
      D: classBody(complement(digit)),
      s: classBody(SPACE),
      S: classBody(complement(SPACE)),
    },
  };
};

const REWRITE_MARKERS: UnicodeEscapes = {
  outside: { w: "", W: "", d: "", D: "", s: "", S: "", b: "", B: "" },
  afterWord: { b: "", B: "" },
  beforeWord: { b: "", B: "" },
  inside: { w: "", W: "", d: "", D: "", s: "", S: "" },
};

let bmpEscapesCache: UnicodeEscapes | undefined;

const bmpEscapes = () =>
  (bmpEscapesCache ??= unicodeEscapes(
    bmpPart(WORD),
    bmpPart(CLASS_WORD),
    bmpPart(DIGIT),
  ));

let fullEscapesCache: UnicodeEscapes | undefined;

const fullEscapes = () =>
  (fullEscapesCache ??= unicodeEscapes(WORD, CLASS_WORD, DIGIT));

const isAsciiWord = (c: number) =>
  (c >= 48 && c <= 57) ||
  (c >= 65 && c <= 90) ||
  (c >= 97 && c <= 122) ||
  c === 95;

const literalWordBefore = (pattern: string, at: number) => {
  let i = at - 1;
  if (i < 0 || !isAsciiWord(pattern.charCodeAt(i))) {
    return false;
  }
  while (i >= 0 && isAsciiWord(pattern.charCodeAt(i))) {
    i--;
  }
  if (i < 0 || pattern.charCodeAt(i) !== 92) {
    return true;
  }
  return i + 2 < at && !/[xupPkc0-9]/.test(pattern[i + 1]!);
};

const literalWordAfter = (pattern: string, at: number) =>
  isAsciiWord(pattern.charCodeAt(at)) && !/[?*{]/.test(pattern[at + 1] ?? "");

const WORD_ALTERNATIVES = /^\w+(?:\|\w+)*$/;

const isAlternativeChar = (c: number) => isAsciiWord(c) || c === 124;

const wordGroupBefore = (pattern: string, at: number) => {
  if (pattern[at - 1] !== ")") {
    return false;
  }
  let i = at - 2;
  while (i >= 0 && isAlternativeChar(pattern.charCodeAt(i))) {
    i--;
  }
  if (!WORD_ALTERNATIVES.test(pattern.slice(i + 1, at - 1))) {
    return false;
  }
  const open = pattern.startsWith("(?:", i - 2) ? i - 2 : i;
  return pattern[open] === "(" && pattern[open - 1] !== "\\";
};

const wordGroupAfter = (pattern: string, at: number) => {
  const start = pattern.startsWith("(?:", at)
    ? at + 3
    : pattern[at] === "(" && pattern[at + 1] !== "?"
      ? at + 1
      : -1;
  if (start < 0) {
    return false;
  }
  let i = start;
  while (i < pattern.length && isAlternativeChar(pattern.charCodeAt(i))) {
    i++;
  }
  return (
    pattern[i] === ")" &&
    WORD_ALTERNATIVES.test(pattern.slice(start, i)) &&
    !/[?*{]/.test(pattern[i + 1] ?? "")
  );
};

const boundaryEscape = (
  pattern: string,
  at: number,
  escapes: UnicodeEscapes,
) => {
  const kind = pattern[at + 1]!;
  if (literalWordBefore(pattern, at) || wordGroupBefore(pattern, at)) {
    return escapes.afterWord[kind];
  }
  if (literalWordAfter(pattern, at + 2) || wordGroupAfter(pattern, at + 2)) {
    return escapes.beforeWord[kind];
  }
  return escapes.outside[kind];
};

const resolveUnicodeEscapes = (
  pattern: string,
  escapes: UnicodeEscapes,
  nestedClasses: boolean,
) => {
  let resolved = "";
  let from = 0;
  let classDepth = 0;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charCodeAt(i);
    if (c === 91 && (classDepth === 0 || nestedClasses)) {
      classDepth++;
    } else if (c === 93 && classDepth > 0) {
      classDepth--;
    }
    if (c !== 92) {
      continue;
    }
    const kind = pattern[i + 1]!;
    const replacement =
      classDepth > 0
        ? escapes.inside[kind]
        : kind === "b" || kind === "B"
          ? boundaryEscape(pattern, i, escapes)
          : escapes.outside[kind];
    if (replacement !== undefined) {
      resolved += pattern.slice(from, i) + replacement;
      from = i + 2;
    }
    i++;
  }
  return from === 0 ? pattern : resolved + pattern.slice(from);
};

const ASCII_TEXT = 0;

const BMP_TEXT = 1;

const ASTRAL_WORD_TEXT = 2;

const ASTRAL_WORD = new RegExp(`[${classBody(astralPart(WORD))}]`, "u");

let checkedText: string | undefined;

let checkedTextRange = ASCII_TEXT;

const textRange = (str: string) => {
  if (str !== checkedText) {
    checkedText = str;
    checkedTextRange = !/[^\x00-\x7f]/.test(str)
      ? ASCII_TEXT
      : /[\ud800-\udfff]/.test(str) && ASTRAL_WORD.test(str)
        ? ASTRAL_WORD_TEXT
        : BMP_TEXT;
  }
  return checkedTextRange;
};

const compile = (
  pattern: string,
  flags: string,
  escapes: UnicodeEscapes | undefined,
) => {
  try {
    return new RegExp(
      escapes
        ? resolveUnicodeEscapes(pattern, escapes, flags.includes("v"))
        : pattern,
      flags,
    );
  } catch {
    return undefined!;
  }
};

export class RegExpMatcher implements Matcher {
  declare private compiled: RegExp;

  private compiledSource: string | undefined;

  get regexp(): RegExp {
    if (this.compiledSource !== this._source) {
      this.compileSource(this._source);
    }
    return this.compiled;
  }

  declare private leadingAnchoredRegexp: RegExp | undefined;

  private anchoredByPosition = new Map<number, RegExp>();

  private indicesRegexps = new WeakMap<RegExp, RegExp>();

  declare private lineEndMatcher: RegExpMatcher;

  private lineEndSource: string | undefined;

  private groups:
    | { capturing: boolean; parents: number[]; flat: boolean }
    | undefined;

  private get hasCapturingGroups(): boolean {
    return this.analyzeGroups().capturing;
  }

  get groupParents(): number[] {
    return this.analyzeGroups().parents;
  }

  private get flatGroups(): boolean {
    return this.analyzeGroups().flat;
  }

  private analyzeGroups() {
    if (!this.groups) {
      const parents = analyzeCaptureGroups(this._pattern);
      this.groups = {
        capturing: parents.length > 1,
        parents,
        flat: parents.every((parent) => parent === 0),
      };
    }
    return this.groups;
  }

  private anchored: boolean | undefined;

  get hasAnchor(): boolean {
    return (this.anchored ??=
      resolveAnchor(this._pattern, ANCHOR_REFUSED) != null);
  }

  declare protected _pattern: string;

  declare protected _flags: string;

  protected _backReferences: string[] = [];

  get backReferences() {
    return this._backReferences;
  }

  set backReferences(value) {
    this._backReferences = value;
    const escapedPattern = this._pattern.replace(BACK_REFERENCE, (_, n) =>
      escapeRegExpPattern(value[parseInt(n, 10)] ?? ""),
    );
    this._source = escapedPattern;
  }

  declare protected _source: string;

  declare private readonly escapes: UnicodeEscapes | undefined;

  private unicodeText: boolean | undefined;

  private get readsUnicodeText(): boolean {
    return (this.unicodeText ??=
      !this.escapes &&
      /[uv]/.test(this._flags) &&
      resolveUnicodeEscapes(
        this._pattern,
        REWRITE_MARKERS,
        this._flags.includes("v"),
      ) !== this._pattern);
  }

  declare private bmpMatcher: RegExpMatcher | undefined;

  declare private astralMatcher: RegExpMatcher | undefined;

  constructor(pattern: string, flags = "muy", escapes?: UnicodeEscapes) {
    this._pattern = pattern;
    this._source = pattern;
    this._flags = flags;
    this.escapes = escapes;
  }

  protected compileSource(source: string) {
    this.compiledSource = source;
    this.anchoredByPosition.clear();
    this.leadingAnchoredRegexp = undefined;
    if (!this.hasAnchor) {
      this.compiled = compile(source, this._flags, this.escapes);
      return;
    }
    this.compiled = compile(
      resolveAnchor(source, ANCHOR_REFUSED) ?? source,
      this._flags,
      this.escapes,
    );
    const rest = source.slice(ANCHOR.length);
    if (
      source.startsWith(ANCHOR) &&
      resolveAnchor(rest, ANCHOR_REFUSED) == null
    ) {
      this.leadingAnchoredRegexp = compile(
        LEADING_ANCHOR_ALLOWED + rest,
        this._flags,
        this.escapes,
      );
    }
  }

  private delegate(str: string, pos: number): RegExpMatcher {
    if (isExhaustedLineEnd(str, pos)) {
      const lineEnd = this.atLineEnd();
      if (lineEnd !== this) {
        return lineEnd;
      }
    }
    const range = this.readsUnicodeText ? textRange(str) : ASCII_TEXT;
    if (range === ASCII_TEXT) {
      return this;
    }
    const matcher =
      range === BMP_TEXT
        ? (this.bmpMatcher ??= new RegExpMatcher(
            this._pattern,
            this._flags,
            bmpEscapes(),
          ))
        : (this.astralMatcher ??= new RegExpMatcher(
            this._pattern,
            this._flags,
            fullEscapes(),
          ));
    if (matcher._source !== this._source) {
      matcher.backReferences = this._backReferences;
    }
    return matcher;
  }

  private select(str: string, pos: number, anchored: boolean) {
    const unanchored = this.regexp;
    if (!anchored || !this.hasAnchor) {
      return unanchored;
    }
    if (this.leadingAnchoredRegexp) {
      return this.leadingAnchoredRegexp;
    }
    const before = /[uv]/.test(this._flags)
      ? codePointsBefore(str, pos)
      : pos;
    let regexp = this.anchoredByPosition.get(before);
    if (!regexp) {
      regexp = compile(
        resolveAnchor(this._source, anchorAt(before)) ?? this._source,
        this._flags,
        this.escapes,
      );
      this.anchoredByPosition.set(before, regexp);
    }
    return regexp;
  }

  private atLineEnd(): RegExpMatcher {
    if (this.lineEndSource !== this._source) {
      this.lineEndSource = this._source;
      const pattern = resolveLineStart(this._source);
      this.lineEndMatcher =
        pattern == null
          ? this
          : new RegExpMatcher(pattern, this._flags, this.escapes);
    }
    return this.lineEndMatcher;
  }

  test(str: string, pos: number, anchored = false): boolean {
    const matcher = this.delegate(str, pos);
    if (matcher !== this) {
      return matcher.test(str, pos, anchored);
    }
    return this.testWith(this.select(str, pos, anchored), str, pos);
  }

  private testWith(regexp: RegExp, str: string, pos: number) {
    if (!regexp) {
      throw new Error(`Invalid RegExp: ${this._pattern}`);
    }
    regexp.lastIndex = pos;
    return regexp.test(str);
  }

  private exec(regexp: RegExp, str: string, pos: number) {
    regexp.lastIndex = pos;
    return regexp.exec(str);
  }

  private execIndices(regexp: RegExp, str: string, pos: number) {
    let indicesRegexp = this.indicesRegexps.get(regexp);
    if (!indicesRegexp) {
      indicesRegexp = regexp.hasIndices
        ? regexp
        : new RegExp(regexp.source, this._flags + "d");
      this.indicesRegexps.set(regexp, indicesRegexp);
    }
    indicesRegexp.lastIndex = pos;
    return indicesRegexp.exec(str);
  }

  match(
    str: string,
    pos: number,
    anchored = false,
  ): RegExpMatchResult | null {
    const matcher = this.delegate(str, pos);
    if (matcher !== this) {
      return matcher.match(str, pos, anchored);
    }
    const regexp = this.select(str, pos, anchored);
    if (!this.hasCapturingGroups) {
      if (this.testWith(regexp, str, pos)) {
        const length = regexp.lastIndex - pos;
        const total = str.slice(pos, pos + length);
        return [total];
      }
      return null;
    }

    if (this.testWith(regexp, str, pos)) {
      if (this.flatGroups) {
        const match = this.exec(regexp, str, pos);
        if (match) {
          let capturedLength = 0;
          for (let i = 1; i < match.length; i++) {
            capturedLength += match[i]?.length ?? 0;
          }
          if (capturedLength === match[0].length) {
            return match.slice();
          }
        }
      }
      const match = this.execIndices(regexp, str, pos);
      if (match) {
        const result: RegExpMatchResult = match.slice();
        result.indices = match.indices!.slice();
        return result;
      }
    }

    return null;
  }
}
