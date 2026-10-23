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

/**
 * The groups of a match, with each group's `[start, end)` in the matched
 * string when the groups do not simply follow one another through the match.
 */
export type RegExpMatchResult = (string | undefined)[] & {
  indices?: ([number, number] | undefined)[];
};

/** A back-reference in an `end` pattern, read as vscode-textmate reads it. */
const BACK_REFERENCE = /\\(\d+)/g;

/**
 * `RegExp` wrapper class. Designed to improve performance by implementing
 * certain operations (like matching) with edge case handling and short
 * circuits. In order to assist with this goal, the internal `RegExp` is
 * always set to be `sticky`, so this class won't work if you want to use a
 * non-sticky `RegExp`.
 */
export class RegExpMatcher implements Matcher {
  /**
   * Internal `RegExp`. Can be null, which is so that even a malformed
   * input `RegExp` source won't throw. This is used to combat inconsistent
   * browser behavior.
   */
  declare regexp: RegExp;

  /**
   * The same `RegExp` with the `d` flag, made when a match first needs the
   * positions of its groups.
   */
  declare private indicesRegexp: RegExp | undefined;

  /**
   * True if the source `RegExp` has an capturing groups. Used to short
   * circuit the `match` method's behavior, and improve performance.
   */
  declare private hasCapturingGroups: boolean;

  /**
   * Where each capturing group sits (`analyzeCaptureGroups`): the group
   * enclosing it, 0 for none, or -1 inside a lookaround.
   */
  declare readonly groupParents: number[];

  /**
   * True if no capturing group is nested in another or in a lookaround, so
   * groups whose lengths add up to the match's follow one another through it
   * and need no indices.
   */
  declare private flatGroups: boolean;

  declare protected _pattern: string;

  declare protected _flags: string;

  protected _backReferences: string[] = [];

  get backReferences() {
    return this._backReferences;
  }

  set backReferences(value) {
    this._backReferences = value;
    // As vscode-textmate does, every `\N` is the begin's group N, and the
    // empty string when the begin has no such group.
    const escapedPattern = this._pattern.replace(BACK_REFERENCE, (_, n) =>
      escapeRegExpPattern(value[parseInt(n, 10)] ?? ""),
    );
    if (escapedPattern !== this._source) {
      this._source = escapedPattern;
      this.indicesRegexp = undefined;
      try {
        this.regexp = new RegExp(escapedPattern, this._flags);
      } catch {
        // As in the constructor, a malformed source fails when it is used.
        this.regexp = undefined!;
      }
    }
  }

  /** The source {@link regexp} was made from. */
  declare protected _source: string;

  /**
   * @param pattern - The source `RegExp` to wrap.
   */
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

  /**
   * Performs the standard `RegExp.test` operation on a string.
   *
   * @param str - The string to match.
   * @param pos - The position to start matching at.
   */
  test(str: string, pos: number) {
    if (!this.regexp) {
      throw new Error(`Invalid RegExp: ${this._pattern}`);
    }
    this.regexp.lastIndex = pos;
    return this.regexp.test(str);
  }

  /**
   * Performs the standard `RegExp.exec` operation on a string. This is an
   * internal method because consumers should use the `match` method instead.
   *
   * @param str - The string to match.
   * @param pos - The position to start matching at.
   */
  private exec(str: string, pos: number) {
    if (!this.regexp) {
      throw new Error(`Invalid RegExp: ${this._pattern}`);
    }
    this.regexp.lastIndex = pos;
    return this.regexp.exec(str);
  }

  /**
   * Performs `RegExp.exec` with the `d` flag, so the result holds each
   * group's `[start, end)`.
   */
  private execIndices(str: string, pos: number) {
    this.indicesRegexp ??= new RegExp(this.regexp.source, this._flags + "d");
    this.indicesRegexp.lastIndex = pos;
    return this.indicesRegexp.exec(str);
  }

  /**
   * Returns the results of attempting to match a string against this
   * regular expression.
   *
   * @param str - The string to match.
   * @param pos - The position to start matching at.
   */
  match(str: string, pos: number): RegExpMatchResult | null {
    // if we don't have any capturing groups, we can cheat a little bit,
    // and only use the `test` method, which is much faster
    if (!this.hasCapturingGroups) {
      if (this.test(str, pos)) {
        // regexp remembers where it ended up, so we can use that to figure
        // out where the match ended
        const length = this.regexp!.lastIndex - pos;
        const total = str.slice(pos, pos + length);
        return [total];
      }
      return null;
    }

    // this dumb looking code is actually faster than just calling `exec` by itself
    // I don't really know why - I guess because `test` is much faster than `exec`
    // and most of the time a regexp doesn't match anything, so it's not worth
    // trying a full match first
    if (this.test(str, pos)) {
      if (this.flatGroups) {
        const match = this.exec(str, pos);
        if (match) {
          // capturing groups can be undefined if an entire group was marked
          // as optional. Groups that follow one another through the whole
          // match are placed by their lengths alone; any other match (a gap
          // between groups, or a group repeated) needs their indices.
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
