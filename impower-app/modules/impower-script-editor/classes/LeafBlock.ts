import { LeafBlockParser } from "../types/leafBlockParser";
import { Element } from "./Element";

/// Data structure used to accumulate a block's content during [leaf
/// block parsing](#BlockParser.leaf).
export class LeafBlock {
  /// @internal
  marks: Element[] = [];

  /// @internal
  parsers: LeafBlockParser[] = [];

  /// The start position of the block.
  readonly start: number;

  /// The block's text content.
  public content: string;

  /// @internal
  constructor(
    /// The start position of the block.
    start: number,
    /// The block's text content.
    content: string
  ) {
    this.start = start;
    this.content = content;
  }
}
