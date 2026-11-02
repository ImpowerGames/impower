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

const EMPTY_MATCH_LIMIT = 10;

interface TokenizerFrame {
  rule: ScopedRule;

  openedAt: number;

  contentNodeIndex: number;

  contentOpened: boolean;

  emptyMatchCount: number;

  wrapperNodes?: number[];
}

export interface TokenizerResume {
  stack: {
    node: GrammarNode;
    beginCaptures: string[];
    beginCapturedLineBreak: boolean;
  }[];
  frames: {
    rule: ScopedRule;
    openedAtAbs: number;
    contentNodeIndex: number;
    contentOpened: boolean;
    emptyMatchCount: number;
    wrapperNodes?: number[];
  }[];
}

export interface TokenizerStepResult {
  tokens: GrammarToken[];

  length: number;

  done: boolean;

  splitAt?: { at: number; resume: TokenizerResume };
}

type DispatchResult =
  | {
      kind: "scope";
      rule: ScopedRule;
      matched: Matched;
      chain: number[];
    }
  | { kind: "leaf"; matched: Matched };

export class ResumableTokenizer {
  declare grammar: Grammar;

  declare state: GrammarState;

  declare anchor: number;

  declare pos: number;

  declare frames: TokenizerFrame[];

  protected pending: GrammarToken | null = null;

  protected drained = false;

  protected lastSplitCheckPos = 0;

  emitSplitSignals = false;

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

  get absolutePos() {
    return this.anchor + this.pos;
  }

  get done() {
    return this.drained;
  }

  get flushableNow() {
    return this.frames.length === 0;
  }

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

  protected pushToken(out: GrammarToken[], token: GrammarToken) {
    if (this.pending) {
      out.push(this.pending);
    }
    this.pending = token;
  }

  protected emitBatch(
    out: GrammarToken[],
    batch: GrammarToken[],
    contentOf: TokenizerFrame | null,
    openChain?: number[],
  ) {
    for (let i = 0; i < batch.length; i++) {
      const t = batch[i]!;
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
      const matched = rule.match(this.state, pos);
      if (matched) {
        return { kind: "leaf", matched };
      }
    }
    return null;
  }

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

  protected closeContentWrapper(frame: TokenizerFrame) {
    if (frame.contentOpened && this.pending) {
      this.pending[4] ??= [];
      this.pending[4].push(frame.contentNodeIndex);
    }
  }

  protected popFrame() {
    const frame = this.frames.pop()!;
    this.state.exit(frame.rule.id, frame.openedAt);
    return frame;
  }

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

  protected tryEnd(out: GrammarToken[], allowLimitClose = true): boolean {
    const frame = this.frames[this.frames.length - 1]!;
    const endMatched = frame.rule.end(this.state, this.pos);
    if (!endMatched) {
      return false;
    }
    this.closeContentWrapper(frame);
    this.emitBatch(out, endMatched.compile(), null);
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
    this.state.popScope(this.pos);
    this.popFrame();
    this.updateParentCounter(out, frame, !atEof);
  }

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
    this.emitBatch(out, result.matched.compile(), frame, result.chain);
    this.pos += result.matched.length;
    this.openFrame(result, dispatchPos);
    return true;
  }

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

  snapshot(): TokenizerResume {
    return {
      stack: this.state.stack.stack.slice(1).map((el) => ({
        node: el.node,
        beginCaptures: el.beginCaptures.slice(),
        beginCapturedLineBreak: el.beginCapturedLineBreak,
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

  restore(resume: TokenizerResume, restartAbs: number) {
    this.pos = restartAbs - this.anchor;
    this.lastSplitCheckPos = 0;
    const stack = this.state.stack;
    for (const el of resume.stack) {
      stack.push(
        el.node,
        el.beginCaptures.slice(),
        -1,
        el.beginCapturedLineBreak,
      );
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
      this.state.enter(f.rule.id, openedAt);
    }
  }

  protected _stepTokens: GrammarToken[] = [];
  protected _stepResult: TokenizerStepResult = {
    tokens: this._stepTokens,
    length: 0,
    done: false,
  };

  protected finishStep(
    length: number,
    done: boolean,
    splitAt?: TokenizerStepResult["splitAt"],
  ): TokenizerStepResult {
    const result = this._stepResult;
    result.length = length;
    result.done = done;
    result.splitAt = splitAt;
    return result;
  }

  step(): TokenizerStepResult {
    const out = this._stepTokens;
    out.length = 0;
    const posBefore = this.pos;

    if (this.drained) {
      return this.finishStep(0, true);
    }

    if (!this.ensureText()) {
      if (this.frames.length > 0) {
        if (!this.tryEnd(out, false)) {
          this.closeWithoutEnd(out, true);
        }
        return this.finishStep(this.pos - posBefore, false);
      }
      if (this.pending) {
        out.push(this.pending);
        this.pending = null;
      }
      this.drained = true;
      return this.finishStep(0, true);
    }

    if (this.frames.length > 0) {
      let splitAt: TokenizerStepResult["splitAt"];
      if (this.pos > this.lastSplitCheckPos) {
        this.lastSplitCheckPos = this.pos;
        if (
          this.emitSplitSignals &&
          this.state.str.charCodeAt(this.pos - 1) === 10
        ) {
          splitAt = { at: this.anchor + this.pos, resume: this.snapshot() };
        }
      }
      const frame = this.frames[this.frames.length - 1]!;
      const applyEndPatternLast = frame.rule.applyEndPatternLast;
      if (!applyEndPatternLast && this.tryEnd(out)) {
        return this.finishStep(this.pos - posBefore, false, splitAt);
      }
      if (this.tryContent(out)) {
        return this.finishStep(this.pos - posBefore, false, splitAt);
      }
      if (applyEndPatternLast && this.tryEnd(out)) {
        return this.finishStep(this.pos - posBefore, false, splitAt);
      }
      this.closeWithoutEnd(out, false);
      return this.finishStep(this.pos - posBefore, false, splitAt);
    }

    if (this.tryTopLevel(out)) {
      return this.finishStep(this.pos - posBefore, false);
    }

    this.pushToken(out, [
      NodeID.unrecognized,
      this.anchor + this.pos,
      this.anchor + this.pos + 1,
    ]);
    this.pos += 1;
    return this.finishStep(1, false);
  }

  skip(length: number) {
    this.pos += length;
  }

  flushPending(): GrammarToken | null {
    const token = this.pending;
    this.pending = null;
    return token;
  }

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
      if (a.beginCapturedLineBreak !== b.beginCapturedLineBreak) {
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

  frameOpenPositions(): number[] {
    return this.frames.map((f) => this.anchor + f.openedAt);
  }

  frameGroupSizes(): number[] {
    return this.frames.map(
      (f) => (f.wrapperNodes?.length ?? 0) + 1 + (f.contentOpened ? 1 : 0),
    );
  }

  get atFreshPosition() {
    return this.pos > this.lastSplitCheckPos;
  }

  finishAfterSplice() {
    this.pending = null;
    this.frames.length = 0;
    this.state.visited.length = 0;
    this.state.stack.close(1);
    this.drained = true;
  }
}
