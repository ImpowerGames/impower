/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Matcher } from "../types/Matcher";
import { escapeRegExpPattern } from "../utils/escapeRegExpPattern";
import { hasCapturingGroups } from "../utils/hasCapturingGroups";

/**
 * `RegExp` wrapper class. Designed to improve performance by implementing
 * certain operations (like matching) with edge case handling and short
 * circuits. In order to assist with this goal, the internal `RegExp` is
 * always set to be `sticky`, so this class won't work if you want to use a
 * non-sticky `RegExp`.
 */
export default class RegExpMatcher implements Matcher {
  /**
   * Internal `RegExp`. Can be null, which is so that even a malformed
   * input `RegExp` source won't throw. This is used to combat inconsistent
   * browser behavior.
   */
  declare regexp: RegExp;

  /**
   * True if the source `RegExp` has an capturing groups. Used to short
   * circuit the `match` method's behavior, and improve performance.
   */
  private declare hasCapturingGroups: boolean;

  protected declare _pattern: string;

  protected declare _flags: string;

  protected _backReferences: string[] = [];

  get backReferences() {
    return this._backReferences;
  }

  set backReferences(value) {
    this._backReferences = value;
    let escapedPattern = this._pattern;
    this._backReferences.forEach((capture, index) => {
      const escapedCapture = escapeRegExpPattern(capture);
      escapedPattern = escapedPattern.replaceAll(`\\${index}`, escapedCapture);
    });
    if (escapedPattern !== this._pattern) {
      this.regexp = new RegExp(escapedPattern, this._flags);
    }
  }

  /**
   * @param pattern - The source `RegExp` to wrap.
   */
  constructor(pattern: string, flags = "muy") {
    this._pattern = pattern;
    this._flags = flags;
    try {
      const regexp = new RegExp(pattern, flags);
      this.regexp = regexp;
    } catch {}
    this.hasCapturingGroups = this.regexp
      ? hasCapturingGroups(this.regexp)
      : false;
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
   * Returns the results of attempting to match a string against this
   * regular expression.
   *
   * @param str - The string to match.
   * @param pos - The position to start matching at.
   */
  match(str: string, pos: number): string[] | null {
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
      const match = this.exec(str, pos);
      if (match) {
        const total = match[0];
        const result = match.slice();

        // capturing groups can be undefined if an entire group was marked as optional
        // so we'll replace those with an empty string to keep the interface consistent
        if (result) {
          let capturedLength = 0;
          for (let i = 1; i < result.length; i++) {
            if (result[i] === undefined) {
              result[i] = "";
            }
            capturedLength += result[i]?.length ?? 0;
          }
          // parser only accepts regexps that have their capturing groups
          // consist of contiguous ranges covering the entirety of the match
          if (capturedLength !== total.length) {
            throw new Error(
              `Invalid capturing group lengths: ${this.regexp.source}`
            );
          }
        }

        return result;
      }
    }

    return null;
  }
}
