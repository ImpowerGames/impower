import {
  Input,
  PartialParse,
  Tree,
  TreeBuffer,
  TreeFragment,
} from "@lezer/common";
import { none } from "../constants/none";
import { Type } from "../types/type";
import { injectGaps } from "../utils/injectGaps";
import { injectMarks } from "../utils/injectMarks";
import { Buffer } from "./Buffer";
import { CompositeBlock } from "./CompositeBlock";
import { Element } from "./Element";
import { FragmentCursor } from "./FragmentCursor";
import { LeafBlock } from "./LeafBlock";
import { Line } from "./Line";
import { MarkdownParser } from "./MarkdownParser";
import { TreeElement } from "./TreeElement";

/// Block-level parsing functions get access to this context object.
export class BlockContext implements PartialParse {
  /// @internal
  block: CompositeBlock;

  /// @internal
  stack: CompositeBlock[];

  private line = new Line();

  private atEnd = false;

  private fragments: FragmentCursor | null;

  private to: number;

  /// @internal
  dontInject: Set<Tree> = new Set();

  stoppedAt: number | null = null;

  /// The start of the current line.
  lineStart: number;

  /// The absolute (non-gap-adjusted) position of the line @internal
  absoluteLineStart: number;

  /// The range index that absoluteLineStart points into @internal
  rangeI = 0;

  /// @internal
  absoluteLineEnd: number;

  /// @internal
  constructor(
    /// The parser configuration used.
    readonly parser: MarkdownParser,
    /// @internal
    readonly input: Input,
    fragments: readonly TreeFragment[],
    /// @internal
    readonly ranges: readonly { from: number; to: number }[]
  ) {
    this.to = ranges[ranges.length - 1].to;
    this.lineStart = ranges[0].from;
    this.absoluteLineStart = this.lineStart;
    this.absoluteLineEnd = this.lineStart;
    this.block = CompositeBlock.create(Type.Document, 0, this.lineStart, 0, 0);
    this.stack = [this.block];
    this.fragments = fragments.length
      ? new FragmentCursor(fragments, input)
      : null;
    this.readLine();
  }

  get parsedPos(): number {
    return this.absoluteLineStart;
  }

  advance(): Tree {
    if (this.stoppedAt != null && this.absoluteLineStart > this.stoppedAt) {
      return this.finish();
    }

    const { line } = this;
    for (;;) {
      while (line.depth < this.stack.length) {
        this.finishContext();
      }
      for (let i = 0; i < line.markers.length; i += 1) {
        const mark = line.markers[i];
        this.addNode(mark.type, mark.from, mark.to);
      }
      if (line.pos < line.text.length) {
        break;
      }
      // Empty line
      if (!this.nextLine()) {
        return this.finish();
      }
    }

    // TODO: This optimization breaks syntax highlighting in long documents
    // if (this.fragments && this.reuseFragment(line.basePos)) {
    //   return null;
    // }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let skipBreak = false;
      for (let i = 0; i < this.parser.blockParsers.length; i += 1) {
        const type = this.parser.blockParsers[i];
        if (type) {
          const result = type(this, line);
          if (result !== false) {
            if (result === true) {
              return null;
            }
            line.forward();
            skipBreak = true;
            break;
          }
        }
      }
      if (!skipBreak) {
        break;
      }
    }

