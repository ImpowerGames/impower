/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeID } from "../../../core/enums/NodeID";
import { Wrapping } from "../../enums/Wrapping";
import {
  MatchRuleDefinition,
  ScopedRuleDefinition,
  SwitchRuleDefinition,
} from "../../types/GrammarDefinition";
import { Rule } from "../../types/Rule";
import { createID } from "../../utils/createID";
import { GrammarNode } from "../GrammarNode";
import type { GrammarRepository } from "../GrammarRepository";
import { GrammarState } from "../GrammarState";
import { Matched } from "../Matched";
import { RegExpMatcher } from "../RegExpMatcher";
import type { MatchRule } from "./MatchRule";
import { SwitchRule } from "./SwitchRule";

const EMPTY_MATCH_LIMIT = 10;

/**
 * Backstop against pathological grammars that open scopes without making
 * progress (e.g. a zero-width `begin` that recurses). In the line+stack model
 * the per-call recursion guard (`possibleStackOverflow`, reset each line) does
 * not see growth ACROSS lines, so an unbounded persistent scope stack could
 * otherwise grow forever. Real grammars nest only a handful deep, so this cap is
 * never reached in practice.
 */
const MAX_OPEN_SCOPES = 1000;

/**
 * A {@link Rule} subclass that uses {@link RegExpMatcher} or
 * {@link StringMatcher} instances for the underlying pattern.
 */
export class ScopedRule implements Rule {
  repo: GrammarRepository;

  id: string;

  node: GrammarNode;

  beginRule: MatchRule;

  endRule: MatchRule;

  contentRule: SwitchRule;

  applyEndPatternLast: boolean;

  constructor(repo: GrammarRepository, def: ScopedRuleDefinition) {
    this.repo = repo;

    let id = def.id ?? createID();
    this.id = id;
    this.node = new GrammarNode(
      repo.nextTypeIndex(),
      def,
      repo.grammar.declarator,
    );

    const beginId = this.id + "_begin";
    const endId = this.id + "_end";
    const contentId = this.id + "_content";

    // begin
    const beginRuleItem: MatchRuleDefinition = {
      id: beginId,
      match: def.begin,
      captures: def.beginCaptures,
      closedBy: (def.closedBy ?? def.brackets) ? endId : undefined,
    };
    this.beginRule = repo.add(beginRuleItem, beginId);

    if ("while" in def) {
      throw new Error("while rules are not currently supported");
    }

    // end
    const endRuleItem: MatchRuleDefinition = {
      id: endId,
      match: def.end,
      captures: def.endCaptures,
      openedBy: (def.openedBy ?? def.brackets) ? beginId : undefined,
    };
    this.endRule = repo.add(endRuleItem, endId);

    // content
    const contentRuleItem: SwitchRuleDefinition = {
      id: contentId,
      patterns: def.patterns ?? [],
      tag: def.contentTag,
    };
    this.contentRule = repo.add(contentRuleItem, contentId);

    this.applyEndPatternLast = def.applyEndPatternLast ?? false;
  }

  /**
   * @param str - The string to match.
   * @param from - The position to start matching at.
   * @param state - The current {@link GrammarState}.
   */
  /**
   * Line+stack entry. Matches this scope's BEGIN (pushing the scope frame onto
   * state.stack) and processes the remainder of the begin line. If the scope's
   * `end` also matches on the begin line (an inline scope, or a same-line
   * container like Scene/Branch) it closes here and returns the full match.
   * Otherwise the frame stays on the stack and the scope is continued by
   * `matchLine` on subsequent lines. There is no static line-spanning vs
   * intra-line distinction — a scope closes on whichever line its `end` matches.
   */
  match(state: GrammarState, from: number) {
    if (state.stack.length > MAX_OPEN_SCOPES) {
      return null; // Backstop: refuse to open scopes past a sane nesting depth.
    }
    if (state.possibleStackOverflow(this.id, from)) {
      return null; // Detected infinite recursion
    }
    state.enter(this.id, from);
    const beginMatched = this.begin(state, from);
    if (!beginMatched) {
      state.exit(this.id, from);
      return null;
    }
    const frame = state.stack.at(-1);
    if (frame) {
      frame.scopedRule = this;
      frame.contentOpened = false;
    }
    const result = this.continueLine(state, from, beginMatched);
    state.exit(this.id, from);
    return result;
  }

  /**
   * Continue an already-open scope (this rule is the top of state.stack) on a
   * subsequent line.
   */
  matchLine(state: GrammarState, from: number) {
    if (state.possibleStackOverflow(this.id, from)) {
      return null;
    }
    state.enter(this.id, from);
    const result = this.continueLine(state, from, null);
    state.exit(this.id, from);
    return result;
  }

