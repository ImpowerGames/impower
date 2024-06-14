/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  Input,
  NodeProp,
  NodeSet,
  PartialParse,
  Tree,
  TreeBuffer,
  TreeFragment,
} from "@lezer/common";

import {
  Chunk,
  ChunkBuffer,
  Compiler,
} from "../../../../grammar-compiler/src/compiler";
import { GrammarToken, NodeID } from "../../../../grammar-compiler/src/core";
import {
  Grammar,
  GrammarState,
} from "../../../../grammar-compiler/src/grammar";

import LezerParseRegion from "./LezerParseRegion";
import { printTree } from "../utils/printTree";

/** Amount of characters to slice before the starting position of the parse. */
const MARGIN_BEFORE = 32;

/** Amount of characters to slice after the requested ending position of a parse. */
const MARGIN_AFTER = 128;

const BUFFER_PROP = new NodeProp<ChunkBuffer>({ perNode: true });

const AHEAD_BUFFER_PROP = new NodeProp<ChunkBuffer>({ perNode: true });

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
export default class GrammarParse implements PartialParse {
  /** The host grammar. */
  declare grammar: Grammar;

  /** The set of CodeMirror NodeTypes in the grammar. */
  declare nodeSet: NodeSet;

  /**
   * An object storing details about the region of the document to be
   * parsed, where it was edited, the length, etc.
   */
  private declare region: LezerParseRegion;

  /** The current state of the grammar, such as the stack. */
  private declare state: GrammarState;

  /** {@link Chunk} buffer, where matched tokens are cached. */
  private declare buffer: ChunkBuffer;

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

    this.region = new LezerParseRegion(input, ranges, fragments);

