import type { SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { LowerContext } from "../context";
import { makeSource } from "./validateDefineStructure";

// The Sparkle declarations that are top-level keywords (rule L2 of
// docs/sparkle/reactive-sparkle-spec.md): the word each is written with and
// its keyword's node, each named literally so the grammar node-name check
// sees every name.
const TOP_LEVEL_DECLARATIONS: Readonly<
  Partial<Record<SparkdownNodeName, { keyword: string; node: SparkdownNodeName }>>
> = {
  LuauLayout: { keyword: "layout", node: "LuauLayoutKeyword" },
  LuauComponent: { keyword: "component", node: "LuauComponentKeyword" },
  LuauStyle: { keyword: "style", node: "LuauStyleKeyword" },
  LuauScreen: { keyword: "screen", node: "LuauScreenKeyword" },
  LuauAnimation: { keyword: "animation", node: "LuauAnimationKeyword" },
  LuauTheme: { keyword: "theme", node: "LuauThemeKeyword" },
};

// The nodes that hold a function's body: a function definition, whether a
// statement (`function f()`, `local function f()`), a value
// (`local h = function()`) or a define's method written with `function`,
// and a define's method written without it (`go()` … `end`).
const FUNCTIONS = new Set(["LuauFunctionDefinition", "LuauMethodDefinition"]);

/**
 * The error of a top-level Sparkle declaration (`layout`, `component`,
 * `style`, `screen`, `animation`, `theme`) written inside a function's body,
 * at any depth (a nested function, a block in the function, a define's
 * method), or undefined where it is not. Such a declaration was silently
 * never registered, since a function's body lowers as statements whose
 * context is not kept (I-1405); the lowerer now reports it on its keyword and
 * drops what it would register.
 */
export function validateTopLevelDeclaration(
  node: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic | undefined {
  const declaration = TOP_LEVEL_DECLARATIONS[node.name as SparkdownNodeName];
  if (!declaration) return undefined;
  let inFunction = false;
  for (let n = node.parent; n; n = n.parent) {
    if (FUNCTIONS.has(n.name)) {
      inFunction = true;
      break;
    }
  }
  if (!inFunction) return undefined;
  const at = getDescendent(declaration.node, node) ?? node;
  return {
    message: `'${declaration.keyword}' is a top-level declaration and cannot be written inside a function`,
    severity: ErrorType.Error,
    source: makeSource(at.from, at.to, ctx),
  };
}
