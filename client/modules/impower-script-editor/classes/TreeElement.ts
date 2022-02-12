import { Tree } from "@lezer/common";
import { Buffer } from "./Buffer";

export class TreeElement {
  readonly tree: Tree;

  readonly from: number;

  constructor(tree: Tree, from: number) {
    this.tree = tree;
    this.from = from;
  }

  get to(): number {
    return this.from + this.tree.length;
  }

  get type(): number {
    return this.tree.type.id;
  }

  get children(): [] {
    return [];
  }

  writeTo(buf: Buffer, offset: number): void {
    buf.nodes.push(this.tree);
    buf.content.push(
      buf.nodes.length - 1,
      this.from + offset,
      this.to + offset,
      -1
    );
  }

  toTree(): Tree {
    return this.tree;
  }
}
