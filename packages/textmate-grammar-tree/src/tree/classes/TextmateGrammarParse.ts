import {
  type Input,
  NodeSet,
  type PartialParse,
  Tree,
  TreeBuffer,
  TreeFragment,
} from "@lezer/common";
import { Compiler } from "../../compiler/classes/Compiler";
import { NodeID } from "../../core/enums/NodeID";
import { Grammar } from "../../grammar/classes/Grammar";
import { ResumableTokenizer } from "../../grammar/classes/ResumableTokenizer";
import { cachedCompilerProp } from "../props/cachedCompilerProp";
import { TextmateParseRegion } from "./TextmateParseRegion";

export class TextmateGrammarParse implements PartialParse {
  declare grammar: Grammar;

  declare nodeSet: NodeSet;

  declare protected region: TextmateParseRegion;

  declare protected compiler: Compiler;

  declare protected tokenizer: ResumableTokenizer;

  declare parsedPos: number;

  declare stoppedAt: number | null;

  declare performance?: number;

  protected consecutiveEmptyMatchCount = 0;

  constructor(
    grammar: Grammar,
    nodeSet: NodeSet,
    input: Input,
    fragments: readonly TreeFragment[],
    ranges: { from: number; to: number }[],
    lookaheadStart?: (input: Input, pos: number) => number,
  ) {

    this.grammar = grammar;
    this.nodeSet = nodeSet;
    this.stoppedAt = null;

    this.region = new TextmateParseRegion(input, ranges, fragments);

    if (fragments && this.region.edit) {
      for (let idx = 0; idx < fragments.length; idx++) {
        const f = fragments[idx]!;
        const cachedCompiler = Object.values(
          (f.tree as any).props as any[],
        ).find((v) => v instanceof Compiler);
        if (cachedCompiler) {
          const stampedEpoch = (f.tree as any).__compilerEpoch;
          if (
            stampedEpoch !== undefined &&
            stampedEpoch !== cachedCompiler.reuseEpoch
          ) {
            break;
          }
          const restartFrom = cachedCompiler.reuse(
            this.region.edit.from,
            this.region.edit.to,
            this.region.edit.offset,
            lookaheadStart && ((pos) => lookaheadStart(input, pos)),
          );
          if (restartFrom != null) {
            this.region.from = restartFrom;
            this.compiler = cachedCompiler;
          }
          break;
        }
      }
    }

    this.parsedPos = this.region.from;

    if (!this.compiler) {
      this.compiler = new Compiler(grammar);
    }

    const resume = this.compiler.resumeState;
    this.compiler.resumeState = undefined;
    const base =
      resume && resume.frames.length > 0
        ? Math.min(resume.frames[0]!.openedAtAbs, this.region.from)
        : this.region.from;
    const anchor = this.findLineStart(base);

    this.tokenizer = new ResumableTokenizer(
      grammar,
      (pos: number) => this.region.next(pos),
      anchor,
    );
    if (resume) {
      this.tokenizer.restore(resume, this.region.from);
    } else if (this.region.from > anchor) {
      this.tokenizer.skip(this.region.from - anchor);
    }
    this.tokenizer.emitSplitSignals = this.region.from > 0 || !!this.region.edit;
  }

  get done() {
    return this.parsedPos >= this.region.to && !this.tokenizer.hasOpenFrames;
  }

  stopAt(pos: number) {
    this.region.to = pos;
    this.stoppedAt = pos;
  }

  advance(): Tree | null {
    if (
      this.stoppedAt &&
      this.parsedPos >= this.stoppedAt &&
      !this.tokenizer.hasOpenFrames
    ) {
      return this.finish();
    }

    this.nextChunk();

    const reused = this.tryToReuseAhead();
    if (reused) {
      this.compiler.ahead = undefined;
    }

    this.compiler.step();

    if (this.done) {
      return this.finish();
    }

    return null;
  }

