/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeID } from "../../core/enums/NodeID";
import { type GrammarToken } from "../../core/types/GrammarToken";
import { Wrapping } from "../enums/Wrapping";
import { type Rule } from "../types/Rule";
import { Grammar } from "./Grammar";
import { type GrammarNode } from "./GrammarNode";
import { GrammarState } from "./GrammarState";
import { Matched } from "./Matched";
import { ScopedRule } from "./rules/ScopedRule";
import { SwitchRule } from "./rules/SwitchRule";

/** Must mirror the limit in {@link ScopedRule}. */
const EMPTY_MATCH_LIMIT = 10;

/**
 * One open scope tracked by the tokenizer. Parallel to an entry on
 * `GrammarState.stack` (which `ScopedRule.begin`/`end` push and pop):
 * `frames[i]` corresponds to `state.stack.at(i + 1)` (index 0 is the
 * stack's permanent None sentinel).
 */
interface TokenizerFrame {
  /** The scope rule this frame tracks. */
  rule: ScopedRule;

  /**
   * Position (relative to the tokenizer's anchor) the scope was dispatched
   * at — i.e. where `begin` STARTED matching. This is the `visited` key the
   * recursive matcher holds for the scope's whole lifetime, and the base
   * for measuring the scope's total consumed length at close.
   */
  openedAt: number;

  /** typeIndex of the scope's content wrapper node. */
  contentNodeIndex: number;

  /** Whether the content wrapper's open marker has been emitted yet. */
  contentOpened: boolean;

  /** Mirrors ScopedRule.match's consecutive empty-content-match counter. */
  emptyMatchCount: number;

  /**
   * Emitting SwitchRule nodes wrapped around this scope, outermost first.
   * The whole-block matcher wraps the scope's entire `Matched` in these on
   * the way out of `SwitchRule.pattern`; since a scope now spans many steps,
   * the wrapper opens are emitted with the begin tokens and the closes with
   * the end tokens.
   */
  wrapperNodes?: number[];
}

/**
 * Everything needed to resume tokenization at a line boundary inside open
 * scopes: the grammar scope stack (nodes + begin captures, for end-pattern
 * backreferences) plus the tokenizer's frame metadata. Positions are
 * document-absolute so the snapshot survives being carried on a cached
 * chunk across parses. Holds live rule/node references — this is an
 * in-process cache, never serialized.
 */
export interface TokenizerResume {
  stack: { node: GrammarNode; beginCaptures: string[] }[];
  frames: {
    rule: ScopedRule;
    openedAtAbs: number;
    contentNodeIndex: number;
    contentOpened: boolean;
    emptyMatchCount: number;
    wrapperNodes?: number[];
  }[];
}

/** Result of {@link ResumableTokenizer.step}. */
export interface TokenizerStepResult {
  /**
   * Tokens flushed by this step, with document-absolute positions. Because
   * the tokenizer holds back the most recent token (close markers may still
   * be added to it by a later step), a step's flushed tokens usually belong
   * to the PREVIOUS step's match.
   */
  tokens: GrammarToken[];

  /** How many characters this step consumed. */
  length: number;

  /** True once the tokenizer has fully drained (EOF reached, all flushed). */
  done: boolean;

  /**
   * Set when this step started at a line boundary inside open scopes: the
   * parse should split the chunk stream at `at` (document-absolute) and
   * store `resume` on the new chunk so a later parse can restart there.
   */
  splitAt?: { at: number; resume: TokenizerResume };
}

/** Internal result of dispatching rules at one position. */
type DispatchResult =
  | {
      kind: "scope";
      rule: ScopedRule;
      matched: Matched;
      /** Emitting switch nodes traversed to reach the scope, outermost first. */
      chain: number[];
    }
  | { kind: "leaf"; matched: Matched };

