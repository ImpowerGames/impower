import type { SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
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

// A statement marked with `&`, which declares when the statement it marks
// does.
const EXPLICIT = nodeNameSet(["LuauSparkdownExplicitStatement"]);

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
  if (EXPLICIT.has(node.name)) {
    // `& store x = 1`, `& const x = 1` and `& function f() end` declare as
    // the statements they mark do; `& x = 1` and `& f()` run.
    const content = childEndingWith(node, "_content");
    const marked = content && childEndingWith(content, "");
    return !!marked && declares(marked, read);
  }
  if (FUNCTIONS.has(node.name)) {
    return scopeOf(node, read) !== "local";
  }
  if (VARIABLES.has(node.name)) {
    const scope = scopeOf(node, read);
    return scope === "store" || scope === "const";
  }
  return false;
};

/** The first child of `node` whose name ends with `suffix`, other than the
 *  whitespace the grammar gives a node of its own. */
const childEndingWith = (
  node: SyntaxNode,
  suffix: string,
): SyntaxNode | undefined => {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name.endsWith(suffix) && !child.name.endsWith("Whitespace")) {
      return child;
    }
  }
  return undefined;
};

/** The scope a variable or function definition is written with (`local`,
 *  `store`, `const`), from the scope modifier the grammar gives its header,
 *  or undefined when it has none. A function's own modifier stands before its
 *  name; one after it is a statement of its body. */
const scopeOf = (
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): string | undefined => {
  const definition =
    node.name === "LuauFunctionAttributes"
      ? (getDescendent("LuauFunctionDefinition", node) ?? node)
      : node;
  const modifier = getDescendent("LuauScopeModifier", definition);
  const name = getDescendent("LuauFunctionDeclarationName", definition);
  if (!modifier || (name && modifier.from > name.from)) {
    return undefined;
  }
  return read(modifier.from, modifier.to).trim();
};
