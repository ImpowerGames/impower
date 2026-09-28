import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import {
  ancestorMatching,
  type DeclarationType,
} from "@impower/sparkdown/src/compiler/classes/annotators/DeclarationAnnotator";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { nodeNameSet } from "@impower/sparkdown/src/compiler/utils/nodeNameSet";
import { TRAILING_STATEMENT_NAMES } from "@impower/sparkdown/src/compiler/utils/trailingStatementNames";
import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type Tree } from "@lezer/common";

type Node = GrammarSyntaxNode<SparkdownNodeName>;

/**
 * Declared names grouped by scope path (`""` for global, `scene` or
 * `scene.branch` otherwise) and then by declaration kind. A Luau local or
 * function parameter is filed only when it is visible at the cursor, and is
 * left out otherwise.
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

/** Where a local is visible: after `from` and up to `to`, in its own script. */
type LocalScope = { from: number; to: number };

/**
 * The constructs that end the scope of a local declared inside them: every
 * grammar rule that holds a block body. A block written in a function or
 * method body is a `Luau…` node, and the same block written in a scene's
 * body or at the top of a script is a `LuauSparkdown…` node.
 */
const LUAU_BLOCKS = nodeNameSet([
  "LuauFunctionBody",
  "LuauFunctionDefinition",
  "LuauMethodDefinition",
  "LuauSparkleHandlerClosure",
  "LuauDefine",
  "LuauDoBlock",
  "LuauIfBlock",
  "LuauElseifBlock",
  "LuauElseBlock",
  "LuauForLoop",
  "LuauWhileLoop",
  "LuauRepeatLoop",
  "LuauConditionalAlternatorBlock",
  "LuauSequentialAlternatorBlock",
  "LuauSparkdownDoBlock",
  "LuauSparkdownIfBlock",
  "LuauSparkdownElseifBlock",
  "LuauSparkdownElseBlock",
  "LuauSparkdownForLoop",
  "LuauSparkdownWhileLoop",
  "LuauSparkdownRepeatLoop",
  "LuauSparkdownConditionalAlternatorBlock",
  "LuauSparkdownSequentialAlternatorBlock",
]);

/**
 * The siblings that end the scope of a local declared before them in the
 * same block: the next branch of an `if`, and the next arm of an
 * alternator.
 */
const LUAU_BRANCHES = nodeNameSet([
  "LuauElseifBlock",
  "LuauElseBlock",
  "LuauSparkdownElseifBlock",
  "LuauSparkdownElseBlock",
  "LuauAlternatorSeparator",
]);

const REPEAT_LOOPS = nodeNameSet(["LuauRepeatLoop", "LuauSparkdownRepeatLoop"]);

// The same lookups, with the same bound, that `DeclarationAnnotator` makes
// before it records a `var` or `param`, so an annotated declaration always
// finds its declaring construct here.
const VARIABLE_DEFINITION = nodeNameSet(["LuauVariableDefinition"]);
const FUNCTION_PARAMETERS = nodeNameSet(["LuauFunctionParameters"]);

/**
 * Where a scene-body or top-of-script local stops being visible: at the next
 * scene, since a scene's body runs as sibling nodes until the next one, or at
 * the end of the script.
 */
const getSectionEnd = (tree: Tree, definition: Node) => {
  let statement: Node = definition;
  while (statement.parent?.parent) {
    statement = statement.parent as Node;
  }
  for (let next = statement.nextSibling; next; next = next.nextSibling) {
    if (next.name === "Scene") {
      return next.from;
    }
  }
  return tree.length;
};

/**
 * The span a Luau `local` is visible in. It starts where its declaring
 * statement ends, so it is not offered in its own initializer; when the
 * grammar nests the statements that follow on the same line inside the
 * declaration (`local a = 1 return a`), it starts at the first of them. It
 * ends at the end of its block (one of `LUAU_BLOCKS`), or at the next
 * branch of an `if` or arm of an alternator, and a `repeat` loop's locals
 * stay visible in its `until` condition. A local in no block, written
 * directly in a scene's body or at the top of a script, is visible up to
 * the next scene.
 *
 * Undefined for a `store` or `const`, which is global wherever it is
 * written. Null for a local outside the cursor's script, which is never
 * visible there, so its span is not worked out.
 */
