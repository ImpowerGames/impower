import { Divert } from "../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { FlowBase } from "../../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { FlowLevel } from "../../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowLevel";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { Story } from "../../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { parsedChildren } from "../../program/ProgramResolver";

const isBranch = (obj: ParsedObject): obj is FlowBase =>
  obj instanceof FlowBase && obj.flowLevel === FlowLevel.Stitch && !obj.isFunction;

const branchOf = (obj: ParsedObject | null): FlowBase | null => {
  for (let at = obj; at; at = at.parent) {
    if (isBranch(at)) {
      return at;
    }
  }
  return null;
};

const rootOf = (obj: ParsedObject): ParsedObject => {
  let at = obj;
  while (at.parent) {
    at = at.parent;
  }
  return at;
};

const targetOf = (divert: Divert, story: Story): ParsedObject | null => {
  const resolved = divert.targetContent;
  if (resolved) {
    return resolved;
  }
  const held = divert.heldTargetContent;
  return held && rootOf(held) === story ? held : null;
};

const subFlows = (flow: FlowBase): IterableIterator<FlowBase> =>
  Map.prototype.values.call(flow.subFlowsByName) as IterableIterator<FlowBase>;

const holdsBranch = (story: Story): boolean => {
  for (const scene of subFlows(story)) {
    for (const flow of subFlows(scene)) {
      if (isBranch(flow)) {
        return true;
      }
    }
  }
  return false;
};

export function unreachableBranches(story: Story): FlowBase[] {
  if (!holdsBranch(story)) {
    return [];
  }
  const branches: FlowBase[] = [];
  const reaches = new Map<FlowBase | null, Set<FlowBase>>();
  const visit = (obj: ParsedObject, owner: FlowBase | null) => {
    if (isBranch(obj)) {
      branches.push(obj);
      owner = obj;
    }
    if (obj instanceof Divert) {
      const reached = branchOf(targetOf(obj, story));
      if (reached && reached !== owner) {
        let set = reaches.get(owner);
        if (!set) {
          reaches.set(owner, (set = new Set()));
        }
        set.add(reached);
      }
    }
    for (const child of parsedChildren(obj)) {
      visit(child, owner);
    }
  };
  visit(story, null);
  const reached = new Set<FlowBase>();
  const pending = [...(reaches.get(null) ?? [])];
  while (pending.length > 0) {
    const branch = pending.pop()!;
    if (reached.has(branch)) {
      continue;
    }
    reached.add(branch);
    pending.push(...(reaches.get(branch) ?? []));
  }
  return branches.filter((branch) => !reached.has(branch));
}
