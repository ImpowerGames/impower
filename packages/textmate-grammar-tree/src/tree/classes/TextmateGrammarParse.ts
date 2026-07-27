import {
  Input,
  NodeSet,
  PartialParse,
  Tree,
  TreeBuffer,
  TreeFragment,
} from "@lezer/common";
import { Compiler } from "../../compiler/classes/Compiler";
import { NodeID } from "../../core/enums/NodeID";
import { GrammarToken } from "../../core/types/GrammarToken";
import { Grammar } from "../../grammar/classes/Grammar";
import { ResumableTokenizer } from "../../grammar/classes/ResumableTokenizer";
import { cachedCompilerProp } from "../props/cachedCompilerProp";
import { TextmateParseRegion } from "./TextmateParseRegion";

/**
 * `Parse` is the main interface for tokenizing and parsing, and what
 * CodeMirror directly interacts with.
 *
 * Additionally, `Parse` handles the recovery of grammar state from
 * the stale trees provided by CodeMirror, and then uses this data to
 * restart tokenization with reused tokens.
 *
 * Note that `Parse` is not persistent a objects It is discarded as
 * soon as the parse is done. That means that its startup time is very significant.
 */
export class TextmateGrammarParse implements PartialParse {
  /** The host grammar. */
  declare grammar: Grammar;

  /** The set of CodeMirror NodeTypes in the grammar. */
  declare nodeSet: NodeSet;

  /**
   * An object storing details about the region of the document to be
   * parsed, where it was edited, the length, etc.
   */
  declare protected region: TextmateParseRegion;

  declare protected compiler: Compiler;

  /**
   * The persistent flat tokenizer. Replaces the per-call recursive
   * `grammar.match` so a parse can be suspended (and, with resume state,
   * restarted) at any token boundary instead of only between top-level
   * constructs.
   */
  declare protected tokenizer: ResumableTokenizer;

  /** The current position of the parser. */
  declare parsedPos: number;

  /**
   * The position the parser will be stopping at early, if given a location
   * to stop at.
   */
  declare stoppedAt: number | null;

  /** The current performance value, in milliseconds. */
  declare performance?: number;

  protected consecutiveEmptyMatchCount = 0;

