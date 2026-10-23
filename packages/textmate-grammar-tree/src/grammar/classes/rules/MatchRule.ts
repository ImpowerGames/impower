/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { MatchRuleDefinition } from "../../types/GrammarDefinition";
import type { Rule } from "../../types/Rule";
import { LOOKAROUND_GROUP } from "../../utils/analyzeCaptureGroups";
import { createID } from "../../utils/createID";
import { isSwitchRuleDefinition } from "../../utils/isSwitchRuleDefinition";
import { GrammarNode } from "../GrammarNode";
import type { GrammarRepository } from "../GrammarRepository";
import { GrammarState } from "../GrammarState";
import { Matched } from "../Matched";
import { RegExpMatcher, type RegExpMatchResult } from "../RegExpMatcher";
import { SwitchRule } from "./SwitchRule";

/**
 * A {@link Rule} subclass that uses {@link RegExpMatcher} or
 * {@link StringMatcher} instances for the underlying pattern.
 */
export class MatchRule implements Rule {
  repo: GrammarRepository;

  id: string;

  node: GrammarNode;

  declare matcher: RegExpMatcher;

  declare captures: (GrammarNode | SwitchRule)[];

  constructor(repo: GrammarRepository, def: MatchRuleDefinition) {
    this.repo = repo;

    let id = def.id ?? createID();
    this.id = id;
    this.node = new GrammarNode(
      repo.nextTypeIndex(),
      def,
      repo.grammar.declarator,
    );

    this.matcher = new RegExpMatcher(def.match, def.flags);

    if (def.captures) {
      this.captures = [];
      for (const key in def.captures) {
        const value = def.captures[key];
        const index = parseInt(key, 10);
        if (value != null) {
          const captureId = this.id + `_c${index}`;
          if (isSwitchRuleDefinition(value)) {
            this.captures[index] = repo.add(value, captureId);
          } else {
            this.captures[index] = repo.add(value, captureId);
          }
        }
      }
    }
  }

  match(state: GrammarState, from: number) {
    return this.matchGroups(state, from)?.matched ?? null;
  }

  /**
   * Matches as {@link match} does, and also returns the text of each of the
   * regex's groups (group 0 being the whole match), which a scoped rule's
   * `end` reads as its back-references.
   */
  matchGroups(
    state: GrammarState,
    from: number,
  ): { matched: Matched; groups: RegExpMatchResult } | null {
    if (state.possibleStackOverflow(this.id, from)) {
      return null; // Detected infinite recursion
    }
    state.enter(this.id, from);
    // Match against the current line only, as vscode-textmate does.
    state.line(from);
    const lineStart = state.lineStart;
    const result = this.matcher.match(state.lineText, from - lineStart);
    if (!result) {
      state.exit(this.id, from);
      return null;
    }
    const total = result[0];
    if (total == null) {
      state.exit(this.id, from);
      return null;
    }
    const matched = Matched.create(this.node, from, total.length);
    if (this.captures) {
      if (result.indices) {
        this.placeFromIndices(matched, result, result.indices, lineStart);
      } else {
        // The groups follow one another through the whole match.
        let pos = from;
        let uncovered = false;
        result.forEach((resultStr, resultIndex) => {
          const capture = this.captures?.[resultIndex];
          if (capture) {
            matched.children ??= [];
            matched.children.push(this.capture(capture, resultStr, pos));
          } else if (resultIndex > 0 && resultStr) {
            uncovered = true;
          }
          if (resultIndex > 0) {
            // First capture is always the total match so it's length shouldn't count
            pos += resultStr?.length ?? 0;
          }
        });
        if (uncovered && !this.captures[0]) {
          // A group with no capture leaves its text to the match itself.
          fillGaps(matched);
        }
      }
    }

    state.exit(this.id, from);
    return { matched, groups: result };
  }

