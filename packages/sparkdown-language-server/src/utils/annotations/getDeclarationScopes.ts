import { isExplicitRuleName } from "@impower/sparkdown/src/compiler/utils/explicitRuleNames";
import { ALTERNATOR_CANDIDATES, opensAlternator } from "@impower/sparkdown/src/compiler/utils/alternatorDecision";
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
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type Tree } from "@lezer/common";
import { getParentSectionPath } from "../syntax/getParentSectionPath";

type Node = GrammarSyntaxNode<SparkdownNodeName>;

export type DeclarationScopes = {
  [path: string]: Partial<Record<DeclarationType, string[]>>;
};

export type AnnotatedScript = {
  annotations: SparkdownAnnotations;
  tree: Tree | undefined;
  read: (from: number, to: number) => string;
};

type LocalScope = { from: number; to: number };

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
  "LuauConditionalAlternatorLineStart",
  "LuauSequentialAlternatorLineStart",
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

const FUNCTION_PARAMETERS = nodeNameSet(["LuauFunctionParameters"]);
const FUNCTION_DEFINITIONS = nodeNameSet(["LuauFunctionDefinition"]);

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
  const text = read(definition.from, definition.to);
  const trimmed = text.trimEnd();
  const lastPart = definition.getChild(`${definition.name}_content`)?.lastChild;
  const operation = lastPart?.getChild(`${lastPart.name}_content`)?.lastChild;
  const valueLineBreak = type === "var" &&
    operation?.getChild(`${operation.name}_content`)?.lastChild?.name === "LuauAssignmentLineBreak";
  let start = type === "function"
    ? name.to
    : !valueLineBreak && text.slice(trimmed.length).includes("\n")
      ? definition.from + trimmed.length
      : definition.to;
  for (
    let next = type === "var" ? definition.nextSibling : null;
    next;
    next = next.nextSibling
  ) {
    if (next.name === "LuauTypeOperatorLineContinuation") {
      const lineText = read(next.from, next.to);
      const lineTrimmed = lineText.trimEnd();
      start = lineText.slice(lineTrimmed.length).includes("\n")
        ? next.from + lineTrimmed.length
        : next.to;
    } else if (!UNION_LINE_BRIDGE.has(next.name)) {
      break;
    }
  }
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
  let to: number | undefined;
  let block: Node | null = definition;
  for (; block; block = block.parent as Node | null) {
    if (
      LUAU_BLOCKS.has(block.name) &&
      !(type === "function" && block === definition) &&
      !(ALTERNATOR_CANDIDATES.has(block.name) && !opensAlternator(block))
    ) {
      break;
    }
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
    return { from: start, to: getSectionEnd(tree, definition) };
  }
  if (REPEAT_LOOPS.has(block.name)) {
    let after = block.nextSibling;
    while (after && (after.name === "Newline" || after.name.endsWith("Whitespace"))) {
      after = after.nextSibling;
    }
    if (after && isExplicitRuleName(after.name, "LuauUntilCondition")) {
      to = after.to;
    }
  }
  return { from: start, to: to ?? block.to };
};

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
    { type: DeclarationType; from: number; scopePath: string }
  >();
  const visibleSectionParameters = new Map<string, Set<string>>();
  const file = (scopePath: string, type: DeclarationType, name: string) => {
    scopes[scopePath] ??= {};
    scopes[scopePath][type] ??= [];
    scopes[scopePath][type]!.push(name);
  };
  for (const [uri, { annotations, tree, read }] of scripts) {
    let scopePathParts: {
      kind: "scene" | "branch";
      name: string;
    }[] = [];
    const inCursorScript = uri === cursor.uri;
    const cursorSection = inCursorScript && tree
      ? getParentSectionPath(getStack<SparkdownNodeName>(tree, cursor.offset, -1), read)
      : [];
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
          if (
            localScope &&
            cursor.offset > localScope.from &&
            cursor.offset <= localScope.to
          ) {
            const previous = visibleLocals.get(text);
            if (!previous || localScope.from > previous.from) {
              visibleLocals.set(text, { type, from: localScope.from, scopePath: "" });
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
          file("", type, text);
        }
        if (type === "define") {
          file("", type, text.trim().replaceAll(/[ ]+/g, "."));
        }
        if (type === "label" || type === "param") {
          const sectionParts = scopePathParts.map((p) => p.name);
          const scopePath = sectionParts.join(".");
          if (type === "param" && inCursorScript && sectionParts.length > 0 &&
              cur.to < cursor.offset &&
              sectionParts.every((part, index) => part === cursorSection[index])) {
            const parameters = visibleSectionParameters.get(scopePath) ?? new Set<string>();
            parameters.add(text);
            visibleSectionParameters.set(scopePath, parameters);
            const previous = visibleLocals.get(text);
            if (!previous || cur.to > previous.from) {
              visibleLocals.set(text, { type, from: cur.to, scopePath });
            }
          }
          file(scopePath, type, text);
        }
        cur.next();
      }
    }
  }
  const bindingTypes: DeclarationType[] = [
    "var",
    "param",
    "const",
    "function",
    "define",
  ];
  for (const [scopePath, scope] of Object.entries(scopes)) {
    for (const type of bindingTypes) {
      const names = scope[type];
      if (names) {
        scope[type] = names.filter((name) =>
          !visibleLocals.has(name) ||
          (type === "param" && scopePath !== "" &&
            !visibleSectionParameters.get(scopePath)?.has(name)),
        );
      }
    }
  }
  for (const [name, { type, scopePath }] of visibleLocals) {
    file(scopePath, type, name);
  }
  return scopes;
};
