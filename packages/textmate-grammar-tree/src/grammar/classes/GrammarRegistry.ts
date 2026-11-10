/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { GrammarDefinition } from "../types/GrammarDefinition";

export class GrammarRegistry {
  readonly grammars: readonly GrammarDefinition[];

  readonly start: GrammarDefinition;

  constructor(grammars: readonly GrammarDefinition[], startScopeName?: string) {
    if (!grammars[0]) {
      throw new Error("a grammar registry needs at least one grammar");
    }
    this.grammars = grammars;
    const start =
      startScopeName === undefined ? grammars[0] : this.get(startScopeName);
    if (!start) {
      throw new Error(`${startScopeName} is not in the grammar registry`);
    }
    this.start = start;
  }

  get home(): GrammarDefinition {
    return this.grammars[0]!;
  }

  get(scopeName: string): GrammarDefinition | undefined {
    return this.grammars.find((grammar) => grammar.scopeName === scopeName);
  }

  prefixOf(grammar: GrammarDefinition): string {
    return grammar === this.home ? "" : `${grammar.scopeName}#`;
  }
}
