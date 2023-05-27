import { NodeProp, NodeSet, NodeType, Tree, TreeBuffer } from "@lezer/common";

export class CompositeBlock {
  static create(
    type: number,
    value: number,
    from: number,
    parentHash: number,
    end: number
  ): CompositeBlock {
    const hash = (parentHash + (parentHash << 8) + type + (value << 4)) | 0;
    return new CompositeBlock(type, value, from, hash, end, [], []);
  }

  private hashProp: [NodeProp<unknown>, unknown][];

  constructor(
    readonly type: number,
    // Used for indentation in list items, markup character in lists
    readonly value: number,
    readonly from: number,
    readonly hash: number,
    public end: number,
    readonly children: (Tree | TreeBuffer)[],
    readonly positions: number[]
  ) {
    this.hashProp = [[NodeProp.contextHash, hash]];
  }

  addChild(child: Tree, pos: number): void {
    if (!child) {
      return;
    }
    if (child.prop(NodeProp.contextHash) !== this.hash) {
      child = new Tree(
        child.type,
        child.children,
        child.positions,
        child.length,
        this.hashProp
      );
    }
    this.children.push(child);
    this.positions.push(pos);
  }

  toTree(nodeSet: NodeSet, end = this.end): Tree {
    const last = this.children.length - 1;
    if (last >= 0) {
      end = Math.max(
        end,
        this.positions[last] + this.children[last].length + this.from
      );
    }
    const tree = new Tree(
      nodeSet.types[this.type],
      this.children,
      this.positions,
      end - this.from
    ).balance({
      makeTree: (children, positions, length) =>
        new Tree(NodeType.none, children, positions, length, this.hashProp),
    });
    return tree;
  }
}
