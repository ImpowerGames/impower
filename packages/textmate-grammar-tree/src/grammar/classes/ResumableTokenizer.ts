/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NodeID } from "../../core/enums/NodeID";
import { type GrammarToken } from "../../core/types/GrammarToken";
import { Wrapping } from "../enums/Wrapping";
import { type Rule } from "../types/Rule";
import { Grammar } from "./Grammar";
import { type GrammarNode } from "./GrammarNode";
import { type CallFrame, GrammarState } from "./GrammarState";
import { type Matched } from "./Matched";
import { MatchRule } from "./rules/MatchRule";
import { ScopedRule } from "./rules/ScopedRule";
import { SwitchRule } from "./rules/SwitchRule";

const EMPTY_STEP_LIMIT = 100;

interface TokenizerFrame {
  rule: ScopedRule;

  openedAt: number;

  enteredAt: number;

  contentNodeIndex: number;

  contentOpened: boolean;

  contentDropped: boolean;

  wrapperNodes?: number[];
}

export interface TokenizerResumeScope {
  readonly node: GrammarNode;
  readonly beginCaptures: readonly string[];
  readonly beginCapturedLineBreak: boolean;
}

export interface TokenizerResumeFrame {
  readonly rule: ScopedRule;
  readonly enteredAtAbs: number;
  readonly contentNodeIndex: number;
  readonly contentOpened: boolean;
  readonly contentDropped: boolean;
  readonly wrapperNodes?: readonly number[];
}

export interface TokenizerResume {
  readonly stack: readonly TokenizerResumeScope[];
  readonly frames: readonly TokenizerResumeFrame[];
  openedAtAbs: number[];
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
  | { kind: "leaf"; matched: Matched }
  | { kind: "repeated" };

const REPEATED: DispatchResult = { kind: "repeated" };

const RECENT_RESUME_PARTS = 4;

export class ResumableTokenizer {
  declare grammar: Grammar;

  declare state: GrammarState;

  declare anchor: number;

  declare pos: number;

  declare frames: TokenizerFrame[];

  protected pending: GrammarToken | null = null;

  protected drained = false;

  protected lastSplitCheckPos = 0;

  protected emittedAtLineStart = -1;

  protected stoppedLine = false;

  protected rootRules?: Rule[];

  protected tokenizesCapture = false;

  protected stoppedAtRoot = false;

  protected retryingLineEnd = false;

  emitSplitSignals = false;

  protected recentStacks: (readonly TokenizerResumeScope[])[] = [];

  protected recentFrames: (readonly TokenizerResumeFrame[])[] = [];

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

  static tokenizeCapture(
    grammar: Grammar,
    rules: Rule[],
    text: string,
    from: number,
    offset: number,
    enclosing: CallFrame[],
  ): { tokens: GrammarToken[]; to: number } {
    const tokenizer = new ResumableTokenizer(grammar, () => "", offset);
    tokenizer.pos = from;
    tokenizer.rootRules = rules;
    tokenizer.tokenizesCapture = true;
    tokenizer.state.resetToLine(text, offset, enclosing);
    return tokenizer.tokenizeCaptureText(from);
  }

