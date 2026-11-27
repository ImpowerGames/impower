import type { SparkProgram } from "../types/SparkProgram";
import type { BodyNode, ElementNode, StreamNode } from "../types/SparkleNode";

export const TEMPLATED_TAGS: ReadonlySet<string> = new Set(["stream", "cast"]);

export const isTemplated = (node: ElementNode): node is StreamNode =>
  node.templates !== undefined;

export const isStream = (node: ElementNode): node is StreamNode =>
  isTemplated(node) && node.tag === "stream";

export const isCast = (node: ElementNode): node is StreamNode =>
  isTemplated(node) && node.tag === "cast";

export function layoutStreams(
  sparkle: SparkProgram["sparkle"] | undefined,
  layoutName: string,
): StreamNode[] {
  return layoutTemplated(sparkle, layoutName, isStream);
}

export function layoutCasts(
  sparkle: SparkProgram["sparkle"] | undefined,
  layoutName: string,
): StreamNode[] {
  return layoutTemplated(sparkle, layoutName, isCast);
}

function layoutTemplated(
  sparkle: SparkProgram["sparkle"] | undefined,
  layoutName: string,
  wanted: (node: ElementNode) => boolean,
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
        case "element": {
          if (isTemplated(node)) {
            if (wanted(node)) {
              found.push(node);
            }
            break;
          }
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
