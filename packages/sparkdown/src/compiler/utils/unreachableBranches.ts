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

export interface BranchReachability {
  readonly unreached: FlowBase[];
  readonly unsure: StatementMemoEntry[];
}

export function unreachableBranches(story: Story): BranchReachability {
  if (!holdsBranch(story)) {
    return { unreached: [], unsure: [] };
  }
  const branches: FlowBase[] = [];
  const memos = new Set<StatementMemoEntry>();
  const reaches = new Map<FlowBase | null, Set<FlowBase>>();
  const visit = (obj: ParsedObject, owner: FlowBase | null) => {
    if (isBranch(obj)) {
      branches.push(obj);
      owner = obj;
    }
    const memo = memoOf(obj) as StatementMemoEntry | undefined;
    if (memo) {
      memos.add(memo);
    }
    if (obj instanceof Divert) {
      const reached = branchOf(obj.targetContent);
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
  const unreached = branches.filter((branch) => !reached.has(branch));
  const unreachedNames = new Set(unreached.map((branch) => branch.identifier?.name ?? ""));
  const unsure = [...memos].filter((memo) => memoReads(memo).some((name) => unreachedNames.has(name)));
  return { unreached, unsure };
}
