import type { SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { LowerContext } from "../context";
import { makeSource } from "./validateDefineStructure";

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

const FUNCTIONS = new Set(["LuauFunctionDefinition", "LuauMethodDefinition"]);

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
