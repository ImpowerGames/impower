import type { SyntaxNode } from "@lezer/common";
import { findOwnDeclarationName } from "../lower/utils/findOwnDeclarationName";
import {
  EXPLICIT,
  FLOWS,
  TOP_LEVEL_STATEMENT_MESSAGE,
  childEndingWith,
  findWithin,
  scopeOf,
} from "./declarationOnly";
import { isExplicitRuleName } from "./explicitRuleNames";
import { nodeNameSet } from "./nodeNameSet";
import {
  VARIABLE_DEFINITION_NAMES,
  ownAssignmentOperation,
} from "./variableDefinitionNames";

export const LOCAL_OUTSIDE_FLOW_MESSAGE =
  "local declaration must be inside a scene, branch or function; use store or const at the top level";

export const STORE_INSIDE_FLOW_MESSAGE =
  "store declaration must be at the top level; assign it here with & name = value instead";

export const hoistedInsideFlowMessage = (keyword: string): string =>
  DEFINE_KEYWORDS.has(keyword)
    ? `${keyword} must be at the top level`
    : `${keyword} declaration must be at the top level`;

export const isPlacementMessage = (message: string): boolean =>
  message === TOP_LEVEL_STATEMENT_MESSAGE ||
  message === LOCAL_OUTSIDE_FLOW_MESSAGE ||
  message === STORE_INSIDE_FLOW_MESSAGE ||
  / must be at the top level$/.test(message);

export interface AssignmentFixData {
  assignment: string;
}

export const assignmentFixOf = (data: unknown): string | undefined => {
  const assignment = (data as Partial<AssignmentFixData> | undefined)
    ?.assignment;
  return typeof assignment === "string" ? assignment : undefined;
};

export interface MisplacedDeclaration {
  from: number;
  to: number;
  message: string;
  statement?: number;
  assignment?: string;
}

const DEFINES = new Map<string, string>([
  ["LuauDefine", "define"],
  ["LuauStyle", "style"],
  ["LuauLayout", "layout"],
  ["LuauScreen", "screen"],
  ["LuauComponent", "component"],
  ["LuauAnimation", "animation"],
  ["LuauTheme", "theme"],
  ["LuauMorph", "morph"],
]);
const DEFINE_KEYWORDS = new Set(DEFINES.values());

const TYPES = nodeNameSet([
  "LuauDataTypeDeclaration",
  "LuauFunctionTypeDeclaration",
]);
const EXTERNALS = nodeNameSet(["LuauExternalDeclaration"]);
const FUNCTIONS = nodeNameSet([
  "LuauFunctionDefinition",
  "LuauFunctionAttributes",
]);

const CHOICES = nodeNameSet(["Choice"]);
const THEN_CLAUSES = nodeNameSet(["LuauSparkdownChooseThenClause"]);

const holdsStatements = (name: string): boolean =>
  name.startsWith("Luau") &&
  !name.endsWith("Expression") &&
  !name.endsWith("AccessPath") &&
  !name.endsWith("FunctionCall") &&
  !name.endsWith("Condition") &&
  !name.endsWith("Reassignment") &&
  !name.endsWith("Keyword") &&
  !name.endsWith("Comment") &&
  !name.endsWith("Whitespace");