  /**
   * Places each capture at its group's own position in the match, as
   * vscode-textmate does. A group nested in another group with a capture is
   * that capture's child, or, when that capture reads its text with
   * patterns, is left to those patterns; a group in a lookaround is not part
   * of the match and is not placed. Text of the match or of a capture that no
   * capture covers stays in it as a node-less span.
   */
  private placeFromIndices(
    matched: Matched,
    result: RegExpMatchResult,
    indices: ([number, number] | undefined)[],
    lineStart: number,
  ) {
    const parents = this.matcher.groupParents;
    const captures = this.captures;
    // The capture made for each group, which the groups nested in it join.
    const made: Matched[] = [];
    const hosts = new Set<Matched>([matched]);
    // Where the next group of the match itself begins: an unmatched one is
    // placed there, as when the groups are placed by their lengths.
    let pos = matched.from;
    const capture0 = captures[0];
    if (capture0) {
      made[0] = this.capture(capture0, result[0], matched.from);
      matched.children = [made[0]];
    }
    for (let i = 1; i < result.length; i++) {
      const parent = parents[i] ?? 0;
      if (parent === LOOKAROUND_GROUP) {
        continue;
      }
      const range = indices[i];
      if (!range && parent !== 0) {
        continue;
      }
      const start = range ? lineStart + range[0] : pos;
      if (parent === 0) {
        pos = range ? lineStart + range[1] : pos;
      }
      const capture = captures[i];
      if (!capture) {
        continue;
      }
      // The nearest enclosing group that has a capture.
      let owner = parent;
      while (owner > 0 && !captures[owner]) {
        owner = parents[owner] ?? 0;
      }
      const host = owner > 0 || capture0 ? made[owner] : matched;
      if (!host || captures[owner] instanceof SwitchRule) {
        continue;
      }
      const captureMatched = this.capture(capture, result[i], start);
      made[i] = captureMatched;
      host.children ??= [];
      host.children.push(captureMatched);
      hosts.add(host);
    }
    for (const host of hosts) {
      fillGaps(host);
    }
  }

  /** Makes the node of one capture, whose text begins at `pos`. */
  private capture(
    capture: GrammarNode | SwitchRule,
    resultStr: string | undefined,
    pos: number,
  ) {
    const resultStrLength = resultStr?.length ?? 0;
    if (!(capture instanceof SwitchRule)) {
      return Matched.create(capture, pos, resultStrLength);
    }
    const state = new GrammarState(resultStr ?? "");
    const children: Matched[] = [];
    // Zero-width capture: try to match the inner patterns
    // once against the empty string. Patterns that can match
    // zero-width (e.g. `OptionalWhitespace` with `*`) emit a
    // node here, so downstream formatters can detect every
    // capture boundary even when the source has no
    // whitespace there. Patterns that can't match
    // zero-width (e.g. `RequiredWhitespace` with `+`) return
    // null and nothing is pushed.
    if (resultStr != null && resultStr.length === 0) {
      const matched = capture.match(state, 0);
      if (matched) {
        matched.offset(pos);
        children.push(matched);
      }
    }
    let i = 0;
    while (i < resultStrLength) {
      const matched = capture.match(state, i);
      if (matched?.length) {
        matched.offset(pos + i);
        children.push(matched);
        i += matched.length;
      } else {
        // Like vscode-textmate, scan on past a character the
        // capture's patterns cannot read, leaving it in the
        // capture's scope. The capture's extent is fixed by the
        // outer match, so no incomplete-close signal is lost.
        const noneMatched = Matched.create(
          GrammarNode.Unrecognized,
          pos + i,
          1,
        );
        children.push(noneMatched);
        i += 1;
      }
    }
    return Matched.create(
      capture.node,
      pos,
      resultStrLength,
      children.length > 0 ? children : undefined,
    );
  }
}

/**
 * Covers the text of a match or capture that its child captures leave with
 * node-less spans, so the node still spans all of its text.
 */
const fillGaps = (matched: Matched) => {
  const children = matched.children;
  if (!children?.length) {
    return;
  }
  const filled: Matched[] = [];
  let pos = matched.from;
  for (const child of children) {
    if (child.from > pos) {
      filled.push(new Matched(GrammarNode.None, pos, child.from - pos));
    }
    filled.push(child);
    pos = Math.max(pos, child.from + child.length);
  }
  const end = matched.from + matched.length;
  if (end > pos) {
    filled.push(new Matched(GrammarNode.None, pos, end - pos));
  }
  matched.children = filled;
};
