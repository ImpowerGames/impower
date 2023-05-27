/// Objects that are used to [override](#BlockParser.leaf)

import { BlockContext } from "../classes/BlockContext";
import { LeafBlock } from "../classes/LeafBlock";
import { Line } from "../classes/Line";

/// paragraph-style blocks should conform to this interface.
export interface LeafBlockParser {
  /// Update the parser's state for the next line, and optionally
  /// finish the block. This is not called for the first line (the
  /// object is contructed at that line), but for any further lines.
  /// When it returns `true`, the block is finished. It is okay for
  /// the function to [consume](#BlockContext.nextLine) the current
  /// line or any subsequent lines when returning true.
  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean;
  /// Called when the block is finished by external circumstances
  /// (such as a blank line or the [start](#BlockParser.endLeaf) of
  /// another construct). If this parser can handle the block up to
  /// its current position, it should
  /// [finish](#BlockContext.addLeafElement) the block and return
  /// true.
  finish(cx: BlockContext, leaf: LeafBlock): boolean;
}
