import { MultiReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/MultiReturnType";
import { ReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import { AstStatReturn } from "../../typecheck/Ast";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { lowerCallArguments } from "../expression/lowerExpression";
import type { StatementSite } from "./lowerLuauStatement";

// `return X`          (single)   → ReturnType { expr }
// `return X, Y, Z`    (multi)    → MultiReturnType { [X, Y, Z] } — packs
//                                   the N values into a MultiValue at runtime
// `return`            (no value) → ReturnType { null } — produces Void
//
// Lowers both `LuauReturnStatement` (Luau code) and
// `LuauSparkdownReturnStatement` (narrative bodies); they differ only in
// whether the value may start on the next line, which the converter reads.
export function lowerLuauReturnStatement(
  stat: AstStatReturn,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const expressions = lowerCallArguments(stat.list, site.source, ctx);
  if (expressions.length > 1) {
    return { content: [new MultiReturnType(expressions)] };
  }
  return { content: [new ReturnType(expressions[0] ?? null)] };
}
