import type { SparkProgram } from "../types/SparkProgram";
import type { BodyNode, StreamNode } from "../types/SparkleNode";

export function layoutStreams(
  sparkle: SparkProgram["sparkle"] | undefined,
  layoutName: string,
): StreamNode[] {
  const layout = sparkle?.layouts?.[layoutName];
  if (!layout) {
    return [];
  }
  const components = sparkle?.components ?? {};
  const expanded = new Set<string>();
  const found: StreamNode[] = [];
  const visit = (nodes: readonly BodyNode[] | undefined): void => {
    for (const node of nodes ?? []) {
      switch (node.kind) {
        case "stream":
          found.push(node);
          break;
        case "element": {
          const component = components[node.tag];
          if (component && !expanded.has(node.tag)) {
            expanded.add(node.tag);
            visit(component.children);
          }
          visit(node.children);
          break;
        }
        case "if":
          node.branches.forEach((branch) => visit(branch.children));
          visit(node.else);
          break;
        case "match":
          node.cases.forEach((c) => visit(c.children));
          visit(node.else);
          break;
        case "for":
          visit(node.children);
          visit(node.else);
          break;
        case "fill":
          visit(node.children);
          break;
      }
    }
  };
  visit(layout.children);
  return found;
}
