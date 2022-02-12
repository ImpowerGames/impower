/* eslint-disable no-continue */
import {
  Input,
  NodeProp,
  NodeSet,
  NodeType,
  Parser,
  ParseWrapper,
  PartialParse,
  TreeFragment,
} from "@lezer/common";
import { BlockResult } from "../types/blockResult";
import { LeafBlockParser } from "../types/leafBlockParser";
import { MarkdownExtension } from "../types/markdownExtension";
import { NodeSpec } from "../types/nodeSpec";
import { Type } from "../types/type";
import { findName, nonEmpty, resolveConfig } from "../utils/markdown";
import { BlockContext } from "./BlockContext";
import { CompositeBlock } from "./CompositeBlock";
import { Element } from "./Element";
import { InlineContext } from "./InlineContext";
import { LeafBlock } from "./LeafBlock";
import { Line } from "./Line";

/// A Markdown parser configuration.
export class MarkdownParser extends Parser {
  /// @internal
  nodeTypes: { [name: string]: number } = Object.create(null);

  /// @internal
  constructor(
    /// The parser's syntax [node
    /// types](https://lezer.codemirror.net/docs/ref/#common.NodeSet).
    readonly nodeSet: NodeSet,
    /// @internal
    readonly blockParsers: readonly (
      | ((cx: BlockContext, line: Line) => BlockResult)
      | undefined
    )[],
    /// @internal
    readonly leafBlockParsers: readonly (
      | ((cx: BlockContext, leaf: LeafBlock) => LeafBlockParser | null)
      | undefined
    )[],
    /// @internal
    readonly blockNames: readonly string[],
    /// @internal
    readonly endLeafBlock: readonly ((
      cx: BlockContext,
      line: Line
    ) => boolean)[],
    /// @internal
    readonly skipContextMarkup: {
      readonly [type: number]: (
        bl: CompositeBlock,
        cx: BlockContext,
        line: Line
      ) => boolean;
    },
    /// @internal
    readonly inlineParsers: readonly (
      | ((cx: InlineContext, next: number, pos: number) => number)
      | undefined
    )[],
    /// @internal
    readonly inlineNames: readonly string[],
    /// @internal
    readonly wrappers: readonly ParseWrapper[]
  ) {
    super();
    for (let i = 0; i < nodeSet.types.length; i += 1) {
      const t = nodeSet.types[i];
      this.nodeTypes[t.name] = t.id;
    }
  }

  createParse(
    input: Input,
    fragments: readonly TreeFragment[],
    ranges: readonly { from: number; to: number }[]
  ): PartialParse {
    let parse: PartialParse = new BlockContext(this, input, fragments, ranges);
    for (let i = 0; i < this.wrappers.length; i += 1) {
      const w = this.wrappers[i];
      parse = w(parse, input, fragments, ranges);
    }
    return parse;
  }