    if (fragments) {
      // find cached chunks, if possible
      for (let idx = 0; idx < fragments.length; idx++) {
        const f = fragments[idx]!;
        // make sure fragment is within the region of the document we care about
        if (f.from <= this.region.from && f.to >= this.region.from) {
          // try to find the buffer for this fragment's tree in the cache
          const cachedBehindBuffer = this.findProp(
            BUFFER_PROP,
            f.tree,
            this.region.from,
            f.to
          );
          const cachedAheadBuffer = this.findProp(
            AHEAD_BUFFER_PROP,
            f.tree,
            this.region.from,
            f.to
          );
          if (cachedBehindBuffer) {
            const right = this.tryToReuseBehind(cachedBehindBuffer);
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
    if (!this.buffer || !this.state) {
      this.buffer = new ChunkBuffer(
        [],
        this.nodeSet.types.map((n) => n.name)
      );
      this.state = this.grammar.startState();
    }

    this.compiler = new Compiler(grammar, this.buffer);

    // if we reused left, we'll catch the compiler up to the current position
    if (this.buffer.chunks.length) {
      this.compiler.advanceFully();
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
    this.compiler.step();

    if (this.done) {
      return this.finish();
    }

    return null;
  }

  private finish(): Tree {
    const start = this.region.original.from;
    const length = this.region.original.length;

    const result = this.compiler.finish(length);

    if (result) {
      const topID = NodeID.top;
      const buffer = result.cursor;
      const reused = result.reused.map(
        (b) => new TreeBuffer(b.buffer, b.length, this.nodeSet)
      ) as unknown as readonly Tree[];
      const nodeSet = this.nodeSet;
      // build tree from buffer
      const tree = Tree.build({
        topID,
        buffer,
        nodeSet,
        reused,
        start,
        length,
      });
      // console.log(printTree(tree, this.region.input));
      // bit of a hack (private properties)
      // this is so that we don't need to build another tree
      const props = Object.create(null);
      // @ts-ignore
      props[BUFFER_PROP.id] = this.buffer;
      // @ts-ignore
      props[AHEAD_BUFFER_PROP.id] = this.aheadBuffer;
      // @ts-ignore
      tree.props = props;

      return tree;
    }
    const topNode = this.grammar.nodes[NodeID.top];
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
      let length = 0;

      if (match) {
        matchTokens = match.compile();
        length = match.length;
      } else {
        // if we didn't match, we'll advance to prevent getting stuck
        matchTokens = [[NodeID.unrecognized, pos, pos + 1]];
        length = 1;
      }

      this.parsedPos = this.region.compensate(pos, length);

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

          if (this.buffer.add(t)) {
            addedChunk = true;
          }
        }
      }

      // console.log(
      //   "PARSED",
      //   JSON.stringify(this.region.input.read(pos, this.parsedPos)),
      //   this.parsedPos,
      //   this.aheadBuffer
      // );

      if (this.aheadBuffer) {
        // TRY TO REUSE STATE AHEAD OF EDITED RANGE
        const reused = this.tryToReuseAhead(this.aheadBuffer);
        if (reused) {
          // can't reuse the buffer more than once (pointless)
          this.aheadBuffer = undefined;
        }
      }

      if (addedChunk) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns the first chunk buffer found within a tree, if any.
   *
   * @param tree - The tree to search through, recursively.
   * @param from - The start of the search area.
   * @param to - The end of the search area.
   * @param offset - An offset added to the tree's positions, so that they
   *   may match some other source's positions.
   */
  private findProp(
    prop: NodeProp<ChunkBuffer>,
    tree: Tree,
    from: number,
    to: number,
    offset = 0
  ): ChunkBuffer | null {
    const bundle: ChunkBuffer | undefined =
      offset >= from && offset + tree.length >= to
        ? tree.prop(prop)
        : undefined;

    if (bundle) {
      return bundle;
    }

    // recursively check children
    for (let i = tree.children.length - 1; i >= 0; i--) {
      const child = tree.children[i];
      const pos = offset + tree.positions[i]!;
      if (!(child instanceof Tree && pos < to)) {
        continue;
      }
      const found = this.findProp(prop, child, from, to, pos);
      if (found) {
        return found;
      }
    }

    return null;
  }

  /**
   * Tries to reuse chunks BEHIND the edited range.
   * Returns true if this was successful, otherwise false.
   *
   * @param cachedBuffer - The buffer to split in two
   */
  private tryToReuseBehind(cachedBuffer: ChunkBuffer) {
    if (!this.region.edit) {
      // can't reuse if we don't know what range has been edited
      return null;
    }
    const editedFrom = this.region.edit.from;
    const splitBehind = cachedBuffer.findBehindSplitPoint(editedFrom);
    // console.log(
    //   "CACHED BUFFER",
    //   cachedBuffer?.chunks.map((chunk) => [
    //     this.region.input.read(chunk.from, chunk.to),
    //     chunk.from,
    //     chunk.scopes?.map((n) => this.nodeSet.types[n]?.name),
    //     chunk.opens?.map((n) => this.nodeSet.types[n]?.name),
    //     chunk.closes?.map((n) => this.nodeSet.types[n]?.name),
    //   ]),
    //   editedFrom,
    //   splitBehind
    // );
    if (splitBehind.chunk && splitBehind.index != null) {
      // REUSE CHUNKS THAT ARE BEHIND THE EDITED RANGE
      const { left, right } = cachedBuffer.split(splitBehind.index);
      // console.log(
      //   "REUSE BEHIND",
      //   JSON.stringify(
      //     left?.chunks
      //       .map((chunk) => this.region.input.read(chunk.from, chunk.to))
      //       .join("")
      //   )
      //   // left?.chunks.map((chunk) => [
      //   //   this.region.input.read(chunk.from, chunk.to),
      //   //   chunk.from,
      //   //   chunk.scopes?.map((n) => this.nodeSet.types[n]?.name),
      //   //   chunk.opens?.map((n) => this.nodeSet.types[n]?.name),
      //   //   chunk.closes?.map((n) => this.nodeSet.types[n]?.name),
      //   // ])
      // );
      this.region.from = splitBehind.chunk.from;
      this.state = this.grammar.startState();
      this.buffer = left;
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
    const editedTo = this.region.edit.to;
    const editedOffset = this.region.edit.offset;
    // SAVE CHUNKS THAT ARE AHEAD OF THE EDITED RANGE
    // (must offset ahead chunks to match edited offset)
    // TODO: doesn't work for subsequent reuses. (is it because we should use aheadBuffer from tree prop?)
    right.slide(0, editedOffset, true);
    // console.log(
    //   "RIGHT CHUNKS",
    //   editedTo,
    //   editedOffset,
    //   JSON.stringify(
    //     right?.chunks
    //       .map((chunk) => this.region.input.read(chunk.from, chunk.to))
    //       .join("")
    //   ),
    //   right?.chunks.map((chunk) => [
    //     this.region.input.read(chunk.from, chunk.to),
    //     chunk.from,
    //     chunk.scopes?.map((n) => this.nodeSet.types[n]?.name),
    //     chunk.opens?.map((n) => this.nodeSet.types[n]?.name),
    //     chunk.closes?.map((n) => this.nodeSet.types[n]?.name),
    //   ])
    // );
    const splitAhead = right.findAheadSplitPoint(editedTo);
    if (splitAhead.chunk && splitAhead.index != null) {
      const aheadSplitBuffer = right.split(splitAhead.index);
      this.aheadBuffer = aheadSplitBuffer.right;
      // console.log(
      //   "SAVE AHEAD",
      //   editedTo,
      //   splitAhead.index,
      //   JSON.stringify(
      //     this.region.input.read(splitAhead.chunk.from, this.region.to)
      //   )
      //   // this.aheadBuffer?.chunks.map((chunk) => [
      //   //   this.region.input.read(chunk.from, chunk.to),
      //   //   chunk.from,
      //   //   chunk.scopes?.map((n) => this.nodeSet.types[n]?.name),
      //   //   chunk.opens?.map((n) => this.nodeSet.types[n]?.name),
      //   //   chunk.closes?.map((n) => this.nodeSet.types[n]?.name),
      //   // ])
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
        //   // this.aheadBuffer?.chunks.map((chunk) => [
        //   //   this.region.input.read(chunk.from, chunk.to),
        //   //   chunk.from,
        //   //   chunk.scopes?.map((n) => this.nodeSet.types[n]?.name),
        //   //   chunk.opens?.map((n) => this.nodeSet.types[n]?.name),
        //   //   chunk.closes?.map((n) => this.nodeSet.types[n]?.name),
        //   // ])
        // );
        this.buffer.append(aheadBuffer, this.region.original.length);
        this.state = this.grammar.startState();
        this.parsedPos = this.buffer.last!.to;
        return true;
      }
    }
    return false;
  }
}
