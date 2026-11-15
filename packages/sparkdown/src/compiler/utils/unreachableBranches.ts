import { Divert } from "../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { FlowBase } from "../../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowBase";
import { FlowLevel } from "../../inkjs/compiler/Parser/ParsedHierarchy/Flow/FlowLevel";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import type { Story } from "../../inkjs/compiler/Parser/ParsedHierarchy/Story";
import { memoOf } from "../../inkjs/compiler/Parser/ParsedHierarchy/MemoizedStatement";
import { parsedChildren } from "../../program/ProgramResolver";
import type { StatementMemoEntry } from "../lower/statementMemo";

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

const memoReads = (memo: StatementMemoEntry): string[] => [
  ...(memo.resolution?.reads ?? []),
  ...(memo.owner?.descendants ?? []).flatMap((entry) => entry.resolution?.reads ?? []),
];

export function unreachableBranches(story: Story): FlowBase[] {
  if (!holdsBranch(story)) {
    return [];
  }
  const branches: FlowBase[] = [];
  const reaches = new Map<FlowBase | null, Set<FlowBase>>();
  const reachesNamed = new Map<FlowBase | null, Set<string>>();
  const addTo = <T>(map: Map<FlowBase | null, Set<T>>, owner: FlowBase | null, value: T) => {
    let set = map.get(owner);
    if (!set) {
      map.set(owner, (set = new Set()));
    }
    set.add(value);
  };
  const visit = (obj: ParsedObject, owner: FlowBase | null) => {
    if (isBranch(obj)) {
      branches.push(obj);
      owner = obj;
    }
    const memo = memoOf(obj) as StatementMemoEntry | undefined;
    if (memo) {
      for (const name of memoReads(memo)) {
        addTo(reachesNamed, owner, name);
      }
    }
    if (obj instanceof Divert) {
      const reached = branchOf(obj.targetContent);
      if (reached && reached !== owner) {
        addTo(reaches, owner, reached);
      }
    }
    for (const child of parsedChildren(obj)) {
      visit(child, owner);
    }
  };
  visit(story, null);
  for (const [owner, names] of reachesNamed) {
    for (const branch of branches) {
      if (branch !== owner && names.has(branch.identifier?.name ?? "")) {
        addTo(reaches, owner, branch);
      }
    }
  }
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