  /// Reconfigure the parser.
  configure(spec: MarkdownExtension): MarkdownParser {
    const config = resolveConfig(spec);
    if (!config) {
      return this;
    }
    let { nodeSet, skipContextMarkup } = this;
    const blockParsers = this.blockParsers.slice();
    const leafBlockParsers = this.leafBlockParsers.slice();
    const blockNames = this.blockNames.slice();
    const inlineParsers = this.inlineParsers.slice();
    const inlineNames = this.inlineNames.slice();
    const endLeafBlock = this.endLeafBlock.slice();
    let { wrappers } = this;

    if (nonEmpty(config.defineNodes)) {
      skipContextMarkup = { ...skipContextMarkup };
      const nodeTypes = nodeSet.types.slice();
      for (let i = 0; i < config.defineNodes.length; i += 1) {
        const s = config.defineNodes[i];
        const { name, block, composite }: NodeSpec =
          typeof s === "string" ? { name: s } : s;
        if (nodeTypes.some((t) => t.name === name)) {
          continue;
        }
        if (composite)
          (skipContextMarkup as unknown)[nodeTypes.length] = (
            bl: CompositeBlock,
            cx: BlockContext,
            line: Line
          ): boolean => composite?.(cx, line, bl.value);
        const id = nodeTypes.length;
        const group = composite
          ? ["Block", "BlockContext"]
          : !block
          ? undefined
          : id >= Type.ATXHeading1 && id <= Type.SetextHeading2
          ? ["Block", "LeafBlock", "Heading"]
          : ["Block", "LeafBlock"];
        nodeTypes.push(
          NodeType.define({
            id,
            name,
            props: group && [[NodeProp.group, group]],
          })
        );
      }
      nodeSet = new NodeSet(nodeTypes);
    }

    if (nonEmpty(config.props)) nodeSet = nodeSet.extend(...config.props);

    if (nonEmpty(config.remove)) {
      for (let i = 0; i < config.remove.length; i += 1) {
        const rm = config.remove[i];
        const block = this.blockNames.indexOf(rm);
        const inline = this.inlineNames.indexOf(rm);
        if (block > -1) {
          blockParsers[block] = undefined;
          leafBlockParsers[block] = undefined;
        }
        if (inline > -1) {
          inlineParsers[inline] = undefined;
        }
      }
    }

    if (nonEmpty(config.parseBlock)) {
      for (let i = 0; i < config.parseBlock.length; i += 1) {
        const spec = config.parseBlock[i];
        const found = blockNames.indexOf(spec.name);
        if (found > -1) {
          blockParsers[found] = spec.parse;
          leafBlockParsers[found] = spec.leaf;
        } else {
          const pos = spec.before
            ? findName(blockNames, spec.before)
            : spec.after
            ? findName(blockNames, spec.after) + 1
            : blockNames.length - 1;
          blockParsers.splice(pos, 0, spec.parse);
          leafBlockParsers.splice(pos, 0, spec.leaf);
          blockNames.splice(pos, 0, spec.name);
        }
        if (spec.endLeaf) endLeafBlock.push(spec.endLeaf);
      }
    }

    if (nonEmpty(config.parseInline)) {
      for (let i = 0; i < config.parseInline.length; i += 1) {
        const spec = config.parseInline[i];
        const found = inlineNames.indexOf(spec.name);
        if (found > -1) {
          inlineParsers[found] = spec.parse;
        } else {
          const pos = spec.before
            ? findName(inlineNames, spec.before)
            : spec.after
            ? findName(inlineNames, spec.after) + 1
            : inlineNames.length - 1;
          inlineParsers.splice(pos, 0, spec.parse);
          inlineNames.splice(pos, 0, spec.name);
        }
      }
    }

    if (config.wrap) {
      wrappers = wrappers.concat(config.wrap);
    }

    return new MarkdownParser(
      nodeSet,
      blockParsers,
      leafBlockParsers,
      blockNames,
      endLeafBlock,
      skipContextMarkup,
      inlineParsers,
      inlineNames,
      wrappers
    );
  }

  /// @internal
  getNodeType(name: string): number {
    const found = this.nodeTypes[name];
    if (found == null) {
      throw new RangeError(`Unknown node type '${name}'`);
    }
    return found;
  }

  /// Parse the given piece of inline text at the given offset,
  /// returning an array of [`Element`](#Element) objects representing
  /// the inline content.
  parseInline(text: string, offset: number): Element[] {
    const cx = new InlineContext(this, text, offset);
    let pos = offset;
    while (pos < cx.end) {
      const next = cx.char(pos);
      let skipIncrement = false;
      for (let i = 0; i < this.inlineParsers.length; i += 1) {
        const token = this.inlineParsers[i];
        if (token) {
          const result = token(cx, next, pos);
          if (result >= 0) {
            pos = result;
            skipIncrement = true;
            break;
          }
        }
      }
      if (!skipIncrement) {
        pos += 1;
      }
    }
    return cx.resolveMarkers(0);
  }
}
