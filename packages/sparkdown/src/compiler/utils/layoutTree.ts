import type { SparkProgram } from "../types/SparkProgram";
import type { BodyNode, ElementNode, StreamNode } from "../types/SparkleNode";
import { isCast, isTemplated } from "./layoutStreams";

type Sparkle = SparkProgram["sparkle"];

export interface LayoutTreeElement {
  node: ElementNode;
  source: string;
  screen: boolean;
  cast: boolean;
  template?: { owner: StreamNode; root: boolean };
}

export const layoutTreeSource = (kind: "layout" | "screen" | "component", name: string) =>
  `${kind} ${name}`;

export const takesLines = (element: LayoutTreeElement): boolean =>
  !element.cast && (!element.template || element.template.root);

export function walkLayoutTree(
  sparkle: Sparkle | undefined,
  layoutName: string,
  visit: (element: LayoutTreeElement) => boolean | void,
): boolean {
  const layout = sparkle?.layouts?.[layoutName];
  if (!sparkle || !layout) {
    return false;
  }
  const components = sparkle.components ?? {};
  const expanded = new Set<string>();
  type Where = Omit<LayoutTreeElement, "node">;
  const nodes = (list: readonly BodyNode[] | undefined, where: Where): boolean =>
    (list ?? []).some((node) => body(node, where));
  const body = (node: BodyNode, where: Where): boolean => {
    switch (node.kind) {
      case "element":
        return element(node, where);
      case "if":
        return node.branches.some((branch) => nodes(branch.children, where)) || nodes(node.else, where);
      case "match":
        return node.cases.some((c) => nodes(c.children, where)) || nodes(node.else, where);
      case "for":
        return nodes(node.children, where) || nodes(node.else, where);
      case "fill":
        return nodes(node.children, where);
      default:
        return false;
    }
  };
  const element = (node: ElementNode, where: Where): boolean => {
    if (isTemplated(node)) {
      if (where.screen) {
        return false;
      }
      if (visit({ node, ...where }) === true) {
        return true;
      }
      const cast = where.cast || isCast(node);
      return node.templates.some((template) =>
        element(template, { ...where, cast, template: { owner: node, root: true } }),
      );
    }
    if (visit({ node, ...where }) === true) {
      return true;
    }
    const inner: Where = where.template ? { ...where, template: { ...where.template, root: false } } : where;
    const component = components[node.tag];
    const role = `${node.tag}\n${inner.screen}\n${inner.cast}\n${inner.template ? "template" : ""}`;
    if (component && !expanded.has(role)) {
      expanded.add(role);
      if (nodes(component.children, { ...inner, source: layoutTreeSource("component", node.tag) })) {
        return true;
      }
    }
    return nodes(node.children, inner);
  };
  const top: Where = { source: layoutTreeSource("layout", layoutName), screen: false, cast: false };
  if (nodes(layout.children, top)) {
    return true;
  }
  const screen = layout.screen ? sparkle.screens?.[layout.screen] : undefined;
  return nodes(screen?.children, {
    source: layoutTreeSource("screen", layout.screen ?? ""),
    screen: true,
    cast: false,
  });
}
