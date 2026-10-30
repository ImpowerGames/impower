import type { LuauNameFacts } from "../../compiler/lint/luauNames";

export function onlyRunIsWrapper(names: LuauNameFacts): boolean {
  const runs = [...names.functionStarts].filter(([fn]) => fn.debugname === "run");
  return runs.length === 1 && runs[0]![1] === 0;
}

export function namesRun(message: string): boolean {
  return message.endsWith(" is only used in the enclosing function 'run'; consider changing it to local");
}
