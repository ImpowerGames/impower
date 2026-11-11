/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { MatchRuleDefinition } from "../../types/GrammarDefinition";
import type { Rule } from "../../types/Rule";
import { createID } from "../../utils/createID";
import { isSwitchRuleDefinition } from "../../utils/isSwitchRuleDefinition";
import { GrammarNode } from "../GrammarNode";
import type { GrammarRepository } from "../GrammarRepository";
import { GrammarState } from "../GrammarState";
import { Matched } from "../Matched";
import { RegExpMatcher, type RegExpMatchResult } from "../RegExpMatcher";
import { ResumableTokenizer } from "../ResumableTokenizer";
import { SwitchRule } from "./SwitchRule";

export class MatchRule implements Rule {
  repo: GrammarRepository;

  id: string;

  node: GrammarNode;

  declare matcher: RegExpMatcher;

  declare captures: (GrammarNode | SwitchRule)[];

  readonly skipped = false;

  constructor(repo: GrammarRepository, def: MatchRuleDefinition) {
    this.repo = repo;

    let id = def.id ?? createID();
    this.id = id;
    this.node = new GrammarNode(
      repo.nextTypeIndex(),
      def,
      repo.declarator,
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

  matchGroups(
    state: GrammarState,
    from: number,
  ): { matched: Matched; groups: RegExpMatchResult } | null {
    if (state.exceedsDepth()) {
      return null;
    }
    state.line(from);
    const lineStart = state.lineStart;
    const lineText = state.lineText;
    const result = this.matcher.match(
      lineText,
      from - lineStart,
      this.matcher.hasAnchor && state.isAnchor(from),
    );
    const total = result?.[0];
    if (!result || total == null) {
      return null;
    }
    const matched = Matched.create(this.node, from, total.length);
    if (this.captures) {
      if (result.indices) {
        this.placeFromIndices(
          matched,
          result,
          result.indices,
          lineStart,
          lineText,
          state,
        );
      } else {
        let pos = from;
        let uncovered = false;
        result.forEach((resultStr, resultIndex) => {
          const capture = this.captures?.[resultIndex];
          if (capture) {
            const captured = this.capture(
              capture,
              resultStr,
              pos,
              lineStart,
              lineText,
              state,
            );
            matched.children ??= [];
            matched.children.push(captured);
            if (captured.length < (resultStr?.length ?? 0)) {
              uncovered = true;
            }
          } else if (resultIndex > 0 && resultStr) {
            uncovered = true;
          }
          if (resultIndex > 0) {
            pos += resultStr?.length ?? 0;
          }
        });
        if (uncovered && !this.captures[0]) {
          fillGaps(matched);
        }
      }
    }

    return { matched, groups: result };
  }

  private placeFromIndices(
    matched: Matched,
    result: RegExpMatchResult,
    indices: ([number, number] | undefined)[],
    lineStart: number,
    lineText: string,
    state: GrammarState,
  ) {
    const parents = this.matcher.groupParents;
    const captures = this.captures;
    const end = matched.from + matched.length;
    const open: { matched: Matched; patterns: boolean }[] = [];
    const hosts = new Set<Matched>([matched]);
    let pos = matched.from;
    for (let i = 0; i < result.length; i++) {
      const parent = i === 0 ? 0 : (parents[i] ?? 0);
      const range: [number, number] | undefined =
        i === 0 ? [matched.from - lineStart, end - lineStart] : indices[i];
      if (!range && parent !== 0) {
        continue;
      }
      const start = range ? lineStart + range[0] : pos;
      const stop = range ? lineStart + range[1] : pos;
      if (i > 0 && parent === 0) {
        pos = stop;
      }
      const capture = captures[i];
      if (!capture || start < matched.from || stop > end) {
        continue;
      }
      while (open.length > 0 && endOf(open.at(-1)!.matched) <= start) {
        open.pop();
      }
      const owner = open.at(-1);
      if (owner?.patterns) {
        continue;
      }
      const host = owner?.matched ?? matched;
      if (stop > endOf(host) || start < host.from) {
        continue;
      }
      const captureMatched = this.capture(
        capture,
        result[i],
        start,
        lineStart,
        lineText,
        state,
      );
      host.children ??= [];
      host.children.push(captureMatched);
      hosts.add(host);
      open.push({ matched: captureMatched, patterns: capture instanceof SwitchRule });
    }
    for (const host of hosts) {
      host.children?.sort((a, b) => a.from - b.from);
      fillGaps(host);
    }
  }

  private capture(
    capture: GrammarNode | SwitchRule,
    resultStr: string | undefined,
    pos: number,
    lineStart: number,
    lineText: string,
    state: GrammarState,
  ) {
    const resultStrLength = resultStr?.length ?? 0;
    if (!(capture instanceof SwitchRule)) {
      return Matched.create(capture, pos, resultStrLength);
    }
    if (resultStr == null) {
      return Matched.create(capture.node, pos, 0);
    }
    const start = pos - lineStart;
    const { tokens, to } = ResumableTokenizer.tokenizeCapture(
      this.repo.grammar,
      [capture],
      lineText.slice(0, start + resultStrLength),
      start,
      lineStart,
      state.enclosingAt(lineStart, capture.id, pos),
    );
    if (tokens.length === 0) {
      return Matched.create(capture.node, pos, 0);
    }
    return Matched.tokenized(capture.node, pos, to - start, tokens);
  }
}

const endOf = (matched: Matched) => matched.from + matched.length;

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
