/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type {
IncludeDefinition,
SwitchRuleDefinition,
} from "../../types/GrammarDefinition";
import type { Rule } from "../../types/Rule";
import { createID } from "../../utils/createID";
import { GrammarNode } from "../GrammarNode";
import type { GrammarRepository } from "../GrammarRepository";

export class SwitchRule implements Rule {
  repo: GrammarRepository;

  id: string;

  node: GrammarNode;

  patterns?: IncludeDefinition[];

  rules?: Rule[];

  missing = false;

  emit?: boolean;

  constructor(
    repo: GrammarRepository,
    def: SwitchRuleDefinition,
    node = new GrammarNode(repo.nextTypeIndex(), def, repo.declarator),
  ) {
    this.repo = repo;

    let id = def.id ?? createID();
    this.id = id;
    this.node = node;

    this.emit = def.emit;

    this.patterns = def.patterns;
  }

  resolve() {
    if (!this.rules) {
      const resolved = this.repo.getRules(this.patterns ?? [], this.id);
      this.rules = resolved.rules;
      this.missing = resolved.missing;
    }
  }

  get skipped() {
    return this.missing && this.rules?.length === 0;
  }

  prune(): boolean {
    const kept = this.rules?.filter((rule) => !rule.skipped);
    if (!kept || kept.length === this.rules!.length) {
      return false;
    }
    this.rules = kept;
    this.missing = true;
    return true;
  }
}