  protected finish(): Tree {
    const pending = this.tokenizer.flushPending();
    if (pending) {
      this.compiler.add(pending);
    }

    const nodeSet = this.nodeSet;
    const topID = NodeID.top;

    const start = this.region.original.from;
    const to = Math.min(this.region.original.length, this.parsedPos);
    const length = to - start;

    this.compiler.settleReparsedFrom();
    const result = this.compiler.finish(length);

    if (result) {
      const buffer = result.cursor;
      const reused = result.reused.map(
        (b) => new TreeBuffer(b.buffer, b.length, nodeSet),
      ) as unknown as readonly Tree[];
      const maxBufferLength = result.maxBufferLength;
      const tree = Tree.build({
        topID,
        buffer,
        nodeSet,
        reused,
        start,
        length,
        maxBufferLength,
      });
      // workaround(@lezer/common): Tree offers no public way to attach a NodeProp after construction, so the private props field is written directly
      const props = Object.create(null);
      props[(cachedCompilerProp as any).id] = this.compiler;
      (tree as any).props = props;
      (tree as any).__compilerEpoch = this.compiler.reuseEpoch;

      return tree;
    }
    const topNode = this.compiler.grammar.nodes[topID];
    const topNodeType = topNode?.props["nodeType"];
    return new Tree(topNodeType, [], [], length);
  }

  protected findLineStart(pos: number): number {
    let from = pos;
    while (from > 0) {
      const start = Math.max(0, from - 1024);
      const text = this.region.input.read(start, from);
      const idx = text.lastIndexOf("\n");
      if (idx >= 0) {
        return start + idx + 1;
      }
      from = start;
    }
    return 0;
  }

  protected flushPendingIntoCompiler() {
    const pending = this.tokenizer.flushPending();
    if (pending) {
      this.compiler.add(pending);
    }
  }

  protected advanceTokenizerTo(absolutePos: number) {
    const delta = absolutePos - this.tokenizer.absolutePos;
    if (delta > 0) {
      this.tokenizer.skip(delta);
    }
  }

  protected lastStepFrom = -1;

  protected aheadEndsInRegion(): boolean {
    return (this.compiler.ahead?.last?.to ?? 0) <= this.region.to;
  }

  protected tryPureSplice(): boolean {
    const ahead = this.compiler.ahead;
    if (!ahead?.first || !this.region.contiguous) {
      return false;
    }
    if (!this.tokenizer.flushableNow || this.tokenizer.done) {
      return false;
    }
    const pos = this.parsedPos;
    if (pos === this.lastStepFrom) {
      return false;
    }
    if (pos > ahead.first.from) {
      const splitAhead = ahead.findAheadSplitPoint(pos - 1);
      if (!splitAhead.chunk || splitAhead.index == null) {
        return false;
      }
      this.compiler.ahead = ahead.split(splitAhead.index).right;
    }
    const first = this.compiler.ahead!.first;
    if (
      !first ||
      first.from !== pos ||
      !first.startsPure ||
      !this.aheadEndsInRegion() ||
      pos === 0 ||
      this.region.input.read(pos - 1, pos) !== "\n"
    ) {
      return false;
    }
    this.flushPendingIntoCompiler();
    this.compiler.append(this.compiler.ahead!);
    this.compiler.ahead = undefined;
    this.advanceTokenizerTo(this.compiler.packet.last!.to);
    this.parsedPos = this.compiler.packet.last!.to;
    return true;
  }

  protected tryImpureSplice(): boolean {
    const ahead = this.compiler.ahead;
    const first = ahead?.first;
    if (!ahead || !first) {
      return false;
    }
    if (!this.region.contiguous) {
      return false;
    }
    if ((ahead.last?.to ?? 0) < this.region.to) {
      return false;
    }
    if (!this.tokenizer.hasOpenFrames || this.tokenizer.done) {
      return false;
    }
    if (
      first.startsPure ||
      !first.spliceSafe ||
      !first.resume ||
      !first.entrySeeds
    ) {
      return false;
    }
    if (this.parsedPos !== first.from) {
      return false;
    }
    if (!this.tokenizer.atFreshPosition) {
      return false;
    }
    if (!this.tokenizer.matchesResume(first.resume)) {
      return false;
    }

    this.flushPendingIntoCompiler();
    const arriving = this.compiler.packet.last;
    const seeds = first.entrySeeds;
    const seedLen = seeds.ids.length;
    if (!arriving || arriving.stack.length !== seedLen) {
      return false;
    }
    const deltas: number[] = [];
    const trueAbs: number[] = [];
    for (let i = 0; i < seedLen; i++) {
      if (arriving.stack.ids[i] !== seeds.ids[i]) {
        return false;
      }
      deltas.push(arriving.stack.children[i]! - seeds.children[i]!);
      trueAbs.push(arriving.from + (arriving.stack.positions[i]! | 0));
    }

    const frameOpenPositions = this.tokenizer.frameOpenPositions();
    const frameGroupSizes = this.tokenizer.frameGroupSizes();
    this.compiler.packet.clearScheduledSplit();
    const startIndex = this.compiler.packet.chunks.length;
    this.compiler.append(ahead);
    this.compiler.spliceFixup(
      startIndex,
      deltas,
      trueAbs,
      frameOpenPositions,
      frameGroupSizes,
    );
    this.compiler.ahead = undefined;
    this.parsedPos = this.compiler.packet.last!.to;
    this.tokenizer.finishAfterSplice();
    return true;
  }

