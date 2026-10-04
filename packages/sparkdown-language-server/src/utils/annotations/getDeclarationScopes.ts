import { isExplicitRuleName } from "@impower/sparkdown/src/compiler/utils/explicitRuleNames";
import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { type DeclarationType } from "@impower/sparkdown/src/compiler/classes/annotators/DeclarationAnnotator";
import { ancestorMatching } from "@impower/sparkdown/src/compiler/utils/ancestorMatching";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { nodeNameSet } from "@impower/sparkdown/src/compiler/utils/nodeNameSet";
import { TRAILING_STATEMENT_NAMES } from "@impower/sparkdown/src/compiler/utils/trailingStatementNames";
import { VARIABLE_DEFINITION_NAMES } from "@impower/sparkdown/src/compiler/utils/variableDefinitionNames";
import { findOwnDeclarationName } from "@impower/sparkdown/src/compiler/lower/utils/findOwnDeclarationName";
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
  "LuauSparkdownExplicitDoBlock",
  "LuauSparkdownExplicitIfBlock",
  "LuauSparkdownExplicitElseifBlock",
  "LuauSparkdownExplicitElseBlock",
  "LuauSparkdownExplicitLoop",
  "LuauSparkdownExplicitRepeatLoop",
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
  "LuauSparkdownExplicitElseifBlock",
  "LuauSparkdownExplicitElseBlock",
]);

const REPEAT_LOOPS = nodeNameSet(["LuauRepeatLoop", "LuauSparkdownRepeatLoop", "LuauSparkdownExplicitRepeatLoop"]);

// What may come between a declaration and a union member line that
// continues its type: blank lines, indentation and comments.
const UNION_LINE_BRIDGE: ReadonlySet<string> = new Set([
  "Newline",
  "ExtraWhitespace",
  "Whitespace",
  "OptionalWhitespace",
  "LuauComment",
  "LuauLineComment",
  "LuauDocLineComment",
  "LuauBlockComment",
  "LuauTypeTrailingBlockComment",
  "LuauUncallableValueTrailingBlockComment",
  "LuauCallableValueTrailingBlockComment",
  "LuauTypeTrailingBlockCommentClose",
]);

// The same lookups, with the same bound, that `DeclarationAnnotator` makes
// before it records a `var` or `param`, so an annotated declaration always
// finds its declaring construct here.
const FUNCTION_PARAMETERS = nodeNameSet(["LuauFunctionParameters"]);
const FUNCTION_DEFINITIONS = nodeNameSet(["LuauFunctionDefinition"]);

/**
 * Where a local written in no block stops being visible. `Scene` and
 * `Branch` cover only their declaration line; their body runs as root-level
 * siblings up to a matching root-level `end`, the pairing
 * `validateSceneBranchScope` checks. A local in a scene's or branch's body
 * is visible up to the `end` of the innermost one still open above it, and a
 * local at the top of a script, inside no scene, to the end of the script.
 *
 * The walks mirror `isInsideScene` and `findsMatchingEnd` there, with one
 * deliberate difference: a `Scene` met inside an open section ends the
 * local's span here, since that section is missing its `end`, where
 * `findsMatchingEnd` counts it as nesting.
 */
const getSectionEnd = (tree: Tree, definition: Node) => {
  let statement: Node = definition;
  while (statement.parent?.parent) {
    statement = statement.parent as Node;
  }
  let pendingEnds = 0;
  let open: Node | null = null;
  for (let prev = statement.prevSibling; prev && !open; prev = prev.prevSibling) {
    if (prev.name === "LuauEndKeyword") {
      pendingEnds += 1;
    } else if (prev.name === "Scene" || prev.name === "Branch") {
      if (pendingEnds === 0) {
        open = prev as Node;
      } else {
        pendingEnds -= 1;
      }
    }
  }
  if (!open) {
    return tree.length;
  }
  let depth = 0;
  for (let next = statement.nextSibling; next; next = next.nextSibling) {
    if (next.name === "Branch") {
      depth += 1;
    } else if (next.name === "Scene") {
      // A scene inside an open section is missing that section's `end`.
      return next.from;
    } else if (next.name === "LuauEndKeyword") {
      if (depth === 0) {
        return next.from;
      }
      depth -= 1;
    }
  }
  return tree.length;
};

