import type { BodyNode } from "@impower/sparkdown/src/compiler/types/SparkleNode";

export type ChildList = readonly [suffix: string, children: readonly BodyNode[] | undefined];

type ChildListsOf = {
  [K in BodyNode["kind"]]: (node: Extract<BodyNode, { kind: K }>) => readonly ChildList[];
};

export const BODY_CHILDREN: ChildListsOf = {
  element: (node) => [["", node.children]],
  if: (node) => [...node.branches.map((branch, i): ChildList => [`.${i}`, branch.children]), [".else", node.else]],
  match: (node) => [...node.cases.map((c, i): ChildList => [`.${i}`, c.children]), [".else", node.else]],
  for: (node) => [
    ["", node.children],
    [".else", node.else],
  ],
  fill: (node) => [["", node.children]],
  slot: () => [],
};

export function bodyChildLists(node: BodyNode): readonly ChildList[] {
  return (BODY_CHILDREN[node.kind] as (node: BodyNode) => readonly ChildList[])(node);
}
