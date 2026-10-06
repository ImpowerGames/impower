import { ClosestFlowBase } from "./Flow/ClosestFlowBase";
import type { ParsedObject } from "./Object";

/** The binary program's symbol of a named weave point, a `label` (a named
 *  `Gather`) or a named choice: its flow's name and its own, joined by a dot,
 *  or its own alone at the story's top level (docs/engine/binary-program.md,
 *  section 2). One with no name, and one inside a function, has none. */
export const weavePointSymbolName = (
  point: ParsedObject,
  name: string | null,
): string | null => {
  if (!name) {
    return null;
  }
  const flow = ClosestFlowBase(point) as ParsedObject | null;
  if (!flow) {
    return null;
  }
  if (!flow.parent) {
    return name;
  }
  const flowName = flow.programSymbolName;
  return flowName === null ? null : `${flowName}.${name}`;
};

/** What a chunk that exports a named weave point's symbol records of how
 *  its name resolved: the qualified name of that symbol. */
export const weavePointResolutionKey = (point: ParsedObject): string =>
  `label:${point.programSymbolName ?? ""}`;
