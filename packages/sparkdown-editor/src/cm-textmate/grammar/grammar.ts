/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { match } from "../utils/match";
import type { Matched } from "./matched";
import { ParserNode } from "./node";
import { Repository } from "./repository";
import { GrammarStack, GrammarState } from "./state";
import type * as DF from "./types/definition";
import { Rule } from "./types/rule";

/** Grammar/dumb-tokenizer for a {@link TextmateLanguage}. */
export class Grammar {
  /** {@link Repository} of rules, states, and nodes used by this grammar. */
  declare repository: Repository;

  /** The root rules to begin tokenizing with. */
  declare patterns: Rule[];

  public data: DF.GrammarData;

  /**
   * @param textmateData - The definition grammar to compile.
   * @param variables - {@link Variable}s to pass to the compiled grammar.
   */
  constructor(data: DF.GrammarData) {
    this.data = data;

    // setup repository, add rules, etc.

    this.repository = new Repository(this);

    if (data?.repository) {
      for (const name in data.repository) {
        const item = data.repository[name];
        if (item != null) {
          this.repository.add(item, name);
        }
      }
    }

    if (data?.patterns) {
      this.patterns = this.repository.patterns(data.patterns, "");
    }
  }

  /** Returns a {@link GrammarState} setup for this grammar's default state. */
  startState() {
    return new GrammarState(
      {},
      new GrammarStack([
        { node: ParserNode.None, rules: this.patterns, end: null },
      ])
    );
  }

  /**
   * Runs a match against a string (starting from a given position).
   *
   * @param state - The {@link GrammarState} to run the match with.
   * @param str - The string to match.
   * @param pos - The position to start matching at.
   * @param offset - The offset to apply to the resulting {@link Matched}'s
   *   `from` position.
   */
  match(state: GrammarState, str: string, pos: number, offset = 0) {
    return match(state, str, pos, offset);
  }
}
