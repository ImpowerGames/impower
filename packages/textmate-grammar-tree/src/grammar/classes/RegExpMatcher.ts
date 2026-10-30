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

const ANCHOR_ALLOWED = "(?:)";

const ANCHOR_REFUSED = "(?!)";

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

const compile = (pattern: string, flags: string) => {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return undefined!;
  }
};

export class RegExpMatcher implements Matcher {
  declare regexp: RegExp;

  declare private anchoredRegexp: RegExp;

  declare private indicesRegexp: RegExp | undefined;

  declare private anchoredIndicesRegexp: RegExp | undefined;

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
    this.indicesRegexp = undefined;
    this.anchoredIndicesRegexp = undefined;
    if (!this.hasAnchor) {
      this.regexp = compile(source, this._flags);
      this.anchoredRegexp = this.regexp;
      return;
    }
    this.regexp = compile(
      resolveAnchor(source, ANCHOR_REFUSED) ?? source,
      this._flags,
    );
    this.anchoredRegexp = compile(
      resolveAnchor(source, ANCHOR_ALLOWED) ?? source,
      this._flags,
    );
  }

  test(str: string, pos: number, anchored = false) {
    const regexp = anchored ? this.anchoredRegexp : this.regexp;
    if (!regexp) {
      throw new Error(`Invalid RegExp: ${this._pattern}`);
    }
    regexp.lastIndex = pos;
    return regexp.test(str);
  }

  private exec(str: string, pos: number, anchored: boolean) {
    const regexp = anchored ? this.anchoredRegexp : this.regexp;
    regexp.lastIndex = pos;
    return regexp.exec(str);
  }

  private execIndices(str: string, pos: number, anchored: boolean) {
    let regexp: RegExp;
    if (anchored) {
      regexp = this.anchoredIndicesRegexp ??= this.withIndices(
        this.anchoredRegexp,
      );
    } else {
      regexp = this.indicesRegexp ??= this.withIndices(this.regexp);
    }
    regexp.lastIndex = pos;
    return regexp.exec(str);
  }

  private withIndices(regexp: RegExp) {
    return regexp.hasIndices
      ? regexp
      : new RegExp(regexp.source, this._flags + "d");
  }

  match(
    str: string,
    pos: number,
    anchored = false,
  ): RegExpMatchResult | null {
    if (!this.hasCapturingGroups) {
      if (this.test(str, pos, anchored)) {
        const regexp = anchored ? this.anchoredRegexp : this.regexp;
        const length = regexp.lastIndex - pos;
        const total = str.slice(pos, pos + length);
        return [total];
      }
      return null;
    }

    if (this.test(str, pos, anchored)) {
      if (this.flatGroups) {
        const match = this.exec(str, pos, anchored);
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
      const match = this.execIndices(str, pos, anchored);
      if (match) {
        const result: RegExpMatchResult = match.slice();
        result.indices = match.indices!.slice();
        return result;
      }
    }

    return null;
  }
}