const getVariableScope = (
  tree: Tree,
  from: number,
  read: (from: number, to: number) => string,
  inCursorScript: boolean,
): LocalScope | null | undefined => {
  const name = tree.resolveInner(from, 1) as Node;
  const definition: Node | null = ancestorMatching(name, VARIABLE_DEFINITION);
  if (!definition) {
    return undefined;
  }
  const modifier = getDescendent("LuauScopeModifier", definition);
  if (!modifier || read(modifier.from, modifier.to).trim() !== "local") {
    return undefined;
  }
  if (!inCursorScript) {
    return null;
  }
  let start = definition.to;
  const content = definition.getChild("LuauVariableDefinition_content");
  for (let child = content?.firstChild; child; child = child.nextSibling) {
    if (TRAILING_STATEMENT_NAMES.has(child.name)) {
      start = child.from;
      break;
    }
  }
  // The walk up to the block passes the statement that holds the
  // declaration, whose later siblings include the `if` branches or
  // alternator arms after it.
  let to: number | undefined;
  let block: Node | null = definition;
  for (; block && !LUAU_BLOCKS.has(block.name); block = block.parent as Node | null) {
    for (let next = block.nextSibling; to === undefined && next; next = next.nextSibling) {
      if (LUAU_BRANCHES.has(next.name)) {
        to = next.from;
      }
    }
  }
  if (!block) {
    return { from: start, to: getSectionEnd(tree, definition) };
  }
  if (REPEAT_LOOPS.has(block.name)) {
    let after = block.nextSibling;
    while (after && (after.name === "Newline" || after.name.endsWith("Whitespace"))) {
      after = after.nextSibling;
    }
    if (after?.name === "LuauUntilStatement") {
      to = after.to;
    }
  }
  return { from: start, to: to ?? block.to };
};

/**
 * The span a function or method parameter is visible in: the function's
 * body. Undefined for a scene or branch parameter, which belongs to its
 * section; null for a parameter outside the cursor's script.
 */
const getParameterScope = (
  tree: Tree,
  from: number,
  inCursorScript: boolean,
): LocalScope | null | undefined => {
  const name = tree.resolveInner(from, 1) as Node;
  const parameters: Node | null = ancestorMatching(name, FUNCTION_PARAMETERS);
  const owner = parameters?.parent;
  if (
    !parameters ||
    !owner ||
    (owner.name !== "LuauFunctionDefinition_content" &&
      owner.name !== "LuauMethodDefinition_content")
  ) {
    return undefined;
  }
  if (!inCursorScript) {
    return null;
  }
  const body = owner.getChild("LuauFunctionBody");
  return body
    ? { from: body.from, to: body.to }
    : { from: parameters.to, to: owner.to };
};

export const getDeclarationScopes = (
  scripts: Map<string, AnnotatedScript>,
  cursor: { uri: string; offset: number },
): DeclarationScopes => {
  const scopes: DeclarationScopes = {};
  const file = (scopePath: string, type: DeclarationType, name: string) => {
    scopes[scopePath] ??= {};
    scopes[scopePath][type] ??= [];
    scopes[scopePath][type]!.push(name);
  };
  for (const [uri, { annotations, tree, read }] of scripts) {
    // Each script's sections start outside any scene.
    let scopePathParts: {
      kind: "scene" | "branch";
      name: string;
    }[] = [];
    const inCursorScript = uri === cursor.uri;
    const cur = annotations.declarations?.iter();
    if (cur) {
      while (cur.value) {
        const text = read(cur.from, cur.to);
        const type = cur.value.type;
        const localScope =
          tree && type === "var"
            ? getVariableScope(tree, cur.from, read, inCursorScript)
            : tree && type === "param"
              ? getParameterScope(tree, cur.from, inCursorScript)
              : undefined;
        if (localScope !== undefined) {
          // Local: visible only after its declaration and inside its block
          if (
            localScope &&
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
