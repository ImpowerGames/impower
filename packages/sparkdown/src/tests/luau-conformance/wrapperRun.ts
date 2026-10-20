// The wrapper `function run()` the conformance harness places an upstream
// Luau chunk in. A GlobalUsedAsLocal warning naming `run` is the wrapper's
// only when no function the chunk itself holds has that name, as the reading
// names functions (Luau's `debugname`).

import type { LuauNameFacts } from "../../compiler/lint/luauNames";

/** Whether the only authored function the reading names `run` is the
 *  wrapper, which begins the script. */
export function onlyRunIsWrapper(names: LuauNameFacts): boolean {
  const runs = [...names.functionStarts].filter(([fn]) => fn.debugname === "run");
  return runs.length === 1 && runs[0]![1] === 0;
}

/** The message of a GlobalUsedAsLocal warning that names a function `run`. */
export function namesRun(message: string): boolean {
  return message.endsWith(" is only used in the enclosing function 'run'; consider changing it to local");
}
