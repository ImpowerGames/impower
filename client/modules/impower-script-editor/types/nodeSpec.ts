import { BlockContext } from "../classes/BlockContext";
import { Line } from "../classes/Line";

/// Used in the [configuration](#MarkdownConfig.defineNodes) to define
/// new [syntax node
/// types](https://lezer.codemirror.net/docs/ref/#common.NodeType).
export interface NodeSpec {
  /// The node's name.
  name: string;
  /// Should be set to true if this type represents a block node.
  block?: boolean;
  /// If this is a composite block, this should hold a function that,
  /// at the start of a new line where that block is active, checks
  /// whether the composite block should continue (return value) and
  /// optionally [adjusts](#Line.moveBase) the line's base position
  /// and [registers](#Line.addMarker) nodes for any markers involved
  /// in the block's syntax.
  composite?(cx: BlockContext, line: Line, value: number): boolean;
}
