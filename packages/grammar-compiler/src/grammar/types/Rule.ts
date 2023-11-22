/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type GrammarNode from "../classes/GrammarNode";
import type GrammarState from "../classes/GrammarState";
import type Matched from "../classes/Matched";

/**
 * A {@link GrammarNode} with some sort of associated pattern. Patterns exist as
 * subclasses of this class.
 */
export interface Rule {
  /** The name of this rule. May be different to what is emitted to the AST. */
  id: string;

  /** The {@link GrammarNode} associated with this rule. */
  node: GrammarNode;

  /**
   * @param str - The string to match.
   * @param pos - The position to start matching at.
   * @param state - The current {@link GrammarState}.
   */
  match: (
    str: string,
    pos: number,
    state: GrammarState,
    possiblyIncomplete?: boolean
  ) => Matched | null;
}
