import { NodeSet, Tree } from "@lezer/common";
import { Buffer } from "./Buffer";
import { TreeElement } from "./TreeElement";

/// Elements are used to compose syntax nodes during parsing.
export class Element {
  /// The node's
  /// [id](https://lezer.codemirror.net/docs/ref/#common.NodeType.id).
  readonly type: number;

  /// The start of the node, as an offset from the start of the document.
  readonly from: number;

  /// The end of the node.
  readonly to: number;

  /// The node's child nodes @internal
  readonly children: (Element | TreeElement)[] = [];

  /// @internal
  constructor(
    type: number,
    /// The start of the node, as an offset from the start of the document.
    from: number,
    /// The end of the node.
    to: number,
    /// The node's child nodes @internal
    children: (Element | TreeElement)[] = []
  ) {
    this.type = type;
    this.from = from;
    this.to = to;
    this.children = children;
  }

  /// @internal
  writeTo(buf: Buffer, offset: number): void {
    const startOff = buf.content.length;
    buf.writeElements(this.children, offset);
    buf.content.push(
      this.type,
      this.from + offset,
      this.to + offset,
      buf.content.length + 4 - startOff
    );
  }

  /// @internal
  toTree(nodeSet: NodeSet): Tree {
    // eslint-disable-next-line no-buffer-constructor
    return new Buffer(nodeSet)
      .writeElements(this.children, -this.from)
      .finish(this.type, this.to - this.from);
  }
}
