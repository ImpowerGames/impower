/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { contextEquivalent } from "../utils/contextEquivalent";
import { GrammarStack } from "./GrammarStack";

/** Internal state for a {@link Grammar}. */
export class GrammarState {
  /**
   * @param context - The current context table.
   * @param stack - The current {@link GrammarStack}.
   */
  constructor(
    public context: Record<string, string> = {},
    public stack: GrammarStack = new GrammarStack()
  ) {}

  /**
   * Returns if another {@link GrammarState} is effectively equivalent to this one.
   *
   * @param other - The other {@link GrammarState} to compare to.
   */
  equals(other: GrammarState) {
    if (!contextEquivalent(this.context, other.context)) {
      return false;
    }
    if (!this.stack.equals(other.stack)) {
      return false;
    }
    return true;
  }

  /** Returns a new clone of this state, including its stack. */
  clone() {
    return new GrammarState(this.context, this.stack.clone());
  }
}