  protected tokenizeCaptureText(from: number): {
    tokens: GrammarToken[];
    to: number;
  } {
    const offset = this.anchor;
    const tokens: GrammarToken[] = [];
    if (from >= this.state.str.length) {
      this.tryTopLevel(tokens);
    }
    let emptySteps = 0;
    while (!this.drained && !this.stoppedAtRoot) {
      const step = this.step();
      for (let i = 0; i < step.tokens.length; i++) {
        tokens.push(step.tokens[i]!);
      }
      emptySteps = step.length === 0 ? emptySteps + 1 : 0;
      if (emptySteps > EMPTY_STEP_LIMIT && this.frames.length === 0) {
        this.stoppedAtRoot = true;
      }
    }
    const pending = this.flushPending();
    if (pending) {
      tokens.push(pending);
    }
    const end = offset + this.pos;
    const covered = tokens.length > 0 ? tokens[tokens.length - 1]![2] : offset + from;
    if (covered < end) {
      tokens.push([null, covered, end]);
    }
    return { tokens, to: this.pos };
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
        if (
          contentOf &&
          !contentOf.contentOpened &&
          !contentOf.contentDropped
        ) {
          t[3] ??= [];
          t[3].unshift(contentOf.contentNodeIndex);
          contentOf.contentOpened = true;
        }
      }
      this.pushToken(out, t);
    }
  }

  protected skipGap(out: GrammarToken[], frame: TokenizerFrame) {
    const from = this.pos;
    let str = this.state.str;
    const c = str.charCodeAt(from);
    let to = from + 1;
    if (c >= 0xd800 && c <= 0xdbff) {
      if (to >= str.length) {
        this.state.advance();
        str = this.state.str;
      }
      const low = str.charCodeAt(to);
      if (low >= 0xdc00 && low <= 0xdfff) {
        to++;
      }
    }
    this.pos = to;
    if (c === 10 || c === 13) {
      this.emitBatch(out, [[null, from, to]], frame);
      return;
    }
    const pending = this.pending;
    if (
      pending &&
      pending[0] === NodeID.unrecognized &&
      pending[2] === this.anchor + from &&
      !pending[4]
    ) {
      pending[2] = this.anchor + to;
      return;
    }
    this.emitBatch(out, [[NodeID.unrecognized, from, to]], frame);
  }

  protected forgetLineEntries() {
    for (let i = 0; i < this.frames.length; i++) {
      this.frames[i]!.enteredAt = -1;
    }
  }

  protected dropContent(frame: TokenizerFrame) {
    if (frame.contentDropped || !frame.rule.contentRule.node.props["name"]) {
      return;
    }
    this.closeContentWrapper(frame);
    frame.contentDropped = true;
  }

  protected isOpenedAt(rule: ScopedRule, pos: number) {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const frame = this.frames[i]!;
      if (frame.enteredAt !== pos) {
        return false;
      }
      if (frame.rule === rule) {
        return true;
      }
    }
    const enclosing = this.state.enclosing;
    for (let i = enclosing.length - 1; i >= 0; i--) {
      const frame = enclosing[i]!;
      if (frame.position !== pos) {
        return false;
      }
      if (frame.ruleId === rule.id) {
        return true;
      }
    }
    return false;
  }

  protected dispatch(rules: Rule[], pos: number): DispatchResult | null {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule) {
        continue;
      }
      if (rule instanceof ScopedRule) {
        if (this.isOpenedAt(rule, pos)) {
          const repeated = rule.beginRule.match(this.state, pos);
          if (!repeated) {
            continue;
          }
          if (repeated.length === 0) {
            return REPEATED;
          }
        } else if (this.state.possibleStackOverflow(rule.id, pos)) {
          continue;
        }
        this.state.enter(rule.id, pos, true);
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
          if (rule.emit && inner.kind !== "repeated") {
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
      if (rule instanceof MatchRule) {
        const matched = rule.match(this.state, pos);
        if (matched) {
          return { kind: "leaf", matched };
        }
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
      enteredAt: dispatchPos,
      contentNodeIndex:
        result.rule.contentNameTemplate === undefined
          ? result.rule.contentRule.node.typeIndex
          : result.rule.contentNodeFor(this.state.stack.at(-1)!.beginCaptures)
              .typeIndex,
      contentOpened: false,
      contentDropped: false,
      wrapperNodes: result.chain.length > 0 ? result.chain : undefined,
    });
  }

  protected closeContentWrapper(frame: TokenizerFrame) {
    if (frame.contentOpened && !frame.contentDropped && this.pending) {
      this.pending[4] ??= [];
      this.pending[4].push(frame.contentNodeIndex);
    }
  }

  protected popFrame() {
    const frame = this.frames.pop()!;
    this.state.exit(frame.rule.id, frame.openedAt);
    return frame;
  }

  protected tryEnd(out: GrammarToken[], mayStop = true): boolean {
    const frame = this.frames[this.frames.length - 1]!;
    const ending = frame.rule.matchEnd(this.state, this.pos);
    if (!ending) {
      return false;
    }
    if (
      mayStop &&
      ending.length === 0 &&
      frame.enteredAt === this.pos &&
      this.pos < this.state.str.length
    ) {
      this.dropContent(frame);
      this.stopLine(out);
      return true;
    }
    const endMatched = frame.rule.close(this.state, this.pos, ending);
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
    return true;
  }

  protected closeWithoutEnd() {
    const frame = this.frames[this.frames.length - 1]!;
    this.closeContentWrapper(frame);
    if (this.pending) {
      this.pending[4] ??= [];
      this.pending[4].push(
        frame.rule.nameTemplate === undefined
          ? frame.rule.node.typeIndex
          : frame.rule.nodeFor(this.state.stack.at(-1)!.beginCaptures)
              .typeIndex,
      );
      if (frame.wrapperNodes) {
        for (let i = frame.wrapperNodes.length - 1; i >= 0; i--) {
          this.pending[4].push(frame.wrapperNodes[i]!);
        }
      }
    }
    this.state.popScope(this.pos);
    this.popFrame();
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
    if (result.kind === "repeated") {
      this.stopLine(out);
      return true;
    }
    if (result.kind === "leaf") {
      this.emitBatch(out, result.matched.compile(), frame);
      if (result.matched.length === 0) {
        this.closeWithoutEnd();
        this.stopLine(out);
        return true;
      }
      this.pos += result.matched.length;
      return true;
    }
    this.emitBatch(out, result.matched.compile(), frame, result.chain);
    this.pos += result.matched.length;
    this.openFrame(result, dispatchPos);
    return true;
  }

  protected tryTopLevel(out: GrammarToken[]): DispatchResult | null {
    const dispatchPos = this.pos;
    const result = this.dispatch(
      this.rootRules ?? this.grammar.rules ?? [],
      dispatchPos,
    );
    if (!result) {
      return result;
    }
    if (result.kind === "repeated") {
      if (this.tokenizesCapture) {
        this.pos = this.state.str.length;
        this.stoppedAtRoot = true;
      }
      return result;
    }
    if (
      result.kind === "leaf" &&
      result.matched.length === 0 &&
      this.pos < this.state.str.length &&
      !this.retryingLineEnd
    ) {
      if (this.tokenizesCapture) {
        this.stoppedAtRoot = true;
        return result;
      }
      this.emitBatch(out, result.matched.compile(), null);
      this.stopLine(out);
      return result;
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
    return result;
  }

  protected endsLine(posBefore: number) {
    if (this.pos <= posBefore) {
      return false;
    }
    const str = this.state.str;
    const c = str.charCodeAt(this.pos - 1);
    return c === 10 || (c === 13 && str.charCodeAt(this.pos) !== 10);
  }

  protected retryEndAtLineEnd(
    out: GrammarToken[],
    frame: TokenizerFrame,
  ): boolean | null {
    if (frame.enteredAt === this.pos) {
      return frame.rule.endsAt(this.state, this.pos) ? false : null;
    }
    return this.tryEnd(out, false) ? true : null;
  }

  protected retryOnceAtLineEnd(out: GrammarToken[]): boolean {
    const frame = this.frames[this.frames.length - 1];
    const atCaptureEnd =
      this.tokenizesCapture && this.pos >= this.state.str.length;
    if (!frame) {
      return atCaptureEnd ? false : this.tryTopLevel(out)?.kind === "scope";
    }
    const rule = frame.rule;
    if (!rule.applyEndPatternLast || atCaptureEnd) {
      const ended = this.retryEndAtLineEnd(out, frame);
      if (ended != null || atCaptureEnd) {
        return ended ?? false;
      }
    }
    rule.contentRule.resolve();
    const result = this.dispatch(rule.contentRule.rules ?? [], this.pos);
    if (result?.kind === "repeated") {
      return false;
    }
    if (result?.kind === "scope") {
      this.emitBatch(out, result.matched.compile(), frame, result.chain);
      this.openFrame(result, this.pos);
      return true;
    }
    if (result) {
      this.emitBatch(out, result.matched.compile(), frame);
      this.closeWithoutEnd();
      return false;
    }
    if (rule.applyEndPatternLast) {
      return this.retryEndAtLineEnd(out, frame) ?? false;
    }
    return false;
  }

  protected retryAtLineEnd(out: GrammarToken[]) {
    const pending = this.pending;
    this.state.exhaustLineAt(this.pos);
    this.retryingLineEnd = true;
    let retrying = true;
    while (retrying) {
      retrying = this.retryOnceAtLineEnd(out);
    }
    this.retryingLineEnd = false;
    this.state.exhaustLineAt(-1);
    this.forgetLineEntries();
    if (this.pending !== pending) {
      this.emittedAtLineStart = this.pos;
    }
  }

  get emittedAtThisLineStart() {
    return this.pos === this.emittedAtLineStart;
  }

  snapshot(): TokenizerResume {
    const stack =
      recall(this.recentStacks, (scopes) => this.matchesStack(scopes)) ??
      remember(
        this.recentStacks,
        this.state.stack.stack.slice(1).map((el) => ({
          node: el.node,
          beginCaptures: el.beginCaptures.slice(),
          beginCapturedLineBreak: el.beginCapturedLineBreak,
        })),
      );
    const frames =
      recall(this.recentFrames, (parts) => this.matchesFrames(parts)) ??
      remember(
        this.recentFrames,
        this.frames.map((f) => ({
          rule: f.rule,
          enteredAtAbs: f.enteredAt < 0 ? -1 : this.anchor + f.enteredAt,
          contentNodeIndex: f.contentNodeIndex,
          contentOpened: f.contentOpened,
          contentDropped: f.contentDropped,
          wrapperNodes: f.wrapperNodes?.slice(),
        })),
      );
    const openedAtAbs = new Array<number>(this.frames.length);
    for (let i = 0; i < this.frames.length; i++) {
      openedAtAbs[i] = this.anchor + this.frames[i]!.openedAt;
    }
    return { stack, frames, openedAtAbs };
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
    for (let i = 0; i < resume.frames.length; i++) {
      const f = resume.frames[i]!;
      const openedAt = resume.openedAtAbs[i]! - this.anchor;
      this.frames.push({
        rule: f.rule,
        openedAt,
        enteredAt: f.enteredAtAbs < 0 ? -1 : f.enteredAtAbs - this.anchor,
        contentNodeIndex: f.contentNodeIndex,
        contentOpened: f.contentOpened,
        contentDropped: f.contentDropped,
        wrapperNodes: f.wrapperNodes?.slice(),
      });
      this.state.enter(f.rule.id, openedAt, true);
    }
    remember(this.recentStacks, resume.stack);
    remember(this.recentFrames, resume.frames);
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

  protected lineEndFrom(from: number) {
    let i = from;
    for (;;) {
      const str = this.state.str;
      while (i < str.length) {
        const c = str.charCodeAt(i);
        i++;
        if (c === 10) {
          return i;
        }
        if (c === 13) {
          if (i === str.length) {
            i--;
            break;
          }
          if (str.charCodeAt(i) !== 10) {
            return i;
          }
        }
      }
      const before = str.length;
      this.state.advance();
      if (this.state.str.length === before) {
        return before;
      }
    }
  }

  protected stopLine(out: GrammarToken[]) {
    const from = this.pos;
    this.pos = this.lineEndFrom(from);
    this.stoppedLine = true;
    const frame = this.frames[this.frames.length - 1];
    if (frame && this.pos > from) {
      this.emitBatch(out, [[null, from, this.pos]], frame);
    }
    this.forgetLineEntries();
  }

  step(): TokenizerStepResult {
    const posBefore = this.pos;
    const result = this.stepOnce();
    if (this.stoppedLine) {
      this.stoppedLine = false;
      return result;
    }
    if (this.endsLine(posBefore)) {
      this.retryAtLineEnd(this._stepTokens);
    }
    return result;
  }

  protected stepOnce(): TokenizerStepResult {
    const out = this._stepTokens;
    out.length = 0;
    const posBefore = this.pos;

    if (this.drained) {
      return this.finishStep(0, true);
    }

    if (!this.ensureText()) {
      if (this.frames.length > 0) {
        if (!this.tryEnd(out, false)) {
          this.closeWithoutEnd();
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
          this.state.str.charCodeAt(this.pos - 1) === 10 &&
          !this.emittedAtThisLineStart
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
      this.skipGap(out, frame);
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

  matchesResume(resume: Pick<TokenizerResume, "frames" | "stack">): boolean {
    return this.matchesFrames(resume.frames) && this.matchesStack(resume.stack);
  }

  protected matchesStack(scopes: readonly TokenizerResumeScope[]): boolean {
    const stack = this.state.stack.stack;
    if (scopes.length !== stack.length - 1) {
      return false;
    }
    for (let i = 0; i < scopes.length; i++) {
      const a = stack[i + 1]!;
      const b = scopes[i]!;
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
    return true;
  }

  protected matchesFrames(frames: readonly TokenizerResumeFrame[]): boolean {
    if (frames.length !== this.frames.length) {
      return false;
    }
    for (let i = 0; i < this.frames.length; i++) {
      const a = this.frames[i]!;
      const b = frames[i]!;
      if (a.rule !== b.rule) {
        return false;
      }
      if (a.contentNodeIndex !== b.contentNodeIndex) {
        return false;
      }
      if (a.contentOpened !== b.contentOpened) {
        return false;
      }
      if (a.contentDropped !== b.contentDropped) {
        return false;
      }
      if (
        (a.enteredAt < 0 ? -1 : this.anchor + a.enteredAt) !== b.enteredAtAbs
      ) {
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
      (f) =>
        (f.wrapperNodes?.length ?? 0) +
        1 +
        (f.contentOpened && !f.contentDropped ? 1 : 0),
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

function recall<T>(recent: T[], matches: (part: T) => boolean): T | undefined {
  for (let i = 0; i < recent.length; i++) {
    const part = recent[i]!;
    if (matches(part)) {
      if (i > 0) {
        recent.splice(i, 1);
        recent.unshift(part);
      }
      return part;
    }
  }
  return undefined;
}

function remember<T>(recent: T[], part: T): T {
  recent.unshift(part);
  if (recent.length > RECENT_RESUME_PARTS) {
    recent.length = RECENT_RESUME_PARTS;
  }
  return part;
}