/**
 * A flat, stack-driven tokenizer that produces the exact token stream of the
 * recursive whole-block matcher (`Grammar.match` -> `ScopedRule.match`), but
 * one small step at a time.
 *
 * The recursive matcher consumes an entire `begin`...`end` scope in a single
 * call, which makes it impossible to restart a parse from inside a block —
 * the root cause of whole-block reparses on in-block edits. This class
 * replaces the recursion with an explicit frame stack (mirroring
 * `GrammarState.stack`), reusing the untouched rule primitives
 * (`ScopedRule.begin`/`content`/`end`, `MatchRule.match`) so every regex is
 * consulted in the same order at the same positions as the recursive path.
 *
 * Byte-identity invariants preserved (see matcherResumeSpike.test.ts):
 * - scope open markers ride the begin match's first token; closes ride the
 *   end match's last token (or the last emitted token for EOF closes);
 * - the content wrapper opens lazily on the first content token and closes
 *   retroactively on the last content token, which reproduces both the
 *   FULL (single child) and BEGIN/END (multi child) wrapping of
 *   `ScopedRule.match`;
 * - emitting SwitchRules wrap leaf matches inline, and scope matches via
 *   per-frame `wrapperNodes`;
 * - `applyEndPatternLast`, the empty-match limit (a nested scope updates
 *   its PARENT's counter at close time by its total consumed length, and
 *   the match that reaches the limit is dropped, not emitted), incomplete
 *   scopes, and unconditional close-at-EOF all follow `ScopedRule.match`.
 *
 * Divergences (deliberate):
 * - `ScopedRule.match` never pops `state.stack` when a scope closes as
 *   incomplete or at EOF — invisible there because the recursive path
 *   discards its `GrammarState` after every top-level match. This
 *   tokenizer's state is persistent, so it pops. Observable only via
 *   end-pattern backreferences following an incomplete sibling scope; the
 *   sparkdown grammar has no end-pattern backreferences.
 * - When a NESTED scope's close is what reaches the parent's empty-match
 *   limit, the recursive matcher retroactively drops that scope's entire
 *   (zero-width) token batch; this tokenizer has already emitted it. Only
 *   reachable with 10 consecutive zero-length nested-scope matches.
 *
 * To retroactively attach close markers, the most recent token is held in
 * `pending` and flushed one step late; `flushableNow` reports when it is
 * safe to force a flush (no close marker can ever target a token once the
 * frame stack is empty).
 */
export class ResumableTokenizer {
  declare grammar: Grammar;

  /** Persistent match state; `str` is anchored at {@link anchor}. */
  declare state: GrammarState;

  /** Document position that `state.str` index 0 corresponds to. */
  declare anchor: number;

  /** Current match position, relative to {@link anchor}. */
  declare pos: number;

  declare frames: TokenizerFrame[];

  /** One-token lookbehind buffer (close markers may still be added). */
  protected pending: GrammarToken | null = null;

  /** True once EOF was hit and every frame was drained. */
  protected drained = false;

  /** Highest position already checked for a line-boundary split. */
  protected lastSplitCheckPos = 0;

  constructor(
    grammar: Grammar,
    next: (absolutePos: number) => string,
    anchor: number,
  ) {
    this.grammar = grammar;
    this.anchor = anchor;
    this.pos = 0;
    this.frames = [];
    this.state = new GrammarState("", next, anchor);
  }

  get hasOpenFrames() {
    return this.frames.length > 0;
  }

  /** Absolute document position of the tokenizer head. */
  get absolutePos() {
    return this.anchor + this.pos;
  }

  get done() {
    return this.drained;
  }

  /**
   * True when the held-back token can be flushed safely: with no open
   * frames, nothing can retroactively add close markers to it.
   */
  get flushableNow() {
    return this.frames.length === 0;
  }

  /**
   * Ensures `state.str` covers the current position. Returns false at EOF.
   */
  protected ensureText(): boolean {
    while (this.pos >= this.state.str.length) {
      const before = this.state.str.length;
      this.state.advance();
      if (this.state.str.length === before) {
        return false;
      }
    }
    return true;
  }

  /** Buffers a token, flushing the previously buffered one. */
  protected pushToken(out: GrammarToken[], token: GrammarToken) {
    if (this.pending) {
      out.push(this.pending);
    }
    this.pending = token;
  }

  /**
   * Emits a compiled batch. `contentOf` is the frame whose content wrapper
   * should lazily open on the batch's first token; `openChain` is a list of
   * emitting-switch nodes to open in front of everything (outermost first).
   */
  protected emitBatch(
    out: GrammarToken[],
    batch: GrammarToken[],
    contentOf: TokenizerFrame | null,
    openChain?: number[],
  ) {
    for (let i = 0; i < batch.length; i++) {
      const t = batch[i]!;
      // make positions document-absolute
      t[1] += this.anchor;
      t[2] += this.anchor;
      if (i === 0) {
        if (openChain && openChain.length > 0) {
          t[3] ??= [];
          for (let j = openChain.length - 1; j >= 0; j--) {
            t[3].unshift(openChain[j]!);
          }
        }
        if (contentOf && !contentOf.contentOpened) {
          t[3] ??= [];
          t[3].unshift(contentOf.contentNodeIndex);
          contentOf.contentOpened = true;
        }
      }
      this.pushToken(out, t);
    }
  }

