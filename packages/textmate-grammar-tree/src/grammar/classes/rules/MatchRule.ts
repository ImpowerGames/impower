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
    const lineText = state.lineText;
    const result = this.matcher.match(lineText, from - lineStart);
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
        this.placeFromIndices(
          matched,
          result,
          result.indices,
          lineStart,
          lineText,
        );
      } else {
        // The groups follow one another through the whole match.
        let pos = from;
        let uncovered = false;
        result.forEach((resultStr, resultIndex) => {
          const capture = this.captures?.[resultIndex];
          if (capture) {
            matched.children ??= [];
            matched.children.push(
              this.capture(capture, resultStr, pos, lineStart, lineText),
            );
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
   * Places each capture at its group's own position in the match, nesting
   * them as vscode-textmate does: a capture that begins before the latest
   * open capture ends is inside it, and one inside a capture read with
   * patterns is left to those patterns. A group in a lookaround is placed
   * the same way when its text lies within the match; text outside the match
   * cannot be a node inside it, so such a group is not placed. Text of the
   * match or of a capture that no capture covers stays in it as a node-less
   * span.
   */
  private placeFromIndices(
    matched: Matched,
    result: RegExpMatchResult,
    indices: ([number, number] | undefined)[],
    lineStart: number,
    lineText: string,
  ) {
    const parents = this.matcher.groupParents;
    const captures = this.captures;
    const end = matched.from + matched.length;
    // The captures still open at the current group, innermost last, with
    // whether each is read with patterns.
    const open: { matched: Matched; patterns: boolean }[] = [];
    const hosts = new Set<Matched>([matched]);
    // Where the next group of the match itself begins: an unmatched one is
    // placed there, as when the groups are placed by their lengths.
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
        // Overlapping its host without nesting in it: no node can hold it.
        continue;
      }
      const captureMatched = this.capture(
        capture,
        result[i],
        start,
        lineStart,
        lineText,
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

  /**
   * Makes the node of one capture, whose text begins at `pos` in the line
   * `lineText` that begins at `lineStart`.
   *
   * A capture read with patterns is tokenized as vscode-textmate's
   * `handleCaptures` does: on the line up to the capture's end, from the
   * capture's start, so a lookbehind, `^` or `\b` in its patterns sees the
   * text before the capture, and nothing reads past its end.
   */
  private capture(
    capture: GrammarNode | SwitchRule,
    resultStr: string | undefined,
    pos: number,
    lineStart: number,
    lineText: string,
  ) {
    const resultStrLength = resultStr?.length ?? 0;
    if (!(capture instanceof SwitchRule)) {
      return Matched.create(capture, pos, resultStrLength);
    }
    const start = pos - lineStart;
    const state = GrammarState.ofLine(
      lineText.slice(0, start + resultStrLength),
    );
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
      const matched = capture.match(state, start);
      if (matched) {
        matched.offset(pos);
        children.push(matched);
      }
    }
    let i = 0;
    while (i < resultStrLength) {
      const matched = capture.match(state, start + i);
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

const endOf = (matched: Matched) => matched.from + matched.length;

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
