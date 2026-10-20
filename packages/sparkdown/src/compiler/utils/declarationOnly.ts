import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";

/** What a script other than main reports at each line of its top level that
 *  is not a declaration. */
export const CONTENT_OUTSIDE_SCENE_MESSAGE =
  "Only main.sd runs lines outside a scene. Move this into a scene or into main.sd.";

// The top-level statements that declare: a `define` and the definitions
// written like one (a style, a layout, a screen, a component, an animation,
// a theme, a morph), an `external` and a `type`.
const DECLARATIONS = nodeNameSet([
  "LuauDefine",
  "LuauStyle",
  "LuauLayout",
  "LuauScreen",
  "LuauComponent",
  "LuauAnimation",
  "LuauTheme",
  "LuauMorph",
  "LuauExternalDeclaration",
  "LuauDataTypeDeclaration",
  "LuauFunctionTypeDeclaration",
]);

// The statements a `function` declares with, unless it is `local`.
const FUNCTIONS = nodeNameSet([
  "LuauFunctionDefinition",
  "LuauFunctionAttributes",
]);

// The statements a `store` or a `const` declares with, which also write a
// top-level `local`.
const VARIABLES = nodeNameSet([
  "LuauVariableDefinition",
  "LuauSparkdownVariableDefinition",
]);

// The flows: a scene, and a branch, which runs to its `end` as a scene does.
const FLOWS = nodeNameSet(["Scene", "Branch"]);

// The lines a script's top level holds that neither run nor declare: the
// `end` of a flow, and an `include` line, which reports an error of its own.
const STRUCTURE = nodeNameSet(["LuauEndKeyword", "Include"]);

/**
 * The top-level statements of a script other than main that are neither
 * declarations nor inside a flow, by where each starts: the lines only main
 * runs (a display line, a choice, a divert, a top-level `local`, an
 * assignment, a call, a control block, a `run`). A scene's or a branch's
 * body is written at the top level up to its `end`, so the flows are
 * followed as `validateSceneStructure` follows them, and everything up to the
 * matching `end` is inside one.
 */
export function contentOutsideScenes(
  top: SyntaxNode,
  read: (from: number, to: number) => string,
): Set<number> {
  const found = new Set<number>();
  let depth = 0;
  for (let node = top.firstChild; node; node = node.nextSibling) {
    if (FLOWS.has(node.name)) {
      depth += 1;
    } else if (node.name === "LuauEndKeyword") {
      depth = Math.max(0, depth - 1);
    } else if (
      depth === 0 &&
      !STRUCTURE.has(node.name) &&
      !node.name.endsWith("Comment") &&
      !declares(node, read)
    ) {
      found.add(node.from);
    }
  }
  return found;
}

const declares = (
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean => {
  if (DECLARATIONS.has(node.name)) {
    return true;
  }
  const keyword = /^\s*(\w+)/.exec(read(node.from, Math.min(node.to, node.from + 64)))?.[1];
  if (FUNCTIONS.has(node.name)) {
    return keyword !== "local";
  }
  if (VARIABLES.has(node.name)) {
    return keyword === "store" || keyword === "const";
  }
  return false;
};