  /**
   * @param language - The language containing the grammar to use.
   * @param input - The input document to parse.
   * @param fragments - The fragments to be used for determining reuse of
   *   previous parses.
   * @param ranges - The ranges of the document to parse.
   */
  constructor(
    grammar: Grammar,
    nodeSet: NodeSet,
    input: Input,
    fragments: readonly TreeFragment[],
    ranges: { from: number; to: number }[],
  ) {
    // console.log(
    //   "NEW PARSE",
    //   ranges.map((r) => input.read(r.from, r.to))
    // );

    this.grammar = grammar;
    this.nodeSet = nodeSet;
    this.stoppedAt = null;

    this.region = new TextmateParseRegion(input, ranges, fragments);

    if (fragments && this.region.edit) {
      // find cached chunks, if possible
      for (let idx = 0; idx < fragments.length; idx++) {
        const f = fragments[idx]!;
        // try to find the buffer for this fragment's tree in the cache
        const cachedCompiler = Object.values(
          (f.tree as any).props as any[],
        ).find((v) => v instanceof Compiler);
        if (cachedCompiler) {
          const restartFrom = cachedCompiler.reuse(
            this.region.edit.from,
            this.region.edit.to,
            this.region.edit.offset,
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

    // if we couldn't reuse state, we'll need to startup things with a default state
    if (!this.compiler) {
      this.compiler = new Compiler(grammar);
    }

    // When restarting from an in-scope split point, anchor the tokenizer's
    // text window at the OUTERMOST open scope's begin position (not the
    // restart point): lookbehind assertions evaluate against `state.str`,
    // and the original parse could see back to the construct's start.
    const resume = this.compiler.resumeState;
    this.compiler.resumeState = undefined;
    const anchor =
      resume && resume.frames.length > 0
        ? Math.min(resume.frames[0]!.openedAtAbs, this.region.from)
        : this.region.from;

    this.tokenizer = new ResumableTokenizer(
      grammar,
      (pos: number) => this.region.next(pos),
      anchor,
    );
    if (resume) {
      this.tokenizer.restore(resume, this.region.from);
    }
    // In-block split points are only minted on INCREMENTAL parses (ones
    // that restarted from a cached compiler): a from-scratch parse keeps
    // whole-block chunks so they stay TreeBuffer-convertible (fast initial
    // parse); the first edit inside a block reparses that block once and
    // mints its fine-grained restart points then.
    this.tokenizer.emitSplitSignals = this.region.from > 0 || !!this.region.edit;
  }

  /**
   * True if the parser is done. Open frames keep the parse alive past
   * `region.to` — the recursive matcher consumed a whole construct per
   * call, overshooting a `stopAt` boundary until the construct closed, and
   * the flat tokenizer must finish constructs the same way.
   */
  get done() {
    return this.parsedPos >= this.region.to && !this.tokenizer.hasOpenFrames;
  }

  /**
   * Notifies the parser to not progress past the given position.
   *
   * @param pos - The position to stop at.
   */
  stopAt(pos: number) {
    this.region.to = pos;
    this.stoppedAt = pos;
  }

  /** Advances tokenization one step. */
  advance(): Tree | null {
    // if we're told to stop, we need to BAIL — but only at the top level;
    // an open construct is always finished first (the recursive matcher
    // consumed whole constructs per call, overshooting the stop the same way)
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
      // can't reuse the ahead more than once (pointless)
      this.compiler.ahead = undefined;
    }

    this.compiler.step();

    if (this.done) {
      return this.finish();
    }

    return null;
  }

  protected finish(): Tree {
    // Flush the tokenizer's one-token lookbehind buffer. At true EOF the
    // step loop already drained it; this covers parses that end at a
    // stopAt/region boundary before EOF. The `done`/`stoppedAt` gates
    // guarantee no frames are open here, so the token can't receive any
    // more close markers.
    const pending = this.tokenizer.flushPending();
    if (pending) {
      this.compiler.add(pending);
    }

    const nodeSet = this.nodeSet;
    const topID = NodeID.top;

    const start = this.region.original.from;
    const to = Math.min(this.region.original.length, this.parsedPos);
    const length = to - start;

    const result = this.compiler.finish(length);

    if (result) {
      // console.log(
      //   "INCREMENTAL PARSE",
      //   this.compiler.buffer?.chunks.map((chunk) => [
      //     chunk.from,
      //     chunk.to,
      //     chunk.scopes?.map((n) => this.nodeSet.types[n]?.name),
      //     chunk.opens?.map((n) => this.nodeSet.types[n]?.name),
      //     chunk.closes?.map((n) => this.nodeSet.types[n]?.name),
      //     this.region.input.read(chunk.from, chunk.to),
      //   ])
      // );
      const buffer = result.cursor;
      const reused = result.reused.map(
        (b) => new TreeBuffer(b.buffer, b.length, nodeSet),
      ) as unknown as readonly Tree[];
      const maxBufferLength = result.maxBufferLength;
      // build tree from buffer
      const tree = Tree.build({
        topID,
        buffer,
        nodeSet,
        reused,
        start,
        length,
        maxBufferLength,
      });
      // console.log(printTree(tree, this.region.input));
      // console.warn("result", result, this.compiler, { from: start, to });
      // bit of a hack (private properties)
      // this is so that we don't need to build another tree
      const props = Object.create(null);
      props[(cachedCompilerProp as any).id] = this.compiler;
      (tree as any).props = props;

      return tree;
    }
    const topNode = this.compiler.grammar.nodes[topID];
    const topNodeType = topNode?.props["nodeType"];
    return new Tree(topNodeType, [], [], length);
  }

  /**
   * Flushes the tokenizer's held-back token into the compiler. Callers must
   * gate on `tokenizer.flushableNow` (no open frames) first.
   */
  protected flushPendingIntoCompiler() {
    const pending = this.tokenizer.flushPending();
    if (pending) {
      this.compiler.add(pending);
    }
  }

  /**
   * Jumps the tokenizer head to an absolute document position (used after
   * appending reused-ahead chunks, whose text was already parsed).
   */
  protected advanceTokenizerTo(absolutePos: number) {
    const delta = absolutePos - this.tokenizer.absolutePos;
    if (delta > 0) {
      this.tokenizer.skip(delta);
    }
  }

  /**
   * Tries to splice the reused-ahead chunks in MID-scope: when the head
   * arrives exactly at an in-scope split point whose recorded entry state
   * matches the tokenizer's current state, the old chunks' tokens are
   * exactly what re-tokenizing would produce — append them (with a fixup
   * of the child counts/positions their spanning scopes baked in) instead
   * of reparsing the rest of the block.
   */
  protected tryImpureSplice(): boolean {
    const ahead = this.compiler.ahead;
    const first = ahead?.first;
    if (!ahead || !first) {
      return false;
    }
    if (!this.region.contiguous) {
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
    // Must be BEFORE any step runs at this position — afterwards the new
    // stream already contains this position's tokens.
    if (!this.tokenizer.atFreshPosition) {
      return false;
    }
    if (!this.tokenizer.matchesResume(first.resume)) {
      return false;
    }

    // The entry states match, so the boundary's behavior is deterministic
    // and (spliceSafe) adds no retroactive close markers — flushing the
    // held-back token here is safe.
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

  /** Advances the parser to the next chunk. */
  protected nextChunk() {
    // this condition is a little misleading,
    // as we're actually going to break out when any chunk is emitted.
    // however, if we're at the "last chunk", this condition catches that.
    // Open frames keep the loop alive past `region.to` so a construct that
    // started inside the region is finished (or drained at EOF), matching
    // the recursive matcher's whole-construct overshoot.
    while (
      this.parsedPos < this.region.to ||
      (this.tokenizer.hasOpenFrames && !this.tokenizer.done)
    ) {
      if (this.tryImpureSplice()) {
        return true;
      }

      const pos = this.parsedPos;

      const step = this.tokenizer.step();
      let matchLength = step.length;

      if (step.splitAt) {
        // The tokenizer crossed a line boundary inside open scopes: split
        // the chunk stream there (before this batch's tokens are added —
        // the lookbehind-buffered token from before the boundary arrives
        // in this same batch) so a later edit can restart at the boundary.
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
        // Possible infinite loop! Skip a character to force progress — but
        // only at the top level: the recursive matcher's backstop always
        // fired between whole top-level matches, so the skipped character
        // must not land inside an open scope (it would widen the scope).
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

  /**
   * Tries to reuse chunks AHEAD of the edited range.
   * Returns true if this was successful, otherwise false.
   *
   * @param aheadBuffer - The buffer to try and reuse.
   */
  protected tryToReuseAhead() {
    if (this.compiler.ahead) {
      // Old chunks can only be spliced in at a top-level boundary. The
      // recursive matcher guaranteed this implicitly (parsedPos only ever
      // landed between whole top-level constructs); the stepping tokenizer
      // visits every token boundary, including positions inside an open
      // scope that happen to coincide with an old pure boundary — splicing
      // there would nest the old chunks into the open scope.
      if (!this.tokenizer.flushableNow) {
        return false;
      }
      // console.log("REUSABLE?", this.parsedPos, ">=", reusableFrom, pos >= reusableFrom);
      if (this.compiler.ahead.first) {
        if (
          this.parsedPos === this.compiler.ahead.first.from &&
          this.compiler.ahead.first.startsPure
        ) {
          this.flushPendingIntoCompiler();
          this.compiler.append(this.compiler.ahead);
          this.advanceTokenizerTo(this.compiler.packet.last!.to);
          this.parsedPos = this.compiler.packet.last!.to;
          // console.log(
          //   "REUSE AHEAD EXACTLY",
          //   JSON.stringify(
          //     this.region.input.read(
          //       this.compiler.ahead.first!.from,
          //       this.compiler.ahead.last!.to
          //     )
          //   )
          // );
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
              this.compiler.ahead.first.startsPure
            ) {
              this.flushPendingIntoCompiler();
              this.compiler.append(this.compiler.ahead);
              this.advanceTokenizerTo(this.compiler.packet.last!.to);
              this.parsedPos = this.compiler.packet.last!.to;
              // console.log(
              //   "REUSE AHEAD OVERSHOOT",
              //   JSON.stringify(
              //     this.region.input.read(
              //       this.compiler.ahead.first!.from,
              //       this.compiler.ahead.last!.to
              //     )
              //   )
              // );
              return true;
            }
            // console.log(
            //   "SAVE AHEAD",
            //   JSON.stringify(
            //     this.region.input.read(
            //       this.compiler.ahead.first!.from,
            //       this.compiler.ahead.last!.to
            //     )
            //   )
            // );
          }
        }
      }
    }
    return false;
  }
}