    const leaf = new LeafBlock(
      this.lineStart + line.pos,
      line.text.slice(line.pos)
    );
    for (let i = 0; i < this.parser.leafBlockParsers.length; i += 1) {
      const parse = this.parser.leafBlockParsers[i];
      if (parse) {
        const parser = parse?.(this, leaf);
        if (parser) {
          leaf.parsers.push(parser);
        }
      }
    }
    while (this.nextLine()) {
      let breakTop = false;
      if (line.pos === line.text.length) {
        break;
      }
      if (line.indent < line.baseIndent + 4) {
        for (let i = 0; i < this.parser.endLeafBlock.length; i += 1) {
          const stop = this.parser.endLeafBlock[i];
          if (stop(this, line)) {
            breakTop = true;
            break;
          }
        }
        if (breakTop) {
          break;
        }
      }
      if (breakTop) {
        break;
      }
      for (let i = 0; i < leaf.parsers.length; i += 1) {
        const parser = leaf.parsers[i];
        if (parser.nextLine(this, line, leaf)) {
          return null;
        }
      }
      leaf.content += `\n${line.scrub()}`;
      for (let i = 0; i < line.markers.length; i += 1) {
        const m = line.markers[i];
        leaf.marks.push(m);
      }
    }
    this.finishLeaf(leaf);
    return null;
  }

  stopAt(pos: number): void {
    if (this.stoppedAt != null && this.stoppedAt < pos) {
      throw new RangeError("Can't move stoppedAt forward");
    }
    this.stoppedAt = pos;
  }

  private reuseFragment(start: number): boolean {
    if (
      !this.fragments?.moveTo(
        this.absoluteLineStart + start,
        this.absoluteLineStart
      ) ||
      !this.fragments?.matches(this.block.hash)
    ) {
      return false;
    }
    const taken = this.fragments?.takeNodes(this);
    if (!taken) {
      return false;
    }
    let withoutGaps = taken;
    const end = this.absoluteLineStart + taken;
    for (let i = 1; i < this.ranges.length; i += 1) {
      const gapFrom = this.ranges[i - 1].to;
      const gapTo = this.ranges[i].from;
      if (gapFrom >= this.lineStart && gapTo < end)
        withoutGaps -= gapTo - gapFrom;
    }
    this.lineStart += withoutGaps;
    this.absoluteLineStart += taken;
    this.moveRangeI();
    if (this.absoluteLineStart < this.to) {
      this.lineStart += 1;
      this.absoluteLineStart += 1;
      this.readLine();
    } else {
      this.atEnd = true;
      this.readLine();
    }
    return true;
  }

  /// Move to the next input line. This should only be called by
  /// (non-composite) [block parsers](#BlockParser.parse) that consume
  /// the line directly, or leaf block parser
  /// [`nextLine`](#LeafBlockParser.nextLine) methods when they
  /// consume the current line (and return true).
  nextLine(): boolean {
    this.lineStart += this.line.text.length;
    if (this.absoluteLineEnd >= this.to) {
      this.absoluteLineStart = this.absoluteLineEnd;
      this.atEnd = true;
      this.readLine();
      return false;
    }
    this.lineStart += 1;
    this.absoluteLineStart = this.absoluteLineEnd + 1;
    this.moveRangeI();
    this.readLine();
    return true;
  }

  private moveRangeI(): void {
    while (
      this.rangeI < this.ranges.length - 1 &&
      this.absoluteLineStart >= this.ranges[this.rangeI].to
    ) {
      this.rangeI += 1;
    }
  }

  /// @internal
  readLine(): void {
    const { line } = this;
    let text;
    let end = this.absoluteLineStart;
    if (this.atEnd) {
      text = "";
    } else {
      text = this.lineChunkAt(end);
      end += text.length;
      if (this.ranges.length > 1) {
        let textOffset = this.absoluteLineStart;
        let { rangeI } = this;
        while (this.ranges[rangeI].to < end) {
          rangeI += 1;
          const nextFrom = this.ranges[rangeI].from;
          const after = this.lineChunkAt(nextFrom);
          end = nextFrom + after.length;
          text = text.slice(0, this.ranges[rangeI - 1].to - textOffset) + after;
          textOffset = end - text.length;
        }
      }
    }
    this.absoluteLineEnd = end;
    line.reset(text);
    for (; line.depth < this.stack.length; line.depth += 1) {
      const cx = this.stack[line.depth];
      const handler = this.parser.skipContextMarkup[cx.type];
      if (!handler) {
        throw new Error(`Unhandled block context ${Type[cx.type]}`);
      }
      if (!handler(cx, this, line)) {
        break;
      }
      line.forward();
    }
  }

  private lineChunkAt(pos: number): string {
    const next = this.input.chunk(pos);
    let text;
    if (!this.input.lineChunks) {
      const eol = next.indexOf("\n");
      text = eol < 0 ? next : next.slice(0, eol);
    } else {
      text = next === "\n" ? "" : next;
    }
    return pos + text.length > this.to ? text.slice(0, this.to - pos) : text;
  }

  /// The end position of the previous line.
  prevLineEnd(): number {
    return this.atEnd ? this.lineStart : this.lineStart - 1;
  }

  /// @internal
  startContext(type: Type, start: number, value = 0): void {
    this.block = CompositeBlock.create(
      type,
      value,
      this.lineStart + start,
      this.block.hash,
      this.lineStart + this.line.text.length
    );
    this.stack.push(this.block);
  }

  /// Start a composite block. Should only be called from [block
  /// parser functions](#BlockParser.parse) that return null.
  startComposite(type: string, start: number, value = 0): void {
    this.startContext(this.parser.getNodeType(type), start, value);
  }

  /// @internal
  addNode(block: Type | Tree, from: number, to?: number): void {
    if (typeof block === "number")
      block = new Tree(
        this.parser.nodeSet.types[block],
        none as readonly (Tree | TreeBuffer)[],
        none as number[],
        (to ?? this.prevLineEnd()) - from
      );
    this.block.addChild(block, from - this.block.from);
  }

  /// Add a block element. Can be called by [block
  /// parsers](#BlockParser.parse).
  addElement(elt: Element): void {
    this.block.addChild(
      elt.toTree(this.parser.nodeSet),
      elt.from - this.block.from
    );
  }

  /// Add a block element from a [leaf parser](#LeafBlockParser). This
  /// makes sure any extra composite block markup (such as blockquote
  /// markers) inside the block are also added to the syntax tree.
  addLeafElement(leaf: LeafBlock, elt: Element): void {
    this.addNode(
      this.buffer
        .writeElements(injectMarks(elt.children, leaf.marks), -elt.from)
        .finish(elt.type, elt.to - elt.from),
      elt.from
    );
  }

  /// @internal
  finishContext(): void {
    const cx = this.stack.pop();
    const top = this.stack[this.stack.length - 1];
    top.addChild(cx.toTree(this.parser.nodeSet), cx.from - top.from);
    this.block = top;
  }

  private finish(): Tree {
    while (this.stack.length > 1) {
      this.finishContext();
    }
    return this.addGaps(this.block.toTree(this.parser.nodeSet, this.lineStart));
  }

  private addGaps(tree: Tree): Tree {
    return this.ranges.length > 1
      ? injectGaps(
          this.ranges,
          0,
          tree.topNode,
          this.ranges[0].from,
          this.dontInject
        )
      : tree;
  }

  /// @internal
  finishLeaf(leaf: LeafBlock): void {
    for (let i = 0; i < leaf.parsers.length; i += 1) {
      const parser = leaf.parsers[i];
      if (parser.finish(this, leaf)) {
        return;
      }
    }
    const inline = injectMarks(
      this.parser.parseInline(leaf.content, leaf.start, this),
      leaf.marks
    );
    this.addNode(
      this.buffer
        .writeElements(inline, -leaf.start)
        .finish(Type.Paragraph, leaf.content.length),
      leaf.start
    );
  }

  /// Create an [`Element`](#Element) object to represent some syntax
  /// node.
  elt(
    type: string | number,
    from: number,
    to: number,
    children?: readonly Element[]
  ): Element;

  elt(tree: Tree, at: number): Element;

  elt(
    type: string | Tree | number,
    from: number,
    to?: number,
    children?: Element[]
  ): Element {
    if (typeof type === "string") {
      return new Element(this.parser.getNodeType(type), from, to, children);
    }
    if (typeof type === "number") {
      return new Element(type, from, to, children);
    }
    return new TreeElement(type, from);
  }

  /// @internal
  get buffer(): Buffer {
    // eslint-disable-next-line no-buffer-constructor
    return new Buffer(this.parser.nodeSet);
  }
}
