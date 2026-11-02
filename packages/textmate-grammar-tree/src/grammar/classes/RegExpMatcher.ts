/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Matcher } from "../types/Matcher";
import { analyzeCaptureGroups } from "../utils/analyzeCaptureGroups";
import { escapeRegExpPattern } from "../utils/escapeRegExpPattern";
import { hasCapturingGroups } from "../utils/hasCapturingGroups";

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
  for (let i = 0; i < pattern.length; i++) {
    if (pattern.charCodeAt(i) !== 92) {
      continue;
    }
    if (pattern[i + 1] === "G") {
      resolved += pattern.slice(from, i) + replacement;
      from = i + 2;
    }
    i++;
  }
  return from === 0 ? null : resolved + pattern.slice(from);
};

const codePointsBefore = (str: string, pos: number) => {
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

const compile = (pattern: string, flags: string) => {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return undefined!;
  }
};

export class RegExpMatcher implements Matcher {
  declare regexp: RegExp;

  declare private leadingAnchoredRegexp: RegExp | undefined;

  private anchoredByPosition = new Map<number, RegExp>();

  private indicesRegexps = new WeakMap<RegExp, RegExp>();

  declare private hasCapturingGroups: boolean;

  declare readonly groupParents: number[];

  declare private flatGroups: boolean;

  declare readonly hasAnchor: boolean;

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
    if (escapedPattern !== this._source) {
      this._source = escapedPattern;
      this.compileSource(escapedPattern);
    }
  }

  declare protected _source: string;

  constructor(pattern: string, flags = "muy") {
    this._pattern = pattern;
    this._source = pattern;
    this._flags = flags;
    this.hasAnchor = resolveAnchor(pattern, ANCHOR_REFUSED) != null;
    this.compileSource(pattern);
    this.hasCapturingGroups = this.regexp
      ? hasCapturingGroups(this.regexp)
      : false;
    this.groupParents = this.hasCapturingGroups
      ? analyzeCaptureGroups(pattern)
      : [0];
    this.flatGroups = this.groupParents.every((parent) => parent === 0);
  }

  protected compileSource(source: string) {
    this.anchoredByPosition.clear();
    this.leadingAnchoredRegexp = undefined;
    if (!this.hasAnchor) {
      this.regexp = compile(source, this._flags);
      return;
    }
    this.regexp = compile(
      resolveAnchor(source, ANCHOR_REFUSED) ?? source,
      this._flags,
    );
    const rest = source.slice(ANCHOR.length);
    if (
      source.startsWith(ANCHOR) &&
      resolveAnchor(rest, ANCHOR_REFUSED) == null
    ) {
      this.leadingAnchoredRegexp = compile(
        LEADING_ANCHOR_ALLOWED + rest,
        this._flags,
      );
    }
  }

  private select(str: string, pos: number, anchored: boolean) {
    if (!anchored || !this.hasAnchor) {
      return this.regexp;
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
      );
      this.anchoredByPosition.set(before, regexp);
    }
    return regexp;
  }

  test(str: string, pos: number, anchored = false) {
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
