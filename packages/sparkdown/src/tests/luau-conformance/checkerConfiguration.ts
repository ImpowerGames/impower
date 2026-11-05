import type { TypeCheckLimits } from "../../compiler/typecheck/TypeFunction";
import { AstTypeReference, visitAst, type AstStatBlock } from "../../compiler/typecheck/Ast";

export interface UpstreamCheckerConfiguration {
  limits: TypeCheckLimits;
  /** Accepted with explicit provenance because the selected new solver never reads it. */
  inactiveLimits: { name: "LuauCheckRecursionLimit"; value: number; provenance: string }[];
}

/** Only this ticket's audited settings. Other harness flags must retain their own validation. */
export function checkerConfiguration(
  flags: Record<string, boolean> = {},
  ints: Record<string, number> = {},
  roots: readonly AstStatBlock[] = [],
): UpstreamCheckerConfiguration {
  const limits: TypeCheckLimits = {};
  const inactiveLimits: UpstreamCheckerConfiguration["inactiveLimits"] = [];
  for (const [name, value] of Object.entries(flags)) {
    if (typeof value !== "boolean") throw new Error(`invalid boolean flag ${name}`);
    switch (name) {
      case "DebugLuauMagicTypes": limits.debugMagicTypes = value; break;
      case "DebugLuauAlwaysShowConstraintSolvingIncomplete": limits.alwaysShowConstraintSolvingIncomplete = value; break;
      case "LuauAddRecursionCounterToNonStrictTypeChecker": limits.addRecursionCounterToNonStrictTypeChecker = value; break;
      default: throw new Error(`unsupported checker flag ${name}`);
    }
  }
  for (const [name, value] of Object.entries(ints)) {
    if (!Number.isSafeInteger(value)) throw new Error(`invalid integer limit ${name}`);
    switch (name) {
      case "LuauNonStrictTypeCheckerRecursionLimit": limits.nonStrictRecursionLimit = value; break;
      case "LuauConstraintGeneratorRecursionLimit": limits.constraintGeneratorRecursionLimit = value; break;
      case "LuauCheckRecursionLimit":
        inactiveLimits.push({
          name, value,
          provenance: "7d5f733: ConstraintGenerator.cpp:39 declares this fastint without reading it; reads occur only in old-solver TypeInfer.cpp:429,1921,2441",
        });
        break;
      default: throw new Error(`unsupported checker limit ${name}`);
    }
  }
  if (limits.debugMagicTypes) {
    for (const root of roots)
      visitAst(root, { visit(node) {
        if (node instanceof AstTypeReference && node.name.startsWith("_luau_") && node.name !== "_luau_force_constraint_solving_incomplete")
          throw new Error(`unsupported debug magic type ${node.name}`);
        return true;
      } });
  }
  return { limits, inactiveLimits };
}
