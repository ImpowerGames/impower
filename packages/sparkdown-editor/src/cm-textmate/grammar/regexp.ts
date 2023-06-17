/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { MatchOutput, Matcher } from "../core/types";
import { hasCapturingGroups } from "../utils/hasCapturingGroups";

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
   * True if the source `RegExp` has an capturing groups. Used to short
   * circuit the `match` method's behavior, and improve performance.
   */
  private declare hasCapturingGroups: boolean;

  /**
   * @param src - The source `RegExp` to wrap.
   */
  constructor(src: string, flags = "muy") {
    const regexp = new RegExp(src, flags);
    if (!regexp) {
      throw new Error(`Invalid RegExp: ${src}`);
    }
    this.regexp = regexp;
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
  match(str: string, pos: number): MatchOutput {
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
          // tarnation can only accept regexps that have their capturing groups
          // consist of contigous ranges covering the entirety of the match
          if (capturedLength !== total.length) {
            throw new Error("Invalid capturing group lengths");
          }
        }

        return result;
      }
    }

    return null;
  }
}
