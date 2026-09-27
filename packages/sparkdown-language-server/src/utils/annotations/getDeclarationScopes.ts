import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { type DeclarationType } from "@impower/sparkdown/src/compiler/classes/annotators/DeclarationAnnotator";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { nodeNameSet } from "@impower/sparkdown/src/compiler/utils/nodeNameSet";
import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type Tree } from "@lezer/common";

type Node = GrammarSyntaxNode<SparkdownNodeName>;

/**
 * Declared names grouped by scope path (`""` for global, `scene` or
 * `scene.branch` otherwise) and then by declaration kind. A Luau local or
 * function parameter is filed under `""` only when it is visible at the
 * cursor, and is left out otherwise.
 */
export type DeclarationScopes = {
  [path: string]: Partial<Record<DeclarationType, string[]>>;
};

/**
 * One script's annotations and syntax tree with a reader over that script's
 * own text. Its annotation ranges and tree positions are offsets into that
 * text, so they are read only through its `read`.
 */
export type AnnotatedScript = {
  annotations: SparkdownAnnotations;
  tree: Tree | undefined;
  read: (from: number, to: number) => string;
};

/** The position a completion is requested at. */
export type DeclarationCursor = {
  uri: string;
  offset: number;
};

/** The Luau blocks that end the scope of a local declared inside them. */
const LUAU_BLOCKS = nodeNameSet([
  "LuauFunctionBody",
  "LuauDoBlock",
  "LuauIfBlock",
  "LuauElseifBlock",
  "LuauElseBlock",
  "LuauRepeatLoop",
]);

/** The branches that end the scope of a local declared in the branch before them. */
const LUAU_BRANCHES = nodeNameSet([
  "LuauElseifBlock",
  "LuauElseBlock",
]);

const ancestor = (
  node: Node | null,
  matches: (node: Node) => boolean,
): Node | null => {
  for (let cur = node; cur; cur = cur.parent as Node | null) {
    if (matches(cur)) {
      return cur;
    }
  }
  return null;
};

/**
 * The span a Luau `local` or `const` is visible in: from the end of its
 * declaring statement, so it is not offered in its own initializer, to the
 * end of its block, or to the next branch of an `if`. A `repeat` loop's
 * locals stay visible in its `until` condition. Undefined for a declaration
 * that is not inside a Luau block, or one declared with `store`, which is
 * global wherever it is written.
 */
const getVariableScope = (
  tree: Tree,
  from: number,
  read: (from: number, to: number) => string,
): { from: number; to: number } | undefined => {
  const name = tree.resolveInner(from, 1) as Node;
  const definition = ancestor(name, (n) => n.name === "LuauVariableDefinition");
  if (!definition) {
    return undefined;
  }
  const modifier = getDescendent("LuauScopeModifier", definition);
  if (modifier && read(modifier.from, modifier.to).trim() === "store") {
    return undefined;
  }
  const block = ancestor(definition.parent as Node | null, (n) => LUAU_BLOCKS.has(n.name));
  if (!block) {
    return undefined;
  }
  let to = block.to;
  for (let next = definition.nextSibling; next; next = next.nextSibling) {
    if (LUAU_BRANCHES.has(next.name)) {
      to = next.from;
      break;
    }
  }
  if (
    block.name === "LuauRepeatLoop" &&
    block.nextSibling?.name === "LuauUntilStatement"
  ) {
    to = block.nextSibling.to;
  }
  return { from: definition.to, to };
};

/**
 * The span a function parameter is visible in: its function's body.
 * Undefined for a scene or branch parameter, which belongs to its section.
 */
const getParameterScope = (
  tree: Tree,
  from: number,
): { from: number; to: number } | undefined => {
  const name = tree.resolveInner(from, 1) as Node;
  const parameters = ancestor(name, (n) => n.name === "LuauFunctionParameters");
  if (parameters?.parent?.name !== "LuauFunctionDefinition_content") {
    return undefined;
  }
  const body = parameters.parent.getChild("LuauFunctionBody");
  // A function with no body yet has nowhere its parameters are visible.
  return body
    ? { from: body.from, to: body.to }
    : { from: parameters.to, to: parameters.to };
};

export const getDeclarationScopes = (
  scripts: Map<string, AnnotatedScript>,
  cursor: DeclarationCursor,
): DeclarationScopes => {
  let scopePathParts: {
    kind: "scene" | "branch";
    name: string;
  }[] = [];
  const scopes: DeclarationScopes = {};
  const file = (scopePath: string, type: DeclarationType, name: string) => {
    scopes[scopePath] ??= {};
    scopes[scopePath][type] ??= [];
    scopes[scopePath][type]!.push(name);
  };
  for (const [uri, { annotations, tree, read }] of scripts) {
    const cur = annotations.declarations?.iter();
    if (cur) {
      while (cur.value) {
        const text = read(cur.from, cur.to);
        const type = cur.value.type;
        const localScope =
          tree && (type === "var" || type === "const")
            ? getVariableScope(tree, cur.from, read)
            : tree && type === "param"
              ? getParameterScope(tree, cur.from)
              : undefined;
        if (localScope) {
          // Local: visible only after its declaration and inside its block
          if (
            uri === cursor.uri &&
            cursor.offset > localScope.from &&
            cursor.offset <= localScope.to
          ) {
            file("", type, text);
          }
          cur.next();
          continue;
        }
        if (type === "scene") {
          scopePathParts = [];
          scopePathParts.push({ kind: "scene", name: text });
        }
        if (type === "branch") {
          const prevKind = scopePathParts.at(-1)?.kind || "";
          if (prevKind !== "scene") {
            scopePathParts.pop();
          }
          file(scopePathParts.map((p) => p.name).join("."), type, text);
          scopePathParts.push({ kind: "branch", name: text });
        }
        if (
          type === "function" ||
          type === "scene" ||
          type === "const" ||
          type === "var"
        ) {
          // Global
          file("", type, text);
        }
        if (type === "define") {
          // Global
          file("", type, text.trim().replaceAll(/[ ]+/g, "."));
        }
        if (type === "label" || type === "param") {
          // Section
          file(scopePathParts.map((p) => p.name).join("."), type, text);
        }
        cur.next();
      }
    }
  }
  return scopes;
};
