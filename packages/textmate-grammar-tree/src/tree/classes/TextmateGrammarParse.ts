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
  protected declare region: TextmateParseRegion;

  protected declare compiler: Compiler;

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
    ranges: { from: number; to: number }[]
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
          (f.tree as any).props as any[]
        ).find((v) => v instanceof Compiler);
        if (cachedCompiler) {
          const restartFrom = cachedCompiler.reuse(
            this.region.edit.from,
            this.region.edit.to,
            this.region.edit.offset
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
  }

  /** True if the parser is done. */
  get done() {
    return this.parsedPos >= this.region.to;
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
    // if we're told to stop, we need to BAIL
    if (this.stoppedAt && this.parsedPos >= this.stoppedAt) {
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
        (b) => new TreeBuffer(b.buffer, b.length, nodeSet)
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

  /** Advances the parser to the next chunk. */
  protected nextChunk() {
    // this condition is a little misleading,
    // as we're actually going to break out when any chunk is emitted.
    // however, if we're at the "last chunk", this condition catches that
    while (this.parsedPos < this.region.to) {
      const pos = this.parsedPos;

      const start = Math.max(pos, this.region.from);
      const startCompensated = this.region.compensate(pos, start - pos);

      const next = (pos: number) => this.region.next(pos);

      const str = next(startCompensated);

      const match = this.grammar.match(str, next, pos - start, pos);

      let matchTokens: GrammarToken[] | null = null;
      let matchLength = 0;

      if (match) {
        matchTokens = match.compile();
        matchLength = match.length;
      } else {
        // if we didn't match, we'll advance to prevent getting stuck
        matchTokens = [[NodeID.unrecognized, pos, pos + 1]];
        matchLength = 1;
      }

      // console.log(
      //   "incremental parse match",
      //   pos,
      //   pos + matchLength,
      //   JSON.stringify(this.region.input.read(pos, pos + matchLength)),
      //   matchTokens?.map((t) => [
      //     this.grammar.nodeNames[t[0]!],
      //     JSON.stringify(this.region.input.read(t[1], t[2])),
      //     t[3]?.map((o) => this.grammar.nodeNames[o]).join(","),
      //     t[4]?.map((c) => this.grammar.nodeNames[c]).join(","),
      //   ])
      // );

      if (matchLength === 0) {
        this.consecutiveEmptyMatchCount += 1;
      } else {
        this.consecutiveEmptyMatchCount = 0;
      }
      if (this.consecutiveEmptyMatchCount > 100) {
        // Possible infinite loop!
        matchLength = 1;
        console.warn(
          "Possible infinite loop!",
          JSON.stringify(this.region.input.read(Math.max(0, pos - 100), pos))
        );
      }

      this.parsedPos = this.region.compensate(pos, matchLength);

      let addedChunk = false;

      if (matchTokens) {
        for (let idx = 0; idx < matchTokens.length; idx++) {
          const t = matchTokens[idx]!;

          if (!this.region.contiguous) {
            const from = this.region.compensate(pos, t[1] - pos);
            const end = this.region.compensate(pos, t[2] - pos);
            t[1] = from;
            t[2] = end;
          }

          // console.log(
          //   "TOKEN",
          //   this.grammar.nodes[t[0]!]?.typeId,
          //   JSON.stringify(this.region.input.read(t[1]!, t[2]!)),
          //   t[3]!,
          //   t[4]!,
          //   this.compiler.buffer.scopes
          // );
          if (this.compiler.add(t)) {
            addedChunk = true;
          }
        }
      }

      if (addedChunk) {
        return true;
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
      // console.log("REUSABLE?", this.parsedPos, ">=", reusableFrom, pos >= reusableFrom);
      if (this.compiler.ahead.first) {
        if (this.parsedPos === this.compiler.ahead.first.from) {
          this.compiler.append(this.compiler.ahead);
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
            this.parsedPos
          );
          if (splitAhead.chunk && splitAhead.index != null) {
            const aheadSplitBuffer = this.compiler.ahead.split(
              splitAhead.index
            );
            this.compiler.ahead = aheadSplitBuffer.right;
            if (this.parsedPos === this.compiler.ahead.first?.from) {
              this.compiler.append(this.compiler.ahead);
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
