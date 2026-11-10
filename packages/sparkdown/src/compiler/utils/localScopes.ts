import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type Tree } from "@lezer/common";
import { findOwnDeclarationName } from "../lower/utils/findOwnDeclarationName";
import { type SparkdownNodeName } from "../types/SparkdownNodeName";
import { ALTERNATOR_CANDIDATES, opensAlternator } from "./alternatorDecision";
import { ancestorMatching } from "./ancestorMatching";
import { isExplicitRuleName } from "./explicitRuleNames";
import { nodeNameSet } from "./nodeNameSet";
import { TRAILING_STATEMENT_NAMES } from "./trailingStatementNames";
import { VARIABLE_DEFINITION_NAMES } from "./variableDefinitionNames";

type Node = GrammarSyntaxNode<SparkdownNodeName>;

export type LocalScope = { from: number; to: number };

const LOCAL_ONLY: ReadonlySet<string> = new Set(["local"]);

export const LOCAL_SCOPE_NODES = {
  functionLike: nodeNameSet(["LuauFunctionDefinition", "LuauMethodDefinition", "LuauFunctionTypeDeclaration"]),
  parameterOwnerContents: nodeNameSet([
    "LuauFunctionDefinition_content",
    "LuauMethodDefinition_content",
    "LuauFunctionTypeDeclaration_content",
  ]),
  parameterOwners: nodeNameSet([
    "LuauFunctionDefinition",
    "LuauMethodDefinition",
    "LuauFunctionTypeDeclaration",
    "LuauComponent",
    "Scene",
    "Branch",
  ]),
  constScopes: nodeNameSet([
    "LuauFunctionDefinition",
    "LuauMethodDefinition",
    "LuauFunctionTypeDeclaration",
    "LuauSparkleHandlerClosure",
  ]),
  rootNames: nodeNameSet(["LuauVariableName", "LuauFunctionName", "LuauStdLibConstants", "LuauStdLibGlobals"]),
  forLoopContents: nodeNameSet([
    "LuauForLoop_content",
    "LuauSparkdownForLoop_content",
    "LuauSparkdownExplicitLoop_content",
    "LuauSparkleForLoop_content",
    "LuauSparkleBlockFor_content",
  ]),
  forConditions: nodeNameSet(["LuauForCondition", "LuauSparkdownExplicitLoopCondition"]),
  forElses: nodeNameSet(["LuauSparkleBlockElse", "LuauSparkleElseBlock"]),
  repeatLoops: nodeNameSet(["LuauRepeatLoop", "LuauSparkdownRepeatLoop", "LuauSparkdownExplicitRepeatLoop"]),
  untilConditions: nodeNameSet(["LuauUntilCondition"]),
  eventHandlers: nodeNameSet([
    "LuauSparkleHandlerClosure",
    "LuauEventAttribute_content",
    "LuauSparkleEventHandler",
    "LuauSparkleEventParenAttribute_content",
  ]),
  eventParameters: new Set(["event"]),
};

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

const REPEAT_LOOPS = LOCAL_SCOPE_NODES.repeatLoops;

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

export const getLocalScope = (
  tree: Tree,
  from: number,
  read: (from: number, to: number) => string,
  inCursorScript: boolean,
  type: "var" | "function",
  modifiers: ReadonlySet<string> = LOCAL_ONLY,
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
  if (!modifier || !modifiers.has(read(modifier.from, modifier.to).trim())) {
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

export const getParameterScope = (
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
    !LOCAL_SCOPE_NODES.parameterOwnerContents.has(owner.name)
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
