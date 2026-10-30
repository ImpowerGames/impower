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

export class RegExpMatcher implements Matcher {
  declare regexp: RegExp;

  declare private indicesRegexp: RegExp | undefined;

  declare private hasCapturingGroups: boolean;

  declare readonly groupParents: number[];

  declare private flatGroups: boolean;

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
      this.indicesRegexp = undefined;
      try {
        this.regexp = new RegExp(escapedPattern, this._flags);
      } catch {
        this.regexp = undefined!;
      }
    }
  }

  declare protected _source: string;

  constructor(pattern: string, flags = "muy") {
    this._pattern = pattern;
    this._source = pattern;
    this._flags = flags;
    try {
      const regexp = new RegExp(pattern, flags);
      this.regexp = regexp;
    } catch {}
    this.hasCapturingGroups = this.regexp
      ? hasCapturingGroups(this.regexp)
      : false;
    this.groupParents = this.hasCapturingGroups
      ? analyzeCaptureGroups(pattern)
      : [0];
    this.flatGroups = this.groupParents.every((parent) => parent === 0);
  }

  test(str: string, pos: number) {
    if (!this.regexp) {
      throw new Error(`Invalid RegExp: ${this._pattern}`);
    }
    this.regexp.lastIndex = pos;
    return this.regexp.test(str);
  }

  private exec(str: string, pos: number) {
    if (!this.regexp) {
      throw new Error(`Invalid RegExp: ${this._pattern}`);
    }
    this.regexp.lastIndex = pos;
    return this.regexp.exec(str);
  }

  private execIndices(str: string, pos: number) {
    this.indicesRegexp ??= this.regexp.hasIndices
      ? this.regexp
      : new RegExp(this.regexp.source, this._flags + "d");
    this.indicesRegexp.lastIndex = pos;
    return this.indicesRegexp.exec(str);
  }

  match(str: string, pos: number): RegExpMatchResult | null {
    if (!this.hasCapturingGroups) {
      if (this.test(str, pos)) {
        const length = this.regexp!.lastIndex - pos;
        const total = str.slice(pos, pos + length);
        return [total];
      }
      return null;
    }

    if (this.test(str, pos)) {
      if (this.flatGroups) {
        const match = this.exec(str, pos);
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
      const match = this.execIndices(str, pos);
      if (match) {
        const result: RegExpMatchResult = match.slice();
        result.indices = match.indices!.slice();
        return result;
      }
    }

    return null;
  }
}
