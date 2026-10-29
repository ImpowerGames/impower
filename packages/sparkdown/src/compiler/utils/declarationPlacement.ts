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

/** What a `local` binding outside a scene, a branch, a choice's body and a
 *  function reports. */
export const LOCAL_OUTSIDE_FLOW_MESSAGE =
  "local declaration must be inside a scene, branch or function; use store or const at the top level";

/** What a `store` declaration inside a scene or a branch reports. */
export const STORE_INSIDE_FLOW_MESSAGE =
  "store declaration must be at the top level; assign it here with & name = value instead";

/** What a hoisted declaration other than a `store` reports inside a scene or
 *  a branch: `const`, `function`, `type` and `external` are declarations,
 *  and a `define` and each definition written like one go by their own
 *  keyword. */
export const hoistedInsideFlowMessage = (keyword: string): string =>
  DEFINE_KEYWORDS.has(keyword)
    ? `${keyword} must be at the top level`
    : `${keyword} declaration must be at the top level`;

/** Whether `message` is a placement error's, which says where a declaration
 *  or a statement stands and nothing of how it reads: the reporters of
 *  syntax errors do not take it for a report of the statement's errors. */
export const isPlacementMessage = (message: string): boolean =>
  message === TOP_LEVEL_STATEMENT_MESSAGE ||
  message === LOCAL_OUTSIDE_FLOW_MESSAGE ||
  message === STORE_INSIDE_FLOW_MESSAGE ||
  / must be at the top level$/.test(message);

/** The `data` of a `store` diagnostic inside a flow that the language server
 *  offers to change to an assignment: the text that replaces the
 *  diagnostic's range. */
export interface AssignmentFixData {
  assignment: string;
}

/** The text `data` gives a `store` diagnostic's range as an assignment, if
 *  it is one's. */
export const assignmentFixOf = (data: unknown): string | undefined => {
  const assignment = (data as Partial<AssignmentFixData> | undefined)
    ?.assignment;
  return typeof assignment === "string" ? assignment : undefined;
};

/** A declaration written where it cannot be: the range reported, from where
 *  it starts to the end of its first line, its message, the start of the
 *  top-level statement it is written in when it is that statement (or the
 *  one statement of its `&` line), and for a `store` the text that replaces
 *  the range as an assignment, when it can be one. */
export interface MisplacedDeclaration {
  from: number;
  to: number;
  message: string;
  statement?: number;
  assignment?: string;
}

// The keyword of each definition written like a define, by its node.
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

// The choices that start the bodies a `local` can be written in at the top
// level, and the `then` clause of their `choose` block.
const CHOICES = nodeNameSet(["Choice"]);
const THEN_CLAUSES = nodeNameSet(["LuauSparkdownChooseThenClause"]);

/** Whether a node can hold a statement: the statements of the top level and
 *  of a flow's body, the blocks they open and their clauses. Nodes of an
 *  expression hold none, and nor do the narrative's own lines. */
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

/**
 * The declarations of a script written where they cannot be. A `local`
 * binding (a `local` statement, a `local function`, and either one marked
 * with `&`) belongs to a scene, a branch, a choice's body or a function, so
 * one at the top level, or in a block the top level opens, is misplaced. A
 * hoisted declaration (`store`, `const`, `define` and the definitions written
 * like one, `function`, `type` and `external`) belongs to the top level, so
 * one anywhere in a scene's or a branch's body is misplaced. Inside a
 * function both are the function's own and none is misplaced.
 *
 * A scene's or a branch's body is written at the top level up to its `end`,
 * so the flows are followed as `topLevelStatements` follows them.
 */
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
    // A statement's node starts with the indentation before it.
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

  // A statement of the top level, or of a block the top level opens.
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
    // A function's body, a `type function`'s included, declares its own
    // locals, and a definition's body holds members.
    if (
      FUNCTIONS.has(node.name) ||
      DEFINES.has(node.name) ||
      TYPES.has(node.name) ||
      EXTERNALS.has(node.name)
    ) {
      return;
    }
    // The statements after a choice, up to the next choice or its block's
    // `then` clause, are that choice's body, which declares in a scope of
    // its own, whether the choice stands in a `choose` block or in a block
    // inside one; the `then` clause is the top level's again. A declaration
    // holds the statements Luau reads after it on its line, past a block
    // comment (`store x = 1 --[[c]] local y = 2`).
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

  // A statement of a scene's or a branch's body, at any depth.
  // A narrative `store` line is changed to an assignment by marking it; one
  // already marked, or written as Luau, by dropping its keyword.
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
      // A declaration holds the statements Luau reads after it on its line,
      // past a block comment, which the walk below reaches.
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
      // A display line, a choice, a divert: none declares.
      continue;
    } else if (depth === 0) {
      atTopLevel(node, node.from);
    } else {
      inFlow(node, false);
    }
  }
  return found;
}

/** Whether a statement binds a local: a `local` declaration or a
 *  `local function`. */
const isLocal = (
  node: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean =>
  (VARIABLE_DEFINITION_NAMES.has(node.name) || FUNCTIONS.has(node.name)) &&
  scopeOf(node, read) === "local";

/** Whether a marked line's content binds a local in any of its
 *  statements. */
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

/**
 * The text that replaces a `store` declaration's first line, from its start
 * to `to`, to assign its names instead: `store x = 1` is `& x = 1`, and on a
 * line `&` already marks, the declaration loses its keyword. Undefined when
 * the assignment would not do what the declaration does: a declaration with
 * no `=`, one that gives a name a type, and one whose names are more or fewer
 * than its values, since the names then take a call's further values or nil.
 */
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
