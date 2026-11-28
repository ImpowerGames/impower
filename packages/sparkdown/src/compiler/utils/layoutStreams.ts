import type { SparkProgram } from "../types/SparkProgram";
import type { ElementNode, StreamNode } from "../types/SparkleNode";
import { walkLayoutTree } from "./layoutTree";

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
  const found: StreamNode[] = [];
  walkLayoutTree(sparkle, layoutName, ({ node, template, screen }) => {
    if (!template && !screen && isTemplated(node) && wanted(node)) {
      found.push(node);
    }
  });
  return found;
}