  /**
   * Process this scope's content for the CURRENT line (`state.str` is a single
   * line). The content wrapper node is opened lazily on the first content token
   * (Wrapping.BEGIN) and closed with a zero-width token when the scope ends
   * (Wrapping.END), so it spans exactly the body — byte-identical to the legacy
   * whole-block 0/1/>1-child wrapping. If `end` does not match on this line the
   * scope stays open on the stack to be resumed by the next `matchLine` call;
   * EOF-truncated scopes are closed without an incomplete marker by the
   * compiler's finish pass.
   */
  private continueLine(
    state: GrammarState,
    lineFrom: number,
    beginMatched: Matched | null,
  ): Matched | null {
    const frame = state.stack.at(-1)!;
    // Depth of this scope's frame. If a content match opens a NESTED scope that
    // stays open, the rest of the document belongs to it — stop and let dispatch
    // route subsequent lines to the nested scope.
    const baseDepth = state.stack.length;
    // `state.str` is a single line (region.next). Bound the loop to it so we
    // consume at most one line per call; `end` is still evaluated against the
    // full continuation via `state.advance()` lookahead at the boundary.
    const lineEnd = state.str.length;
    let pos = lineFrom + (beginMatched ? beginMatched.length : 0);
    let totalLength = beginMatched ? beginMatched.length : 0;

    const contentChildren: Matched[] = [];
    // Initial end-check only on the BEGIN line (right after begin), mirroring the
    // legacy loop. Continuation lines do NOT pre-check end before content — that
    // would let a multiline `$` end falsely close on an empty line.
    let endMatched: Matched | false | null =
      beginMatched && !this.applyEndPatternLast ? this.end(state, pos) : false;

    let emptyMatchCount = 0;
    let nestedOpened = false;
    while (!endMatched && pos < lineEnd) {
      const patternMatched = this.content(state, pos);
      if (patternMatched) {
        if (patternMatched.length === 0) {
          emptyMatchCount++;
          if (emptyMatchCount >= EMPTY_MATCH_LIMIT) {
            break;
          }
        } else {
          emptyMatchCount = 0;
          pos += patternMatched.length;
          totalLength += patternMatched.length;
        }
        contentChildren.push(patternMatched);
        if (state.stack.length > baseDepth) {
          // A nested scope opened and is still open; it owns the rest.
          nestedOpened = true;
          break;
        }
        if (!this.applyEndPatternLast && pos < lineEnd) {
          endMatched = this.end(state, pos);
        }
      } else {
        endMatched = this.end(state, pos);
        break;
      }
    }

    // Boundary close-check WITH lookahead, mirroring the legacy advance()+end()
    // at end-of-window: closes inline scopes at EOL/EOF and correctly evaluates
    // `$`/`(?=$)` without the per-line window making mid-document look like EOF.
    let reachedEof = false;
    if (!nestedOpened && !endMatched && pos >= lineEnd) {
      const lenBefore = state.str.length;
      state.advance();
      reachedEof = state.str.length === lenBefore;
      endMatched = this.end(state, pos);
    }
    // The scope ran out of input without its `end` matching: close it naturally
    // (no `end` node, no incomplete marker), matching the legacy `closedAtEof`
    // suppression. Genuine mid-content failures (not at EOF) leave the scope
    // open to be reported by the compiler's finish pass.
    const closedAtEof = !endMatched && reachedEof;

    // A continuation line that made NO forward progress and didn't close the
    // scope (only zero-width content matched, e.g. a degenerate `(?!a)`
    // lookahead): emit nothing and let the dispatcher advance via its
    // unrecognized fallback. Without this, an adversarial zero-width-recursive
    // grammar re-enters every position ~100x and explodes the node count.
    if (
      !beginMatched &&
      !endMatched &&
      !closedAtEof &&
      !nestedOpened &&
      pos === lineFrom
    ) {
      return null;
    }

    const children: Matched[] = [];
    if (beginMatched) {
      children.push(beginMatched);
    }
    if (contentChildren.length > 0) {
      if (!frame.contentOpened) {
        frame.contentOpened = true;
        contentChildren[0] = contentChildren[0]!.wrap(
          this.contentRule.node,
          Wrapping.BEGIN,
        );
      }
      for (let i = 0; i < contentChildren.length; i++) {
        children.push(contentChildren[i]!);
      }
    }
    if (endMatched || closedAtEof) {
      if (frame.contentOpened) {
        // Zero-width close of the content wrapper at the end of the last
        // content (== start of the `end` match / EOF), reproducing the legacy
        // content node's `to`.
        children.push(
          new Matched(this.contentRule.node, pos, 0, undefined, Wrapping.END),
        );
      }
      if (endMatched) {
        children.push(endMatched);
        totalLength += endMatched.length;
      } else {
        // closedAtEof: `this.end` never matched, so it never popped the frame.
        // Emit a zero-width close of the scope node and pop it ourselves.
        children.push(
          new Matched(this.node, pos, 0, undefined, Wrapping.END),
        );
        state.stack.pop();
      }
    }

    if (children.length === 0) {
      return null;
    }
    return new Matched(GrammarNode.None, lineFrom, totalLength, children);
  }

  begin(state: GrammarState, from: number) {
    let beginMatched = this.beginRule.match(state, from);
    if (!beginMatched) {
      return null;
    }
    const captures = [""];
    beginMatched.children?.forEach((c) => {
      captures.push(state.str.slice(c.from, c.from + c.length));
    });
    beginMatched = beginMatched.wrap(this.node, Wrapping.BEGIN);
    this.contentRule.resolve();
    state.stack.push(this.node, captures);
    return beginMatched;
  }

  end(state: GrammarState, from: number) {
    const begin = state.stack.at(-1);
    const beginCaptures = begin?.beginCaptures;
    if (beginCaptures) {
      this.endRule.matcher.backReferences = beginCaptures;
    }
    let endMatched = this.endRule.match(state, from);
    if (!endMatched) {
      return null;
    }
    endMatched = endMatched.wrap(this.node, Wrapping.END);
    state.stack.pop();
    return endMatched;
  }

  content(state: GrammarState, from: number) {
    return this.contentRule.match(state, from);
  }
}
