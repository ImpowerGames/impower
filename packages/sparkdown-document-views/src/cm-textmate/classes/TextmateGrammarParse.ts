/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  Input,
  NodeSet,
  PartialParse,
  Tree,
  TreeBuffer,
  TreeFragment,
} from "@lezer/common";

import { cachedCompilerProp } from "../props/cachedCompilerProp";
import { cachedAheadBufferProp } from "../props/cachedAheadBufferProp";
import { findProp } from "../utils/findProp";
import { printTree } from "../utils/printTree";
import { TextmateParseRegion } from "./TextmateParseRegion";
import { Grammar } from "../../../../grammar-compiler/src/grammar/classes/Grammar";
import { GrammarState } from "../../../../grammar-compiler/src/grammar/classes/GrammarState";
import { Compiler } from "../../../../grammar-compiler/src/compiler/classes/Compiler";
import { ChunkBuffer } from "../../../../grammar-compiler/src/compiler/classes/ChunkBuffer";
import { NodeID } from "../../../../grammar-compiler/src/core/enums/NodeID";
import { GrammarToken } from "../../../../grammar-compiler/src/core/types/GrammarToken";

/** Amount of characters to slice before the starting position of the parse. */
const MARGIN_BEFORE = 32;

/** Amount of characters to slice after the requested ending position of a parse. */
const MARGIN_AFTER = 128;

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
  private declare region: TextmateParseRegion;

  /** The current state of the grammar, such as the stack. */
  private declare state: GrammarState;

  private declare compiler: Compiler;

  /**
   * A buffer containing the stale _ahead_ state of the tokenized output.
   * As in, when a user makes a change, this is all of the tokenization
   * data for the previous document after the location of that new change.
   */
  private declare aheadBuffer?: ChunkBuffer;

  /** The current position of the parser. */
  declare parsedPos: number;

  /**
   * The position the parser will be stopping at early, if given a location
   * to stop at.
   */
  declare stoppedAt: number | null;

  /** The current performance value, in milliseconds. */
  declare performance?: number;

  private consecutiveEmptyMatchCount = 0;

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

    if (fragments) {
      // find cached chunks, if possible
      for (let idx = 0; idx < fragments.length; idx++) {
        const f = fragments[idx]!;
        // make sure fragment is within the region of the document we care about
        if (f.from <= this.region.from && f.to >= this.region.from) {
          // try to find the buffer for this fragment's tree in the cache
          const cachedCompiler = findProp<Compiler>(
            cachedCompilerProp,
            f.tree,
            this.region.from,
            f.to
          );
          const cachedAheadBuffer = findProp<ChunkBuffer>(
            cachedAheadBufferProp,
            f.tree,
            this.region.from,
            f.to
          );
          if (cachedCompiler) {
            const right = this.tryToReuseBehind(cachedCompiler);
            if (right) {
              if (!this.tryToSaveAhead(right)) {
                if (
                  !this.aheadBuffer &&
                  !this.region.edit?.offset &&
                  cachedAheadBuffer
                ) {
                  this.aheadBuffer = cachedAheadBuffer;
                }
              }
            }
          }
        }
      }
    }

    this.parsedPos = this.region.from;

    // if we couldn't reuse state, we'll need to startup things with a default state
    if (!this.compiler || !this.state) {
      this.state = this.grammar.startState();
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

    if (this.aheadBuffer) {
      // TRY TO REUSE STATE AHEAD OF EDITED RANGE
      const reused = this.tryToReuseAhead(this.aheadBuffer);
      if (reused) {
        // can't reuse the buffer more than once (pointless)
        this.aheadBuffer = undefined;
      }
    }

    this.compiler.step();

    if (this.done) {
      return this.finish();
    }

    return null;
  }

  private finish(): Tree {
    const nodeSet = this.nodeSet;
    const topID = NodeID.top;

    const start = this.region.original.from;
    const to = Math.min(this.region.original.length, this.parsedPos);
    const length = to - start;

    const result = this.compiler.finish(length);

    if (result) {
      const buffer = result.cursor;
      const reused = result.reused.map(
        (b) => new TreeBuffer(b.buffer, b.length, nodeSet)
      ) as unknown as readonly Tree[];
      // build tree from buffer
      const tree = Tree.build({
        topID,
        buffer,
        nodeSet,
        reused,
        start,
        length,
      });
      // console.log(printTree(tree, region.input));
      // bit of a hack (private properties)
      // this is so that we don't need to build another tree
      const props = Object.create(null);
      // @ts-ignore
      props[cachedCompilerProp.id] = compiler;
      // @ts-ignore
      props[cachedAheadBufferProp.id] = aheadBuffer;
      // @ts-ignore
      tree.props = props;

      return tree;
    }
    const topNode = this.compiler.grammar.nodes[topID];
    const topNodeType = topNode?.props["nodeType"];
    return new Tree(topNodeType, [], [], length);
  }

  /** Advances the parser to the next chunk. */
  private nextChunk() {
    // this condition is a little misleading,
    // as we're actually going to break out when any chunk is emitted.
    // however, if we're at the "last chunk", this condition catches that
    while (this.parsedPos < this.region.to) {
      const pos = this.parsedPos;

      const start = Math.max(pos - MARGIN_BEFORE, this.region.from);
      const startCompensated = this.region.compensate(pos, start - pos);

      const str = this.region.read(
        startCompensated,
        MARGIN_AFTER,
        this.region.to
      );

      const match = this.grammar.match(this.state, str, pos - start, pos, true);

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

      if (matchLength === 0) {
        this.consecutiveEmptyMatchCount += 1;
      } else {
        this.consecutiveEmptyMatchCount = 0;
      }
      if (this.consecutiveEmptyMatchCount > 100) {
        console.warn(
          "Possible infinite loop!",
          JSON.stringify(matchTokens.map((t) => t[0]))
        );
        matchLength = 1;
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
          if (this.compiler.buffer.add(t)) {
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
   * Tries to reuse chunks BEHIND the edited range.
   * Returns true if this was successful, otherwise false.
   *
   * @param cachedBuffer - The buffer to split in two
   */
  private tryToReuseBehind(compiler: Compiler) {
    if (!this.region.edit) {
      // can't reuse if we don't know what range has been edited
      return null;
    }
    const splitBehind = compiler.buffer.findBehindSplitPoint(
      this.region.edit.from
    );
    if (splitBehind.chunk && splitBehind.index != null) {
      // REUSE CHUNKS THAT ARE BEHIND THE EDITED RANGE
      // console.warn(
      //   "EDITED",
      //   this.region.edit.from,
      //   this.region.edit.to,
      //   this.region.edit.offset
      // );
      // console.log(
      //   "BUFFER AFTER EDIT",
      //   compiler.buffer?.chunks.map((chunk) => [
      //     chunk.from,
      //     chunk.to,
      //     chunk.scopes?.map((n) => this.nodeSet.types[n]?.name),
      //     chunk.opens?.map((n) => this.nodeSet.types[n]?.name),
      //     chunk.closes?.map((n) => this.nodeSet.types[n]?.name),
      //     this.region.input.read(chunk.from, chunk.to),
      //   ]),
      //   splitBehind.index
      // );
      const right = compiler.rewind(splitBehind.index);
      // console.log(
      //   "REUSE BEHIND",
      //   JSON.stringify(
      //     this.region.input.read(
      //       compiler.buffer.first!.from,
      //       compiler.buffer.last!.to
      //     )
      //   )
      // );
      this.region.from = splitBehind.chunk.from;
      this.state = this.grammar.startState();
      this.compiler = compiler;
      return right;
    }
    return null;
  }

  /**
   * Tries to save chunks AHEAD of the edited range.
   * Returns true if this was successful, otherwise false.
   *
   * @param cachedBuffer - The buffer to split in two
   */
  private tryToSaveAhead(right: ChunkBuffer) {
    if (!this.region.edit) {
      // can't reuse if we don't know what range has been edited
      return false;
    }
    // SAVE CHUNKS THAT ARE AHEAD OF THE EDITED RANGE
    // (must offset ahead chunks to match edited offset)

    right.slide(0, this.region.edit.offset, true);

    const splitAhead = right.findAheadSplitPoint(this.region.edit.to);

    // console.log(
    //   "RIGHT CHUNKS",
    //   right?.chunks.map((chunk) => [
    //     chunk.from,
    //     chunk.to,
    //     chunk.scopes?.map((n) => this.nodeSet.types[n]?.name),
    //     chunk.opens?.map((n) => this.nodeSet.types[n]?.name),
    //     chunk.closes?.map((n) => this.nodeSet.types[n]?.name),
    //     this.region.input.read(chunk.from, chunk.to),
    //   ]),
    //   splitAhead.index
    // );

    if (splitAhead.chunk && splitAhead.index != null) {
      const aheadSplitBuffer = right.split(splitAhead.index);
      this.aheadBuffer = aheadSplitBuffer.right;
      // console.log(
      //   "SAVE AHEAD",
      //   JSON.stringify(
      //     this.region.input.read(splitAhead.chunk.from, this.region.to)
      //   )
      // );
      return true;
    }
    return false;
  }

  /**
   * Tries to reuse chunks AHEAD of the edited range.
   * Returns true if this was successful, otherwise false.
   *
   * @param aheadBuffer - The buffer to try and reuse.
   */
  private tryToReuseAhead(aheadBuffer: ChunkBuffer) {
    const firstChunk = aheadBuffer.first;
    if (firstChunk) {
      const pos = this.parsedPos;
      const reusablePos = firstChunk.from;
      // console.log("REUSABLE?", pos, "===", reusablePos, pos === reusablePos);
      if (pos === reusablePos) {
        // console.log(
        //   "REUSE AHEAD",
        //   JSON.stringify(
        //     this.region.input.read(firstChunk.from, this.region.to)
        //   )
        // );
        this.compiler.append(aheadBuffer);
        this.state = this.grammar.startState();
        this.parsedPos = this.compiler.buffer.last!.to;
        return true;
      }
    }
    return false;
  }
}
