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
  ChunkBuffer,
  Compiler,
} from "../../../../grammar-compiler/src/compiler";
import { GrammarToken, NodeID } from "../../../../grammar-compiler/src/core";
import {
  Grammar,
  GrammarState,
} from "../../../../grammar-compiler/src/grammar";

import { printTree } from "../utils/printTree";
import LezerParseRegion from "./LezerParseRegion";

/** Amount of characters to slice before the starting position of the parse. */
const MARGIN_BEFORE = 32;

/** Amount of characters to slice after the requested ending position of a parse. */
const MARGIN_AFTER = 128;

/** If true, the "left" (previous) side of a parse will be reused. */
const REUSE_LEFT = true;

const STATE_PROP = new NodeProp<ChunkBuffer>({ perNode: true });

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
  private declare previousRight?: ChunkBuffer;

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
    this.grammar = grammar;
    this.nodeSet = nodeSet;
    this.stoppedAt = null;

    this.region = new LezerParseRegion(input, ranges, fragments);

    // find cached data, if possible
    if (REUSE_LEFT && fragments?.length) {
      for (let idx = 0; idx < fragments.length; idx++) {
        const f = fragments[idx]!;
        // make sure fragment is within the region of the document we care about
        if (f.from > this.region.from || f.to < this.region.from) {
          continue;
        }

        // try to find the buffer for this fragment's tree in the cache
        const buffer = this.find(f.tree, this.region.from, f.to);

        if (buffer) {
          const editFrom = this.region.edit!.from;
          // console.log(
          //   "ALL CHUNKS",
          //   buffer?.chunks.map((chunk) => [
          //     input.read(chunk.from, chunk.to),
          //     chunk.from,
          //     chunk.open?.map((n) => this.nodeSet.types[n]?.name),
          //     chunk.close?.map((n) => this.nodeSet.types[n]?.name),
          //     chunk.scopes?.map((n) => this.nodeSet.types[n]?.name),
          //   ])
          // );
          const { chunk, index } = buffer.findPreviousUnscopedChunk(editFrom);
          // console.log("editFrom", editFrom);
          // console.log("splitAt", index);
          if (chunk && index !== null) {
            // split the buffer, reuse the left side
            const { left } = buffer.split(index);
            // console.log(
            //   "REUSE CHUNKS",
            //   left?.chunks.map((chunk) => [
            //     input.read(chunk.from, chunk.to),
            //     chunk.from,
            //     chunk.open?.map((n) => this.nodeSet.types[n]?.name),
            //     chunk.close?.map((n) => this.nodeSet.types[n]?.name),
            //     chunk.scopes?.map((n) => this.nodeSet.types[n]?.name),
            //   ])
            // );
            this.region.from = chunk.from;
            this.buffer = left;
            this.state = this.grammar.startState();
          }
        }
      }
    }

    this.parsedPos = this.region.from;

    // if we couldn't reuse state, we'll need to startup things with a default state
    if (!this.buffer || !this.state) {
      this.buffer = new ChunkBuffer();
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
      console.log(printTree(tree, this.region.input));
      // bit of a hack (private properties)
      // this is so that we don't need to build another tree
      const props = Object.create(null);
      // @ts-ignore
      props[STATE_PROP.id] = this.buffer;
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

      let matchTokens: GrammarToken[] | null = null;
      let length = 0;

      const start = Math.max(pos - MARGIN_BEFORE, this.region.from);
      const startCompensated = this.region.compensate(pos, start - pos);

      const str = this.region.read(
        startCompensated,
        MARGIN_AFTER,
        this.region.to
      );

      const match = this.grammar.match(this.state, str, pos - start, pos, true);

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

      for (let idx = 0; idx < matchTokens!.length; idx++) {
        const t = matchTokens![idx]!;

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
  private find(
    tree: Tree,
    from: number,
    to: number,
    offset = 0
  ): ChunkBuffer | null {
    const bundle: ChunkBuffer | undefined =
      offset >= from && offset + tree.length >= to
        ? tree.prop(STATE_PROP)
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
      const found = this.find(child, from, to, pos);
      if (found) {
        return found;
      }
    }

    return null;
  }
}
