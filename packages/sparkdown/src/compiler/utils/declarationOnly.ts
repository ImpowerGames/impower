import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";
import { VARIABLE_DEFINITION_NAMES } from "./variableDefinitionNames";

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

// A statement marked with `&`, which declares when the statement it marks
// does.
export const EXPLICIT = nodeNameSet(["LuauSparkdownExplicitStatement"]);

// What separates the statements of a marked line.
const SEPARATORS = nodeNameSet(["LuauSemicolonSeparator"]);

// The flows: a scene, and a branch, which runs to its `end` as a scene does.
export const FLOWS = nodeNameSet(["Scene", "Branch"]);

// The lines a script's top level holds that neither run nor declare: the
// `end` of a flow, and an `include` line, which reports an error of its own.
const STRUCTURE = nodeNameSet(["LuauEndKeyword", "Include"]);

/**
 * The statements of a script's top level outside every flow, by where each
 * starts, each with whether its syntax declares: false for the lines only
 * main runs (a display line, a choice, a divert, a top-level `local`, an
 * assignment, a call, a control block, a `run`, and a marked line that holds
 * one of those beside a declaration). A scene's or a branch's body is written
 * at the top level up to its `end`, so the flows are followed as
 * `validateSceneStructure` follows them, and everything up to the matching
 * `end` is inside one. A statement whose syntax declares can still hold a
 * statement Luau reads after its declaration on the same line, past a block
 * comment (`store x = 1 --[[c]] f()`), which only what it lowered to shows
 * (`SparkdownCompiler`'s `onlyDeclares`).
 */
export function topLevelStatements(
  top: SyntaxNode,
  read: (from: number, to: number) => string,
): Map<number, boolean> {
  const found = new Map<number, boolean>();
  let depth = 0;
  for (let node = top.firstChild; node; node = node.nextSibling) {
    if (FLOWS.has(node.name)) {
      depth += 1;
    } else if (node.name === "LuauEndKeyword") {
      depth = Math.max(0, depth - 1);
    } else if (
      depth === 0 &&
      !STRUCTURE.has(node.name) &&
      !node.name.endsWith("Comment")
    ) {
      found.set(node.from, declares(node, read));
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
    // the statements they mark do; `& x = 1` and `& f()` run. A marked line
    // can hold several statements (`& store x = 1; x = 2`), and declares only
    // when each of them does.
    const content = childEndingWith(node, "_content");
    const marked = content ? statementsOf(content) : [];
    return marked.length > 0 && marked.every((statement) => declares(statement, read));
  }
  if (FUNCTIONS.has(node.name)) {
    return scopeOf(node, read) !== "local";
  }
  if (VARIABLE_DEFINITION_NAMES.has(node.name)) {
    const scope = scopeOf(node, read);
    return scope === "store" || scope === "const";
  }
  return false;
};

/** The first child of `node` whose name ends with `suffix`. */
export const childEndingWith = (
  node: SyntaxNode,
  suffix: string,
): SyntaxNode | undefined => {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name.endsWith(suffix)) {
      return child;
    }
  }
  return undefined;
};

/** The statements a marked line's content holds, without the separators,
 *  the comments and the whitespace between them. An assignment is read as its
 *  target and its operation, each a child of its own, and neither declares. */
export const statementsOf = (content: SyntaxNode): SyntaxNode[] => {
  const statements: SyntaxNode[] = [];
  for (let child = content.firstChild; child; child = child.nextSibling) {
    if (
      !SEPARATORS.has(child.name) &&
      !child.name.endsWith("Whitespace") &&
      !child.name.endsWith("Comment")
    ) {
      statements.push(child);
    }
  }
  return statements;
};

/** The first node named `name` inside `node`, at any depth. */
export const findWithin = (node: SyntaxNode, name: string): SyntaxNode | undefined => {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) {
      return child;
    }
    const found = findWithin(child, name);
    if (found) {
      return found;
    }
  }
  return undefined;
};

/** The scope a variable or function definition is written with (`local`,
 *  `store`, `const`), from the scope modifier the grammar gives its header,
 *  or undefined when it has none. The modifier is looked for in the header
 *  alone, since a statement of a function's body can have one of its own. */
export const scopeOf = (
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): string | undefined => {
  const definition =
    node.name === "LuauFunctionAttributes"
      ? (findWithin(node, "LuauFunctionDefinition") ?? node)
      : node;
  const header = childEndingWith(definition, "_begin");
  const modifier = header && findWithin(header, "LuauScopeModifier");
  return modifier ? read(modifier.from, modifier.to).trim() : undefined;
};
