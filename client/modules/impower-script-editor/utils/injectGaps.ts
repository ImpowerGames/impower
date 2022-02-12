import { SyntaxNode, Tree } from "@lezer/common";

export function injectGaps(
  ranges: readonly { from: number; to: number }[],
  rangeI: number,
  tree: SyntaxNode,
  offset: number,
  dont: Set<Tree>
): Tree {
  if (dont.has(tree.tree)) {
    return tree.tree;
  }
  let rangeEnd = ranges[rangeI].to;
  const children = [];
  const positions = [];
  const start = tree.from + offset;
  function movePastNext(upto: number, inclusive: boolean): void {
    while (inclusive ? upto >= rangeEnd : upto > rangeEnd) {
      const size = ranges[rangeI + 1].from - rangeEnd;
      offset += size;
      upto += size;
      rangeI += 1;
      rangeEnd = ranges[rangeI].to;
    }
  }
  for (let ch = tree.firstChild; ch; ch = ch.nextSibling) {
    movePastNext(ch.from + offset, true);
    const from = ch.from + offset;
    let node;
    if (ch.to + offset > rangeEnd) {
      node = injectGaps(ranges, rangeI, ch, offset, dont);
      movePastNext(ch.to + offset, false);
    } else {
      node = ch.toTree();
    }
    children.push(node);
    positions.push(from - start);
  }
  movePastNext(tree.to + offset, false);
  return new Tree(
    tree.type,
    children,
    positions,
    tree.to + offset - start,
    tree.tree ? tree.tree.propValues : undefined
  );
}