/**
 * The span a Luau `local` is visible in. A named local function starts at
 * its name, making it visible recursively inside its own body. A variable
 * starts where its declaring statement's text ends, so it is not offered
 * in its own initializer,
 * including a function value in it; a statement that follows on the same
 * line (`local a = 1 return a`) is the declaration's sibling and so comes
 * after that point. It
 * ends at the end of its block (one of `LUAU_BLOCKS`), or at the next
 * branch of an `if` or arm of an alternator, and a `repeat` loop's locals
 * stay visible in its `until` condition. A local in no block, written
 * directly in a scene's or branch's body or at the top of a script, is
 * visible up to that section's `end` (see `getSectionEnd`).
 *
 * Undefined for a `store` or `const`, which is global wherever it is
 * written. Null for a define's function member or a local outside the
 * cursor's script, neither of which is a visible bare binding there.
 */
const getLocalScope = (
  tree: Tree,
  from: number,
  read: (from: number, to: number) => string,
  inCursorScript: boolean,
  type: "var" | "function",
): LocalScope | null | undefined => {
  const name = tree.resolveInner(from, 1) as Node;
  const definition: Node | null = ancestorMatching(
    name,
    type === "function" ? FUNCTION_DEFINITIONS : VARIABLE_DEFINITION_NAMES,
  );
  if (!definition) {
    return undefined;
  }
  // A define's explicit function declarations belong to its method table.
  if (type === "function" && definition.parent?.name === "LuauDefine_content") {
    return null;
  }
  const modifierRoot = type === "function"
    ? definition.getChild("LuauFunctionDefinition_begin") as Node | null
    : definition;
  const modifier = modifierRoot && getDescendent("LuauScopeModifier", modifierRoot);
  if (!modifier || read(modifier.from, modifier.to).trim() !== "local") {
    return undefined;
  }
  if (!inCursorScript) {
    return null;
  }
  // A type annotation at the end of the line takes in the line breaks after
  // it, so the definition's node can end lines after its text. Whitespace
  // on the declaration's own line is still part of it: a cursor after
  // `local a = ` is in the initializer.
  const text = read(definition.from, definition.to);
  const trimmed = text.trimEnd();
  let start = type === "function"
    ? name.to
    : text.slice(trimmed.length).includes("\n")
      ? definition.from + trimmed.length
      : definition.to;
  // A union member line after a comment line continues the declaration's
  // type (`local v: number` then `-- note` then `| string = 5`) and can hold
  // its value, so the names are visible only after the last such line.
  for (
    let next = type === "var" ? definition.nextSibling : null;
    next;
    next = next.nextSibling
  ) {
    if (next.name === "LuauTypeUnionLineContinuation") {
      const lineText = read(next.from, next.to);
      const lineTrimmed = lineText.trimEnd();
      start = lineText.slice(lineTrimmed.length).includes("\n")
        ? next.from + lineTrimmed.length
        : next.to;
    } else if (!UNION_LINE_BRIDGE.has(next.name)) {
      break;
    }
  }
  // A statement the definition's content holds after a comma comes after
  // the declaration, so the names are visible from it. An anonymous
  // function there is a value, in which they are not.
  const content = type === "var"
    ? definition.getChild(`${definition.name}_content`)
    : null;
  for (let child = content?.firstChild; child; child = child.nextSibling) {
    if (
      TRAILING_STATEMENT_NAMES.has(child.name) &&
      !(child.name === "LuauFunctionDefinition" && !findOwnDeclarationName(child))
    ) {
      start = child.from;
      break;
    }
  }
  // The walk up to the block passes the statement that holds the
  // declaration, whose later siblings include the `if` branches or
  // alternator arms after it.
  let to: number | undefined;
  // Scan a function declaration's later siblings before finding its
  // enclosing block, so the next conditional branch still ends its scope.
  let block: Node | null = definition;
  for (; block; block = block.parent as Node | null) {
    if (LUAU_BLOCKS.has(block.name) && !(type === "function" && block === definition)) {
      break;
    }
    // Branches and alternator arms never sit at the root, so a root-level
    // statement's later siblings, the rest of the script, are not scanned.
    if (!block.parent?.parent) {
      continue;
    }
    for (let next = block.nextSibling; to === undefined && next; next = next.nextSibling) {
      if (LUAU_BRANCHES.has(next.name)) {
        to = next.from;
      }
    }
  }
  if (!block) {
    // Outside any block, a later `elseif` or alternator arm belongs to a
    // block the local is not in, so the branch cut found above does not
    // apply.
    return { from: start, to: getSectionEnd(tree, definition) };
  }
  if (REPEAT_LOOPS.has(block.name)) {
    let after = block.nextSibling;
    while (after && (after.name === "Newline" || after.name.endsWith("Whitespace"))) {
      after = after.nextSibling;
    }
    if (after && isExplicitRuleName(after.name, "LuauUntilStatement")) {
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
  read: (from: number, to: number) => string,
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
  // The parameters are visible from the header's end: after the return type
  // when there is one, which takes in the line breaks after it, so a body
  // can open lines later and a function with no body has only its header.
  const returnType = owner.getChild("LuauFunctionReturnType");
  const headerEnd = returnType
    ? returnType.from + read(returnType.from, returnType.to).trimEnd().length
    : parameters.to;
  const body = owner.getChild("LuauFunctionBody");
  return body
    ? { from: Math.min(body.from, headerEnd), to: body.to }
    : { from: headerEnd, to: owner.to };
};

export const getDeclarationScopes = (
  scripts: Map<string, AnnotatedScript>,
  cursor: { uri: string; offset: number },
): DeclarationScopes => {
  const scopes: DeclarationScopes = {};
  const visibleLocals = new Map<
    string,
    { type: DeclarationType; from: number }
  >();
  const file = (scopePath: string, type: DeclarationType, name: string) => {
    scopes[scopePath] ??= {};
    scopes[scopePath][type] ??= [];
    scopes[scopePath][type]!.push(name);
  };
  for (const [uri, { annotations, tree, read }] of scripts) {
    // Each script's sections start outside any scene, so a scope left open by
    // a script missing its `end` does not reach into the next one.
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
          tree && (type === "var" || type === "function")
            ? getLocalScope(tree, cur.from, read, inCursorScript, type)
            : tree && type === "param"
              ? getParameterScope(tree, cur.from, read, inCursorScript)
              : undefined;
        if (localScope !== undefined) {
          // Scoped declaration: offer only inside its visible local span.
          if (
            localScope &&
            cursor.offset > localScope.from &&
            cursor.offset <= localScope.to
          ) {
            const previous = visibleLocals.get(text);
            if (!previous || localScope.from > previous.from) {
              visibleLocals.set(text, { type, from: localScope.from });
            }
          }
          cur.next();
          continue;
        }
        if (type === "scene") {
          scopePathParts = [];
          scopePathParts.push({ kind: "scene", name: text });
        }
        if (type === "end") {
          scopePathParts.pop();
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
  // Resolve lexical bindings before completion providers deduplicate names.
  // Section destinations have their own namespace and remain available.
  const bindingTypes: DeclarationType[] = [
    "var",
    "param",
    "const",
    "function",
    "define",
  ];
  for (const scope of Object.values(scopes)) {
    for (const type of bindingTypes) {
      const names = scope[type];
      if (names) {
        scope[type] = names.filter((name) => !visibleLocals.has(name));
      }
    }
  }
  for (const [name, { type }] of visibleLocals) {
    file("", type, name);
  }
  return scopes;
};