  /**
   * Rule dispatch at `pos` over a rule list, mirroring `SwitchRule.pattern`
   * and `Grammar.match`: first match wins; ScopedRules contribute only
   * their `begin` (the scope becomes a frame instead of a recursive call);
   * emitting switches wrap leaves inline and scopes via the returned chain.
   */
  protected dispatch(rules: Rule[], pos: number): DispatchResult | null {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule) {
        continue;
      }
      if (rule instanceof ScopedRule) {
        if (this.state.possibleStackOverflow(rule.id, pos)) {
          continue;
        }
        this.state.enter(rule.id, pos);
        const beginMatched = rule.begin(this.state, pos);
        if (!beginMatched) {
          this.state.exit(rule.id, pos);
          continue;
        }
        // NOTE: (rule.id, pos) stays entered — the recursive matcher keeps
        // it in `visited` for the scope's whole lifetime; exited on close.
        return { kind: "scope", rule, matched: beginMatched, chain: [] };
      }
      if (rule instanceof SwitchRule) {
        if (this.state.possibleStackOverflow(rule.id, pos)) {
          continue;
        }
        this.state.enter(rule.id, pos);
        rule.resolve();
        const inner = this.dispatch(rule.rules ?? [], pos);
        this.state.exit(rule.id, pos);
        if (inner) {
          if (rule.emit) {
            if (inner.kind === "leaf") {
              inner.matched = inner.matched.wrap(rule.node, Wrapping.FULL);
            } else {
              inner.chain.unshift(rule.node.typeIndex);
            }
          }
          return inner;
        }
        continue;
      }
      // MatchRule (and any other self-contained rule): match guards itself.
      const matched = rule.match(this.state, pos);
      if (matched) {
        return { kind: "leaf", matched };
      }
    }
    return null;
  }

  /** Opens a frame for a scope whose `begin` just matched at `dispatchPos`. */
  protected openFrame(
    result: Extract<DispatchResult, { kind: "scope" }>,
    dispatchPos: number,
  ) {
    this.frames.push({
      rule: result.rule,
      openedAt: dispatchPos,
      contentNodeIndex: result.rule.contentRule.node.typeIndex,
      contentOpened: false,
      emptyMatchCount: 0,
      wrapperNodes: result.chain.length > 0 ? result.chain : undefined,
    });
  }

  /** Closes the top frame's content wrapper on the held-back token. */
  protected closeContentWrapper(frame: TokenizerFrame) {
    if (frame.contentOpened && this.pending) {
      this.pending[4] ??= [];
      this.pending[4].push(frame.contentNodeIndex);
    }
  }

  /** Pops the top frame and rebalances the persistent `visited` list. */
  protected popFrame() {
    const frame = this.frames.pop()!;
    this.state.exit(frame.rule.id, frame.openedAt);
    return frame;
  }

  /**
   * After a nested scope closes, updates the parent frame's empty-match
   * counter by the scope's TOTAL consumed length — which is when the
   * recursive matcher's content loop sees the completed scope match.
   * `allowLimitClose` is false during the EOF drain: reaching the limit
   * there is indistinguishable from the parent's own EOF close, which the
   * drain performs next anyway.
   */
  protected updateParentCounter(
    out: GrammarToken[],
    closedFrame: TokenizerFrame,
    allowLimitClose: boolean,
  ) {
    const parent = this.frames[this.frames.length - 1];
    if (!parent) {
      return;
    }
    const scopeLength = this.pos - closedFrame.openedAt;
    if (scopeLength === 0) {
      parent.emptyMatchCount++;
      if (allowLimitClose && parent.emptyMatchCount >= EMPTY_MATCH_LIMIT) {
        console.warn(
          `[ScopedRule:${parent.rule.id}] Too many consecutive empty matches at pos=${this.absolutePos}. Possible infinite loop!`,
        );
        this.closeWithoutEnd(out, false);
      }
    } else {
      parent.emptyMatchCount = 0;
    }
  }

  /**
   * Tries to close the top frame with its `end` pattern. `ScopedRule.end`
   * resolves begin-capture backreferences from `state.stack` and pops it.
   */
  protected tryEnd(out: GrammarToken[], allowLimitClose = true): boolean {
    const frame = this.frames[this.frames.length - 1]!;
    const endMatched = frame.rule.end(this.state, this.pos);
    if (!endMatched) {
      return false;
    }
    this.closeContentWrapper(frame);
    this.emitBatch(out, endMatched.compile(), null);
    // scope close is on the batch's last token (END wrap); append the
    // emitting-switch closes after it, innermost -> outermost.
    if (frame.wrapperNodes && this.pending) {
      this.pending[4] ??= [];
      for (let i = frame.wrapperNodes.length - 1; i >= 0; i--) {
        this.pending[4].push(frame.wrapperNodes[i]!);
      }
    }
    this.popFrame();
    this.pos += endMatched.length;
    this.updateParentCounter(out, frame, allowLimitClose);
    return true;
  }

  /**
   * Closes the top frame without an `end` match: either as incomplete
   * (mid-input: emit the zero-width incomplete marker like
   * `ScopedRule.match`'s incomplete branch) or silently at EOF
   * (`closedAtEof`). Both close the content wrapper and the scope itself
   * on the last emitted token.
   */
  protected closeWithoutEnd(out: GrammarToken[], atEof: boolean) {
    const frame = this.frames[this.frames.length - 1]!;
    this.closeContentWrapper(frame);
    if (!atEof) {
      const incompleteMarker = Matched.create(
        this.grammar.nodes[NodeID.incomplete]!,
        this.pos,
        0,
      );
      this.emitBatch(out, incompleteMarker.compile(), null);
    }
    if (this.pending) {
      this.pending[4] ??= [];
      this.pending[4].push(frame.rule.node.typeIndex);
      if (frame.wrapperNodes) {
        for (let i = frame.wrapperNodes.length - 1; i >= 0; i--) {
          this.pending[4].push(frame.wrapperNodes[i]!);
        }
      }
    }
    // The recursive matcher leaks the `state.stack` entry on these paths
    // (harmless there — the state is discarded); pop it here since this
    // state is persistent.
    this.state.stack.pop();
    this.popFrame();
    this.updateParentCounter(out, frame, !atEof);
  }

  /** Tries to match content for the top frame. */
  protected tryContent(out: GrammarToken[]): boolean {
    const frame = this.frames[this.frames.length - 1]!;
    frame.rule.contentRule.resolve();
    const dispatchPos = this.pos;
    const result = this.dispatch(
      frame.rule.contentRule.rules ?? [],
      dispatchPos,
    );
    if (!result) {
      return false;
    }
    if (result.kind === "leaf") {
      if (result.matched.length === 0) {
        frame.emptyMatchCount++;
        if (frame.emptyMatchCount >= EMPTY_MATCH_LIMIT) {
          console.warn(
            `[ScopedRule:${frame.rule.id}] Too many consecutive empty matches at pos=${this.absolutePos}. Possible infinite loop!`,
          );
          // The recursive matcher breaks BEFORE pushing the match that
          // reaches the limit (it is dropped), then closes as incomplete.
          this.closeWithoutEnd(out, false);
          return true;
        }
      } else {
        frame.emptyMatchCount = 0;
      }
      this.emitBatch(out, result.matched.compile(), frame);
      this.pos += result.matched.length;
      return true;
    }
    // A nested scope's begin matched: emit its begin tokens as content of
    // this frame and push the new frame. The parent's empty-match counter
    // is updated when the nested scope CLOSES (by its total length).
    this.emitBatch(out, result.matched.compile(), frame, result.chain);
    this.pos += result.matched.length;
    this.openFrame(result, dispatchPos);
    return true;
  }

  /** Tries to match at the top level (no open frames). */
  protected tryTopLevel(out: GrammarToken[]): boolean {
    const dispatchPos = this.pos;
    const result = this.dispatch(this.grammar.rules ?? [], dispatchPos);
    if (!result) {
      return false;
    }
    this.emitBatch(
      out,
      result.matched.compile(),
      null,
      result.kind === "scope" ? result.chain : undefined,
    );
    this.pos += result.matched.length;
    if (result.kind === "scope") {
      this.openFrame(result, dispatchPos);
    }
    return true;
  }

  /**
   * Runs one small step of tokenization: at most one begin, one leaf/content
   * match, one end, or one frame close. Returns the flushed tokens and the
   * number of characters consumed.
   */
  /** Captures a document-absolute resume snapshot of the current state. */
  snapshot(): TokenizerResume {
    return {
      stack: this.state.stack.stack.slice(1).map((el) => ({
        node: el.node,
        beginCaptures: el.beginCaptures.slice(),
      })),
      frames: this.frames.map((f) => ({
        rule: f.rule,
        openedAtAbs: this.anchor + f.openedAt,
        contentNodeIndex: f.contentNodeIndex,
        contentOpened: f.contentOpened,
        emptyMatchCount: f.emptyMatchCount,
        wrapperNodes: f.wrapperNodes?.slice(),
      })),
    };
  }

  /**
   * Restores a mid-scope state captured by {@link snapshot} and moves the
   * head to `restartAbs`. The tokenizer must have been constructed with an
   * anchor at or before the outermost open scope's begin position so that
   * lookbehinds and `visited` keys see the same text window the original
   * parse saw (`state.str` is contiguous from the anchor).
   */
  restore(resume: TokenizerResume, restartAbs: number) {
    this.pos = restartAbs - this.anchor;
    this.lastSplitCheckPos = 0;
    const stack = this.state.stack;
    for (const el of resume.stack) {
      stack.push(el.node, el.beginCaptures.slice());
    }
    for (const f of resume.frames) {
      const openedAt = f.openedAtAbs - this.anchor;
      this.frames.push({
        rule: f.rule,
        openedAt,
        contentNodeIndex: f.contentNodeIndex,
        contentOpened: f.contentOpened,
        emptyMatchCount: f.emptyMatchCount,
        wrapperNodes: f.wrapperNodes?.slice(),
      });
      // The recursive matcher holds each open scope's (id, position) in
      // `visited` for the scope's whole lifetime.
      this.state.enter(f.rule.id, openedAt);
    }
  }

  step(): TokenizerStepResult {
    const out: GrammarToken[] = [];
    const posBefore = this.pos;

    if (this.drained) {
      return { tokens: out, length: 0, done: true };
    }

    if (!this.ensureText()) {
      // True EOF. Drain one frame per step: try the final end match first
      // (`(?=$)`-style closers can still fire), then close unconditionally.
      if (this.frames.length > 0) {
        if (!this.tryEnd(out, false)) {
          this.closeWithoutEnd(out, true);
        }
        return { tokens: out, length: this.pos - posBefore, done: false };
      }
      if (this.pending) {
        out.push(this.pending);
        this.pending = null;
      }
      this.drained = true;
      return { tokens: out, length: 0, done: true };
    }

    if (this.frames.length > 0) {
      // At the FIRST step on a new line inside open scopes, capture a
      // resume snapshot BEFORE any matching mutates the state: the parse
      // splits its chunk stream here so a later edit further down the
      // block can restart from this boundary instead of the block start.
      let splitAt: TokenizerStepResult["splitAt"];
      if (this.pos > this.lastSplitCheckPos) {
        this.lastSplitCheckPos = this.pos;
        if (this.state.str.charCodeAt(this.pos - 1) === 10 /* \n */) {
          splitAt = { at: this.anchor + this.pos, resume: this.snapshot() };
        }
      }
      const frame = this.frames[this.frames.length - 1]!;
      const applyEndPatternLast = frame.rule.applyEndPatternLast;
      if (!applyEndPatternLast && this.tryEnd(out)) {
        return { tokens: out, length: this.pos - posBefore, done: false, splitAt };
      }
      if (this.tryContent(out)) {
        return { tokens: out, length: this.pos - posBefore, done: false, splitAt };
      }
      if (applyEndPatternLast && this.tryEnd(out)) {
        return { tokens: out, length: this.pos - posBefore, done: false, splitAt };
      }
      // Neither content nor end matched mid-input: incomplete scope.
      this.closeWithoutEnd(out, false);
      return { tokens: out, length: this.pos - posBefore, done: false, splitAt };
    }

    if (this.tryTopLevel(out)) {
      return { tokens: out, length: this.pos - posBefore, done: false };
    }

    // Nothing matched at the top level: emit an unrecognized token and
    // advance one character (mirrors TextmateGrammarParse.nextChunk).
    this.pushToken(out, [
      NodeID.unrecognized,
      this.anchor + this.pos,
      this.anchor + this.pos + 1,
    ]);
    this.pos += 1;
    return { tokens: out, length: 1, done: false };
  }

  /**
   * Advances one character without emitting a token. Mirrors the
   * consecutive-empty-match backstop in `TextmateGrammarParse.nextChunk`,
   * which force-advances `parsedPos` without a covering token.
   */
  skip(length: number) {
    this.pos += length;
  }

  /**
   * Force-flushes the held-back token. Only safe when {@link flushableNow}
   * (callers gate on it); used before appending reused-ahead chunks so
   * token order in the packet stays monotonic, and by `finish()` to flush
   * the buffer when a parse ends before EOF (stopAt).
   */
  flushPending(): GrammarToken | null {
    const token = this.pending;
    this.pending = null;
    return token;
  }

  /**
   * True when the tokenizer's current state is EXACTLY the state recorded
   * in `resume` — same open scopes (rule identity), same begin captures,
   * same content-wrapper/emit-switch state, same empty-match counters.
   * Open positions are NOT compared: an edit shifts positions without
   * changing what the state means for the tokens ahead.
   *
   * This is the gate for splicing reused chunks in MID-scope: if the state
   * entering the old chunk matches, the old chunk's tokens are exactly
   * what re-tokenizing would produce.
   */
  matchesResume(resume: TokenizerResume): boolean {
    if (resume.frames.length !== this.frames.length) {
      return false;
    }
    const stack = this.state.stack.stack;
    if (resume.stack.length !== stack.length - 1) {
      return false;
    }
    for (let i = 0; i < resume.stack.length; i++) {
      const a = stack[i + 1]!;
      const b = resume.stack[i]!;
      if (a.node !== b.node) {
        return false;
      }
      if (a.beginCaptures.length !== b.beginCaptures.length) {
        return false;
      }
      for (let j = 0; j < a.beginCaptures.length; j++) {
        if (a.beginCaptures[j] !== b.beginCaptures[j]) {
          return false;
        }
      }
    }
    for (let i = 0; i < this.frames.length; i++) {
      const a = this.frames[i]!;
      const b = resume.frames[i]!;
      if (a.rule !== b.rule) {
        return false;
      }
      if (a.contentOpened !== b.contentOpened) {
        return false;
      }
      if (a.emptyMatchCount !== b.emptyMatchCount) {
        return false;
      }
      const aw = a.wrapperNodes;
      const bw = b.wrapperNodes;
      const awLen = aw?.length ?? 0;
      const bwLen = bw?.length ?? 0;
      if (awLen !== bwLen) {
        return false;
      }
      for (let j = 0; j < awLen; j++) {
        if (aw![j] !== bw![j]) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Document-absolute open positions of the current frames (bottom-up),
   * used to patch downstream resume snapshots after a mid-scope splice.
   */
  frameOpenPositions(): number[] {
    return this.frames.map((f) => this.anchor + f.openedAt);
  }

  /**
   * How many chunk-level stack entries each frame accounts for (emitting
   * switch wrappers + the scope node + the content wrapper if opened),
   * bottom-up — maps chunk-level seed prefixes back to whole frames.
   */
  frameGroupSizes(): number[] {
    return this.frames.map(
      (f) => (f.wrapperNodes?.length ?? 0) + 1 + (f.contentOpened ? 1 : 0),
    );
  }

  /**
   * True while no step has run at the current head position yet — i.e. the
   * state still describes ENTERING this position. A mid-scope splice must
   * happen at a fresh position: once a step runs, its tokens exist in the
   * new stream and splicing the old chunks would duplicate them.
   */
  get atFreshPosition() {
    return this.pos > this.lastSplitCheckPos;
  }

  /**
   * Retires the tokenizer after reused chunks were spliced in mid-scope:
   * the spliced chunks carry the remainder of the document (including the
   * close tokens for every open scope), so nothing further may be
   * tokenized. The caller must have flushed the pending token first.
   */
  finishAfterSplice() {
    this.pending = null;
    this.frames.length = 0;
    this.state.visited.length = 0;
    // keep only the permanent None sentinel
    this.state.stack.close(1);
    this.drained = true;
  }
}