  protected nextChunk() {
    while (
      this.parsedPos < this.region.to ||
      (this.tokenizer.hasOpenFrames && !this.tokenizer.done)
    ) {
      if (this.tryImpureSplice() || this.tryPureSplice()) {
        return true;
      }

      const pos = this.parsedPos;
      this.lastStepFrom = pos;

      const step = this.tokenizer.step();
      let matchLength = step.length;

      if (step.splitAt) {
        this.compiler.packet.scheduleSplit(
          step.splitAt.at,
          step.splitAt.resume,
        );
      }

      if (matchLength === 0) {
        this.consecutiveEmptyMatchCount += 1;
      } else {
        this.consecutiveEmptyMatchCount = 0;
      }
      if (this.consecutiveEmptyMatchCount > 100 && this.tokenizer.flushableNow) {
        matchLength += 1;
        this.tokenizer.skip(1);
        console.warn(
          `Possible infinite loop at pos=${pos}!`,
          JSON.stringify(this.region.input.read(Math.max(0, pos - 100), pos)),
        );
      }

      this.parsedPos = this.region.compensate(pos, matchLength);

      let addedChunk = false;

      for (let idx = 0; idx < step.tokens.length; idx++) {
        const t = step.tokens[idx]!;

        if (!this.region.contiguous) {
          const from = this.region.compensate(pos, t[1] - pos);
          const end = this.region.compensate(pos, t[2] - pos);
          t[1] = from;
          t[2] = end;
        }

        if (this.compiler.add(t)) {
          addedChunk = true;
        }
      }

      if (addedChunk) {
        return true;
      }

      if (step.done) {
        break;
      }
    }

    return false;
  }

  protected tryToReuseAhead() {
    if (this.compiler.ahead) {
      if (!this.tokenizer.flushableNow) {
        return false;
      }
      if (this.compiler.ahead.first) {
        if (
          this.parsedPos === this.compiler.ahead.first.from &&
          this.compiler.ahead.first.startsPure &&
          this.aheadEndsInRegion()
        ) {
          this.flushPendingIntoCompiler();
          this.compiler.append(this.compiler.ahead);
          this.advanceTokenizerTo(this.compiler.packet.last!.to);
          this.parsedPos = this.compiler.packet.last!.to;
          return true;
        } else if (this.parsedPos > this.compiler.ahead.first.from) {
          const splitAhead = this.compiler.ahead.findAheadSplitPoint(
            this.parsedPos,
          );
          if (splitAhead.chunk && splitAhead.index != null) {
            const aheadSplitBuffer = this.compiler.ahead.split(
              splitAhead.index,
            );
            this.compiler.ahead = aheadSplitBuffer.right;
            if (
              this.parsedPos === this.compiler.ahead.first?.from &&
              this.compiler.ahead.first.startsPure &&
              this.aheadEndsInRegion()
            ) {
              this.flushPendingIntoCompiler();
              this.compiler.append(this.compiler.ahead);
              this.advanceTokenizerTo(this.compiler.packet.last!.to);
              this.parsedPos = this.compiler.packet.last!.to;
              return true;
            }
          }
        }
      }
    }
    return false;
  }
}
