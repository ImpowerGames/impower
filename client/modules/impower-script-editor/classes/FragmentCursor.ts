import { Input, NodeProp, TreeCursor, TreeFragment } from "@lezer/common";
import { NotLast } from "../utils/markdown";
import { BlockContext } from "./BlockContext";

export class FragmentCursor {
  // Index into fragment array
  i = 0;

  // Active fragment
  fragment: TreeFragment | null = null;

  fragmentEnd = -1;

  // Cursor into the current fragment, if any. When `moveTo` returns
  // true, this points at the first block after `pos`.
  cursor: TreeCursor | null = null;

  constructor(
    readonly fragments: readonly TreeFragment[],
    readonly input: Input
  ) {
    if (fragments.length) this.fragment = fragments[(this.i += 1)];
  }

  nextFragment(): void {
    this.fragment =
      this.i < this.fragments.length ? this.fragments[(this.i += 1)] : null;
    this.cursor = null;
    this.fragmentEnd = -1;
  }

  moveTo(pos: number, lineStart: number): boolean {
    while (this.fragment && this.fragment.to <= pos) this.nextFragment();
    if (!this.fragment || this.fragment.from > (pos ? pos - 1 : 0))
      return false;
    if (this.fragmentEnd < 0) {
      let end = this.fragment.to;
      while (end > 0 && this.input.read(end - 1, end) !== "\n") {
        end -= 1;
      }
      this.fragmentEnd = end ? end - 1 : 0;
    }

    let c = this.cursor;
    if (!c) {
      c = this.fragment.tree.cursor();
      this.cursor = c;
      c.firstChild();
    }

    const rPos = pos + this.fragment.offset;
    while (c.to <= rPos) if (!c.parent()) return false;
    for (;;) {
      if (c.from >= rPos) return this.fragment.from <= lineStart;
      if (!c.childAfter(rPos)) return false;
    }
  }

  matches(hash: number): boolean {
    const { tree } = this.cursor;
    return tree && tree.prop(NodeProp.contextHash) === hash;
  }

  takeNodes(cx: BlockContext): number {
    const cur = this.cursor;
    const off = this.fragment?.offset;
    const fragEnd = this.fragmentEnd - (this.fragment?.openEnd ? 1 : 0);
    const start = cx.absoluteLineStart;
    let end = start;
    let blockI = cx.block.children.length;
    let prevEnd = end;
    let prevI = blockI;
    for (;;) {
      let skipToNext = false;
      if (cur.to - off > fragEnd) {
        if (cur.type.isAnonymous && cur.firstChild()) {
          skipToNext = true;
          break;
        }
      }
      if (!skipToNext) {
        cx.dontInject.add(cur.tree);
        cx.addNode(cur.tree, cur.from - off);
        // Taken content must always end in a block, because incremental
        // parsing happens on block boundaries. Never stop directly
        // after an indented code block, since those can continue after
        // any number of blank lines.
        if (cur.type.is("Block")) {
          if (NotLast.indexOf(cur.type.id) < 0) {
            end = cur.to - off;
            blockI = cx.block.children.length;
          } else {
            end = prevEnd;
            blockI = prevI;
            prevEnd = cur.to - off;
            prevI = cx.block.children.length;
          }
        }
      }
      if (!cur.nextSibling()) {
        break;
      }
    }
    while (cx.block.children.length > blockI) {
      cx.block.children.pop();
      cx.block.positions.pop();
    }
    return end - start;
  }
}
