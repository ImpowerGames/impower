/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { GrammarNode } from "../classes/GrammarNode";
import type { GrammarState } from "../classes/GrammarState";
import type { Matched } from "../classes/Matched";

export interface Rule {
  id: string;

  node: GrammarNode;

  match: (state: GrammarState, pos: number) => Matched | null;
}
