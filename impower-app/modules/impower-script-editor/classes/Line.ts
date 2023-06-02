import { skipSpace } from "../utils/skipSpace";
import { Element } from "./Element";

/// Data structure used during block-level per-line parsing.
export class Line {
  /// The line's full text.
  text = "";

  /// The base indent provided by the composite contexts (that have
  /// been handled so far).
  baseIndent = 0;

  /// The string position corresponding to the base indent.
  basePos = 0;

  /// The number of contexts handled @internal
  depth = 0;

  /// Any markers (i.e. block quote markers) parsed for the contexts. @internal
  markers: Element[] = [];

  /// The position of the next non-whitespace character beyond any
  /// list, blockquote, or other composite block markers.
  pos = 0;

  /// The column of the next non-whitespace character.
  indent = 0;

  /// The character code of the character after `pos`.
  next = -1;

  /// @internal
  forward(): void {
    if (this.basePos > this.pos) {
      this.forwardInner();
    }
  }

  /// @internal
  forwardInner(): void {
    const newPos = this.skipSpace(this.basePos);
    this.indent = this.countIndent(newPos, this.pos, this.indent);
    this.pos = newPos;
    this.next = newPos === this.text.length ? -1 : this.text.charCodeAt(newPos);
  }

  /// Skip whitespace after the given position, return the position of
  /// the next non-space character or the end of the line if there's
  /// only space after `from`.
  skipSpace(from: number): number {
    return skipSpace(this.text, from);
  }

  /// @internal
  reset(text: string): void {
    this.text = text;
    this.baseIndent = 0;
    this.basePos = 0;
    this.pos = 0;
    this.indent = 0;
    this.forwardInner();
    this.depth = 1;
    while (this.markers.length) {
      this.markers.pop();
    }
  }

  /// Move the line's base position forward to the given position.
  /// This should only be called by composite [block
  /// parsers](#BlockParser.parse) or [markup skipping
  /// functions](#NodeSpec.composite).
  moveBase(to: number): void {
    this.basePos = to;
    this.baseIndent = this.countIndent(to, this.pos, this.indent);
  }

  /// Move the line's base position forward to the given _column_.
  moveBaseColumn(indent: number): void {
    this.baseIndent = indent;
    this.basePos = this.findColumn(indent);
  }

  /// Store a composite-block-level marker. Should be called from
  /// [markup skipping functions](#NodeSpec.composite) when they
  /// consume any non-whitespace characters.
  addMarker(elt: Element): void {
    this.markers.push(elt);
  }

  /// Find the column position at `to`, optionally starting at a given
  /// position and column.
  countIndent(to: number, from = 0, indent = 0): number {
    for (let i = from; i < to; i += 1) {
      indent += this.text.charCodeAt(i) === 9 ? 4 - (indent % 4) : 1;
    }
    return indent;
  }

  /// Find the position corresponding to the given column.
  findColumn(goal: number): number {
    let i = 0;
    for (let indent = 0; i < this.text.length && indent < goal; i += 1) {
      indent += this.text.charCodeAt(i) === 9 ? 4 - (indent % 4) : 1;
    }
    return i;
  }

  /// @internal
  scrub(): string {
    if (!this.baseIndent) {
      return this.text;
    }
    let result = "";
    for (let i = 0; i < this.basePos; i += 1) {
      result += " ";
    }
    return result + this.text.slice(this.basePos);
  }
}