export function misplacedDeclarations(
  top: SyntaxNode,
  read: (from: number, to: number) => string,
): MisplacedDeclaration[] {
  const found: MisplacedDeclaration[] = [];
  const report = (
    node: SyntaxNode,
    message: string,
    statement: number | undefined,
    assignment?: (to: number) => string | undefined,
  ) => {
    const text = read(node.from, node.to);
    const from = node.from + (text.length - text.trimStart().length);
    const lineEnd = text.indexOf("\n", from - node.from);
    const to = node.from + (lineEnd < 0 ? text.trimEnd().length : lineEnd);
    const fix = assignment?.(to);
    found.push({
      from,
      to,
      message,
      ...(statement !== undefined ? { statement } : {}),
      ...(fix !== undefined ? { assignment: fix } : {}),
    });
  };

  const atTopLevel = (node: SyntaxNode, statement?: number) => {
    if (EXPLICIT.has(node.name)) {
      const content = childEndingWith(node, "_content");
      const local = content && localIn(content, read);
      if (local) {
        report(node, LOCAL_OUTSIDE_FLOW_MESSAGE, statement);
        return;
      }
    }
    if (isLocal(node, read)) {
      report(node, LOCAL_OUTSIDE_FLOW_MESSAGE, statement);
      return;
    }
    if (
      FUNCTIONS.has(node.name) ||
      DEFINES.has(node.name) ||
      TYPES.has(node.name) ||
      EXTERNALS.has(node.name)
    ) {
      return;
    }
    let inChoice = false;
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (CHOICES.has(child.name)) {
        inChoice = true;
      } else if (THEN_CLAUSES.has(child.name)) {
        inChoice = false;
        atTopLevel(child);
      } else if (!inChoice && holdsStatements(child.name)) {
        atTopLevel(child);
      }
    }
  };

  const inFlow = (node: SyntaxNode, marked: boolean) => {
    if (FUNCTIONS.has(node.name)) {
      const definition =
        node.name === "LuauFunctionAttributes"
          ? (findWithin(node, "LuauFunctionDefinition") ?? node)
          : node;
      if (
        findOwnDeclarationName(definition) &&
        scopeOf(node, read) !== "local"
      ) {
        report(node, hoistedInsideFlowMessage("function"), undefined);
      }
      return;
    }
    const keyword =
      DEFINES.get(node.name) ??
      (TYPES.has(node.name)
        ? "type"
        : EXTERNALS.has(node.name)
          ? "external"
          : undefined);
    if (keyword) {
      report(node, hoistedInsideFlowMessage(keyword), undefined);
      return;
    }
    if (VARIABLE_DEFINITION_NAMES.has(node.name)) {
      const scope = scopeOf(node, read);
      if (scope === "store") {
        report(node, STORE_INSIDE_FLOW_MESSAGE, undefined, (to) =>
          asAssignment(
            node,
            to,
            marked || node.name !== "LuauSparkdownVariableDefinition",
            read,
          ),
        );
      } else if (scope === "const") {
        report(node, hoistedInsideFlowMessage("const"), undefined);
      }
    }
    const marks = marked || EXPLICIT.has(node.name);
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (holdsStatements(child.name)) {
        inFlow(child, marks);
      }
    }
  };

  let depth = 0;
  for (let node = top.firstChild; node; node = node.nextSibling) {
    if (FLOWS.has(node.name)) {
      depth += 1;
    } else if (node.name === "LuauEndKeyword") {
      depth = Math.max(0, depth - 1);
    } else if (!holdsStatements(node.name)) {
      continue;
    } else if (depth === 0) {
      atTopLevel(node, node.from);
    } else {
      inFlow(node, false);
    }
  }
  return found;
}

const isLocal = (
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean =>
  (VARIABLE_DEFINITION_NAMES.has(node.name) || FUNCTIONS.has(node.name)) &&
  scopeOf(node, read) === "local";

const localIn = (
  content: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean => {
  for (let child = content.firstChild; child; child = child.nextSibling) {
    if (isLocal(child, read)) {
      return true;
    }
  }
  return false;
};

const asAssignment = (
  definition: SyntaxNode,
  to: number,
  marked: boolean,
  read: (from: number, to: number) => string,
): string | undefined => {
  const header = childEndingWith(definition, "_begin");
  const modifier = header && findWithin(header, "LuauScopeModifier");
  const content = childEndingWith(definition, "_content");
  if (!modifier || !content) {
    return undefined;
  }
  let names = 0;
  let values = 0;
  for (let child = content.firstChild; child; child = child.nextSibling) {
    if (
      child.name.endsWith("Separator") ||
      child.name.endsWith("Whitespace") ||
      child.name.endsWith("Comment") ||
      child.name === "Newline"
    ) {
      continue;
    }
    if (values > 0) {
      values += 1;
      continue;
    }
    if (!isExplicitRuleName(child.name, "LuauVariableAssignment")) {
      return undefined;
    }
    const assignmentContent = childEndingWith(child, "_content");
    for (
      let part = assignmentContent?.firstChild;
      part;
      part = part.nextSibling
    ) {
      if (part.name.includes("TypeAnnotation")) {
        return undefined;
      }
    }
    names += 1;
    if (ownAssignmentOperation(child)) {
      values = 1;
    }
  }
  if (values === 0 || names !== values) {
    return undefined;
  }
  const rest = read(modifier.to, to).trimStart();
  return marked ? rest : `& ${rest}`;
};
