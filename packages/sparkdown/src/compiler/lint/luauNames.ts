// The names in Luau code, for the lints that reason about names: in each
// function, what each name declares and which declaration every occurrence
// refers to; and across a program, every global and global function with its
// definitions and uses.
//
// A script's facts (`ScriptNames`) depend only on its own tree, so the
// compiler keeps them with the script's lints until the script changes. The
// program-wide index (`indexProgramNames`) combines the facts of every script
// for a rule that looks at the whole program; no rule calls it yet.
//
// Like the lints themselves, the model errs toward silence where the tree is
// uncertain: an occurrence that might be a read counts as one, and one that
// might refer to either of two declarations lists both.

import { type SyntaxNode } from "@lezer/common";
import {
  childNamed,
  childrenOf,
  contentOf,
  END_BLOCKS,
  type Found,
  hasEnd,
  IF_ARMS,
  isTrivia,
  outermostFunction,
  soleVariableName,
  type Source,
  type TokenAt,
  trimmedRange,
} from "./luauTree";

export type DeclarationKind =
  | "local"
  | "parameter"
  | "loopVariable"
  | "localFunction";

// Where a declaration's scope starts is uncertain on one line: the grammar
// can nest the statements after `local a = 1` inside the declaration, so its
// end is not where the next statement begins. A declaration therefore has two
// starts, each erring toward silence. Reads count from right after the
// declared names, so a read in a nested statement is never missed; the
// declaration hides an outer one of the same name only from the statement's
// end, so a read of the outer one in the initializer (`local x = x + 1`)
// still counts for it.
export interface Declaration {
  name: string;
  kind: DeclarationKind;
  /** Where the name is written in its declaration. */
  nameFrom: number;
  nameTo: number;
  /** Occurrences in `[readsFrom, scopeTo)` can refer to this declaration. */
  readsFrom: number;
  /** In `[hidesFrom, scopeTo)` the name no longer means an outer one. */
  hidesFrom: number;
  scopeTo: number;
  /** Whether the grammar nested the declaring statement inside another
   *  (`local a = 1 local b = a`, or `& local x = 5` in a function). Its scope
   *  is taken to run to the end of the nearest enclosing block, and since
   *  where its statement ends is uncertain, it hides no outer declaration:
   *  a later occurrence of the name can refer to either. */
  nested: boolean;
}

/**
 * - `read`: any occurrence that is not one of the others.
 * - `write`: the whole target of a plain `=` assignment.
 * - `compoundWrite`: the whole target of `+=` and the like, which also reads.
 * - `functionName`: the name in `function name()` when it names a local,
 *   which assigns the function to that local.
 */
export type OccurrenceKind = "read" | "write" | "compoundWrite" | "functionName";

export interface Occurrence {
  name: string;
  from: number;
  to: number;
  kind: OccurrenceKind;
  /** The declarations the occurrence can refer to, innermost first. Empty
   *  for a global. More than one only where the tree cannot say which: an
   *  occurrence inside a `local` statement after its names can be the new
   *  local (in a statement the grammar nested there) or the one it hides
   *  (in the initializer). */
  declarations: Declaration[];
}

export interface FunctionNames {
  /** An outermost function definition. The names of the functions nested in
   *  it are part of its facts. */
  node: SyntaxNode;
  /** Whether every `end`-closed block in the function found its `end`. When
   *  one did not, the declarations stop at it and there are no occurrences:
   *  the tree past that point does not show what the author wrote. */
  closed: boolean;
  declarations: Declaration[];
  /** Every occurrence of a name in the function other than a declaration or
   *  a global's definition, in source order. Anything the tree does not mark
   *  as something else (a field, a method, a string, a comment) counts, so
   *  a use is never missed. */
  occurrences: Occurrence[];
}

export type GlobalDefinitionKind = "function" | "store" | "const";

export interface GlobalDefinition {
  name: string;
  kind: GlobalDefinitionKind;
  nameFrom: number;
  nameTo: number;
}

export interface ScriptNames {
  /** The script's outermost functions, in source order. */
  functions: FunctionNames[];
  /** Global functions (`function f()` whose name refers to no local) and
   *  `store` and `const` declarations, in source order. Those inside a
   *  function that is not closed are left out. */
  globalDefinitions: GlobalDefinition[];
  /** The occurrences inside closed functions that refer to no local, by
   *  name. */
  globalOccurrences: Map<string, { fn: FunctionNames; occurrence: Occurrence }[]>;
  /** Every use of `name` outside the closed functions: narrative logic lines
   *  (`& f()`), interpolations, Sparkle handlers (`@click=f`) and top-level
   *  Luau. Only a Luau variable, function or handler name counts there, since
   *  most of that text is prose. Found on the first request for the name and
   *  kept. */
  usesOutsideFunctions(name: string): Occurrence[];
}

// The blocks a local's scope can end with.
const BLOCK_CONTENTS = new Set([
  "LuauFunctionBody_content",
  "LuauFunctionDefinition_content",
  "LuauDoBlock_content",
  "LuauIfBlock_content",
  "LuauElseifBlock_content",
  "LuauElseBlock_content",
  "LuauRepeatLoop_content",
]);

/** The end of the block `stmt` is written in, or null when that is not a
 *  Luau block. */
function blockEnd(stmt: SyntaxNode): number | null {
  const block = stmt.parent;
  if (!block || !BLOCK_CONTENTS.has(block.name)) return null;
  // The `then` arm of an `if` ends where its first `elseif` or `else` begins.
  for (let s = stmt.nextSibling; s; s = s.nextSibling) {
    if (IF_ARMS.has(s.name)) return s.from;
  }
  // A multi-line `repeat` leaves its `until` as the loop's next sibling, and
  // the `until` condition still sees the body's locals.
  if (block.name === "LuauRepeatLoop_content") {
    let after = block.parent?.nextSibling;
    while (after && isTrivia(after)) after = after.nextSibling;
    if (after?.name === "LuauUntilStatement") return after.to;
  }
  return block.to;
}

/** Where the scope of a declaration made by `stmt` ends, and whether the
 *  grammar nested `stmt` inside another statement, whose block it then takes;
 *  or null when no Luau block encloses it within its function. */
function scopeEnd(stmt: SyntaxNode) {
  const end = blockEnd(stmt);
  if (end !== null) return { end, nested: false };
  for (let p = stmt.parent; p && p.name !== "LuauFunctionDefinition"; p = p.parent) {
    const outer = blockEnd(p);
    if (outer !== null) return { end: outer, nested: true };
  }
  return null;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
const IDENTIFIERS = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;

// Luau's reserved words, which are never a name.
const RESERVED = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
]);

/** The name `token`'s text starts with, and where it starts. */
function nameAt(token: SyntaxNode, src: Source) {
  const { from } = trimmedRange(token, src);
  const name = src.read(from, token.to).match(IDENTIFIER)?.[0];
  return name ? { name, from } : null;
}

/** The tokens of the names a `local`, `store` or `const` statement declares. */
function declaredNames(definition: SyntaxNode): SyntaxNode[] {
  const names: SyntaxNode[] = [];
  for (const assignment of childrenOf(contentOf(definition))) {
    if (assignment.name !== "LuauVariableAssignment") continue;
    const nameBegin = childNamed(assignment, "LuauVariableAssignment_begin");
    const token = nameBegin?.firstChild?.firstChild;
    if (token?.name === "LuauVariableName") names.push(token);
    // The names end at the `=`; in `local a = b, c` the grammar also wraps
    // the value `c` as an assignment.
    if (childNamed(assignment, "LuauVariableAssignment_content")) break;
  }
  return names;
}

/** The scope keyword a `LuauVariableDefinition` begins with, if any. */
function scopeOf(definition: SyntaxNode, src: Source): string {
  const begin = childNamed(definition, "LuauVariableDefinition_begin");
  return begin ? src.read(begin.from, begin.to).trim() : "";
}

/** Whether a function definition begins with `local`. */
function isLocalFunction(fn: SyntaxNode, src: Source) {
  const begin = childNamed(fn, "LuauFunctionDefinition_begin");
  return begin !== null && /^local\b/.test(src.read(begin.from, begin.to).trim());
}

/** One walk over an outermost function: the names it declares, and whether
 *  every `end`-closed block in it (itself included) found its `end`. The walk
 *  reads each node's name from the cursor and builds a node object only for
 *  the few kinds it looks inside. */
function readDeclarations(
  fn: SyntaxNode,
  src: Source,
): { declarations: Declaration[]; closed: boolean } {
  const declarations: Declaration[] = [];
  let closed = true;
  const add = (
    token: SyntaxNode,
    kind: DeclarationKind,
    readsFrom: number,
    hidesFrom: number,
    scopeTo: number,
    nested = false,
  ) => {
    const found = nameAt(token, src);
    if (!found) return;
    declarations.push({
      name: found.name,
      kind,
      nameFrom: found.from,
      nameTo: found.from + found.name.length,
      readsFrom,
      hidesFrom: nested ? scopeTo : hidesFrom,
      scopeTo,
      nested,
    });
  };
  const cursor = fn.cursor();
  do {
    const kind = cursor.name;
    if (
      kind !== "LuauFunctionDefinition" &&
      kind !== "LuauVariableDefinition" &&
      kind !== "LuauForLoop" &&
      !END_BLOCKS.has(kind)
    ) {
      continue;
    }
    const node = cursor.node;
    if (END_BLOCKS.has(kind) && !hasEnd(node)) {
      closed = false;
      break;
    }
    if (node.name === "LuauFunctionDefinition") {
      const content = contentOf(node);
      const paramsNode = childNamed(content, "LuauFunctionParameters");
      for (const p of childrenOf(contentOf(paramsNode))) {
        if (p.name === "LuauFunctionParameter") {
          add(p, "parameter", p.to, p.to, node.to);
        }
      }
      // A method (`function t:m()`, whose name the grammar reads as an access
      // path) has `self` as a parameter it does not write; its declaration is
      // the `:`.
      const colon =
        content && paramsNode
          ? src.read(content.from, paramsNode.from).indexOf(":")
          : -1;
      if (content && paramsNode && colon >= 0) {
        const at = content.from + colon;
        declarations.push({
          name: "self",
          kind: "parameter",
          nameFrom: at,
          nameTo: at,
          readsFrom: paramsNode.from,
          hidesFrom: paramsNode.from,
          scopeTo: node.to,
          nested: false,
        });
      }
      const nameNode = childNamed(content, "LuauFunctionDeclarationName");
      const scope = isLocalFunction(node, src) ? scopeEnd(node) : null;
      if (nameNode && scope) {
        const at = nameNode.to;
        add(nameNode, "localFunction", at, at, scope.end, scope.nested);
      }
    } else if (node.name === "LuauVariableDefinition") {
      if (scopeOf(node, src) !== "local") continue;
      const scope = scopeEnd(node);
      if (!scope) continue;
      const names = declaredNames(node);
      const readsFrom = names.length > 0 ? names[names.length - 1]!.to : node.to;
      for (const token of names) {
        add(token, "local", readsFrom, node.to, scope.end, scope.nested);
      }
    } else if (node.name === "LuauForLoop") {
      const header = contentOf(childNamed(contentOf(node), "LuauForCondition"));
      const body = childNamed(contentOf(node), "LuauDoBlock");
      if (!header || !body) continue;
      // The loop variables are the names before `=` or `in`.
      for (const c of childrenOf(header)) {
        if (c.name === "LuauCommaSeparator" || isTrivia(c)) continue;
        const token = c.name === "LuauAccessPath" ? soleVariableName(c) : null;
        if (!token) break;
        add(token, "loopVariable", body.from, body.from, body.to);
      }
    }
  } while (cursor.next() && cursor.from < fn.to);
  return { declarations, closed };
}

/** The declarations among `candidates` (those of one name) that an
 *  occurrence at `pos` can refer to, innermost first. */
function resolve(candidates: Declaration[] | undefined, pos: number) {
  if (!candidates) return [];
  return candidates
    .filter(
      (d) =>
        pos >= d.readsFrom &&
        pos < d.scopeTo &&
        // Not hidden by a later declaration of the name within its scope.
        !candidates.some(
          (s) =>
            s.nameFrom > d.nameFrom &&
            s.nameFrom < d.scopeTo &&
            pos >= s.hidesFrom &&
            pos < s.scopeTo,
        ),
    )
    .sort((a, b) => b.nameFrom - a.nameFrom);
}

// A token that is a keyword or a name in a type rather than a variable: the
// contextual `continue` and `type`, a scope word (`store`), a Sparkdown
// structural word (`style`, `layout`, `match`), a named or primitive type
// (`Point`, `number`) or a field of a table type. The grammar marks a
// structural word as the keyword of its construct even where the author
// meant a name (`print(style)`), and the compiler then reads no variable
// there, so such a token is never a use of a global. The grammar marks the
// text a token captures with a `_c<n>` suffix. `self` is a keyword token too,
// but it is a variable: it names a local, a method's parameter or, failing
// both, a global the compiler reads.
const NOT_A_VARIABLE =
  /^Luau(?:(?!Self)\w*(?:Keyword|Modifier)|TypeName|PrimitiveType|TypePropertyName)(?:_c\d+)?$/;

/** Whether an occurrence is a use, given whether it refers to a local. A
 *  keyword or a name in a type that refers to a local counts as a read of it,
 *  so a local named `style` or `number` is not reported unused; one that
 *  refers to no local is not a use. */
function isUse(token: SyntaxNode, resolved: boolean) {
  return resolved || !NOT_A_VARIABLE.test(token.name);
}

// Tokens whose text is never a use of a variable.
function isNonReference(token: SyntaxNode): boolean {
  if (token.name === "LuauPropertyName") return true;
  if (
    token.name === "LuauFunctionName" &&
    token.parent?.name === "LuauFunctionAccessor"
  ) {
    return true;
  }
  // A string or comment is within the statement; a block or function above
  // the token means it is code.
  for (let p: SyntaxNode | null = token; p; p = p.parent) {
    if (BLOCK_CONTENTS.has(p.name) || p.name === "LuauFunctionDefinition") {
      return false;
    }
    if (p.name.includes("Comment")) return true;
    if (p.name === "LuauBacktickStringInterpolation") return false;
    if (
      p.name === "LuauDoubleQuotedString" ||
      p.name === "LuauSingleQuotedString" ||
      p.name === "LuauInterpolatedString" ||
      p.name === "LuauMultilineString"
    ) {
      return true;
    }
  }
  return false;
}

// The statements an assignment's targets are written in: an assignment in
// Luau code, and a narrative logic line (`& hp = 5`).
const ASSIGNMENT_STATEMENTS = new Set([
  "LuauReassignment_content",
  "LuauExplicitStatement_content",
]);

/** The assignment operator when `token` is a whole target of an assignment
 *  (`=`, `+=` and the like), or null. */
function assignmentOperator(token: SyntaxNode, src: Source): string | null {
  // A bare name's path is five levels up: its content, the part, the
  // variable and the variable's capture wrap the name.
  let path: SyntaxNode | null = token;
  for (let up = 0; path && path.name !== "LuauAccessPath"; up++) {
    path = up < 5 ? path.parent : null;
  }
  // Nodes are compared by position: the tree hands out a fresh object for
  // the same node on every visit.
  if (!path || soleVariableName(path)?.from !== token.from) return null;
  if (!ASSIGNMENT_STATEMENTS.has(path.parent?.name ?? "")) return null;
  // Targets come before the operator; what follows it are values.
  for (let s = path.nextSibling; s; s = s.nextSibling) {
    if (s.name === "LuauAssignmentOperation") {
      const op = childNamed(contentOf(s), "LuauAssignmentOperator");
      return op ? src.read(op.from, op.to).trim() : null;
    }
  }
  return null;
}

/** How the occurrence of a name at `pos` uses it, or null when it is not a
 *  use: a field after `.` (but not the `..` operator), a method after `:`, a
 *  property name, or text in a string or comment. */
function useAt(pos: number, token: SyntaxNode, src: Source) {
  const before = src.read(Math.max(0, pos - 2), pos);
  if (/(^|[^.])\.$|:$/.test(before)) return null;
  if (isNonReference(token)) return null;
  const op = assignmentOperator(token, src);
  return op === null ? "read" : op === "=" ? "write" : "compoundWrite";
}

// Outside functions, the tokens that name a variable or function. A
// structural word there (`{match}`, `& layout("x")`) is a keyword token, and
// the compiler reads no variable for it.
const REFERENCES = new Set([
  "LuauVariableName",
  "LuauFunctionName",
  "LuauSparkleEventHandlerName",
]);

/** A single-name `function name()` statement's name token and name, or null
 *  for a `local function`, a field (`function a.b()`) or a method. */
function functionStatementName(fn: SyntaxNode, src: Source) {
  if (isLocalFunction(fn, src)) return null;
  const nameNode = childNamed(contentOf(fn), "LuauFunctionDeclarationName");
  if (!nameNode) return null;
  const text = src.read(nameNode.from, nameNode.to).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return null;
  const from = trimmedRange(nameNode, src).from;
  return { name: text, from, to: from + text.length };
}

/** Where each name occurs in `[from, to)`, in order. */
function identifiersIn(text: string, from: number, to: number) {
  const found = new Map<string, number[]>();
  for (const match of text.slice(from, to).matchAll(IDENTIFIERS)) {
    if (RESERVED.has(match[0])) continue;
    let list = found.get(match[0]);
    if (!list) found.set(match[0], (list = []));
    list.push(from + match.index!);
  }
  return found;
}

function readOccurrences(
  fn: FunctionNames,
  text: string,
  tokenAt: TokenAt,
  src: Source,
  skip: Set<number>,
  functionNames: Set<number>,
) {
  const byName = new Map<string, Declaration[]>();
  for (const d of fn.declarations) {
    let list = byName.get(d.name);
    if (!list) byName.set(d.name, (list = []));
    list.push(d);
  }
  for (const [name, positions] of identifiersIn(text, fn.node.from, fn.node.to)) {
    const candidates = byName.get(name);
    for (const pos of positions) {
      if (skip.has(pos)) continue;
      let kind: OccurrenceKind | null = "functionName";
      const declarations = resolve(candidates, pos);
      if (!functionNames.has(pos)) {
        const token = tokenAt(pos);
        kind = useAt(pos, token, src);
        if (kind && !isUse(token, declarations.length > 0)) continue;
      }
      if (!kind) continue;
      fn.occurrences.push({
        name,
        from: pos,
        to: pos + name.length,
        kind,
        declarations,
      });
    }
  }
  fn.occurrences.sort((a, b) => a.from - b.from);
}

/** The facts about names in one script. `found` is the script's constructs,
 *  and `text` its whole text. */
export function readScriptNames(
  text: string,
  src: Source,
  tokenAt: TokenAt,
  found: Found,
): ScriptNames {
  const functions: FunctionNames[] = [];
  const byNode = new Map<number, FunctionNames>();
  for (const node of found.functions) {
    if (outermostFunction(node)?.from !== node.from) continue;
    const fn: FunctionNames = {
      node,
      ...readDeclarations(node, src),
      occurrences: [],
    };
    functions.push(fn);
    byNode.set(node.from, fn);
  }
  const outermostOf = (node: SyntaxNode) => {
    const top = outermostFunction(node);
    return top ? byNode.get(top.from) : undefined;
  };

  // Where each name that is a declaration, or a global's definition, is
  // written; and the `function name()` statements that assign a local.
  const skip = new Set<number>();
  for (const fn of functions) {
    for (const d of fn.declarations) skip.add(d.nameFrom);
  }
  const functionNames = new Set<number>();
  const globalDefinitions: GlobalDefinition[] = [];
  for (const node of found.functions) {
    const statement = functionStatementName(node, src);
    if (!statement) continue;
    const outer = outermostOf(node);
    if (outer && !outer.closed) continue;
    const refersTo = outer
      ? resolve(
          outer.declarations.filter((d) => d.name === statement.name),
          statement.from,
        )
      : [];
    if (refersTo.length > 0) {
      functionNames.add(statement.from);
    } else {
      skip.add(statement.from);
      globalDefinitions.push({
        name: statement.name,
        kind: "function",
        nameFrom: statement.from,
        nameTo: statement.to,
      });
    }
  }
  for (const node of found.globalDeclarations) {
    const scope = scopeOf(node, src);
    if (scope !== "store" && scope !== "const") continue;
    const outer = outermostOf(node);
    if (outer && !outer.closed) continue;
    for (const token of declaredNames(node)) {
      const name = nameAt(token, src);
      if (!name) continue;
      skip.add(name.from);
      globalDefinitions.push({
        name: name.name,
        kind: scope,
        nameFrom: name.from,
        nameTo: name.from + name.name.length,
      });
    }
  }
  globalDefinitions.sort((a, b) => a.nameFrom - b.nameFrom);

  const globalOccurrences: ScriptNames["globalOccurrences"] = new Map();
  for (const fn of functions) {
    if (!fn.closed) continue;
    readOccurrences(fn, text, tokenAt, src, skip, functionNames);
    for (const occurrence of fn.occurrences) {
      if (occurrence.declarations.length > 0) continue;
      let list = globalOccurrences.get(occurrence.name);
      if (!list) globalOccurrences.set(occurrence.name, (list = []));
      list.push({ fn, occurrence });
    }
  }

  const closed = functions.filter((f) => f.closed).map((f) => f.node);
  /** Whether `pos` is inside a closed function. */
  const inClosedFunction = (pos: number) => {
    let lo = 0;
    let hi = closed.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const node = closed[mid]!;
      if (node.to <= pos) lo = mid + 1;
      else if (node.from > pos) hi = mid - 1;
      else return true;
    }
    return false;
  };
  const isWordChar = (c: string | undefined) =>
    c !== undefined && /[A-Za-z0-9_]/.test(c);
  const outside = new Map<string, Occurrence[]>();
  const usesOutsideFunctions = (name: string) => {
    let list = outside.get(name);
    if (list) return list;
    list = [];
    for (let i = text.indexOf(name); i >= 0; i = text.indexOf(name, i + 1)) {
      if (isWordChar(text[i - 1]) || isWordChar(text[i + name.length])) continue;
      if (skip.has(i) || inClosedFunction(i)) continue;
      const token = tokenAt(i);
      if (!REFERENCES.has(token.name)) continue;
      const kind = useAt(i, token, src);
      if (!kind) continue;
      list.push({ name, from: i, to: i + name.length, kind, declarations: [] });
    }
    outside.set(name, list);
    return list;
  };

  return { functions, globalDefinitions, globalOccurrences, usesOutsideFunctions };
}

// ---------------------------------------------------------------------------
// The program

export interface GlobalUse {
  /** The script the use is in. */
  uri: string;
  occurrence: Occurrence;
  /** The outermost function the use is in, or null outside functions. */
  fn: FunctionNames | null;
}

export interface GlobalName {
  name: string;
  definitions: { uri: string; definition: GlobalDefinition }[];
  /** Every use from any script, in script order and then source order.
   *  Worked out on the first call and kept. */
  uses(): GlobalUse[];
}

/** Every global the program defines or uses inside a function, by name.
 *  A name used only outside functions is not listed: nothing there can make
 *  it a global in the Luau sense. */
export function indexProgramNames(
  scripts: readonly { uri: string; names: ScriptNames }[],
): Map<string, GlobalName> {
  const index = new Map<string, GlobalName>();
  const entry = (name: string) => {
    let global = index.get(name);
    if (global) return global;
    let uses: GlobalUse[] | undefined;
    global = {
      name,
      definitions: [],
      uses: () => {
        if (uses) return uses;
        uses = [];
        for (const { uri, names } of scripts) {
          const here: GlobalUse[] = [];
          for (const { fn, occurrence } of names.globalOccurrences.get(name) ??
            []) {
            here.push({ uri, occurrence, fn });
          }
          for (const occurrence of names.usesOutsideFunctions(name)) {
            here.push({ uri, occurrence, fn: null });
          }
          here.sort((a, b) => a.occurrence.from - b.occurrence.from);
          uses.push(...here);
        }
        return uses;
      },
    };
    index.set(name, global);
    return global;
  };
  for (const { uri, names } of scripts) {
    for (const definition of names.globalDefinitions) {
      entry(definition.name).definitions.push({ uri, definition });
    }
    for (const name of names.globalOccurrences.keys()) entry(name);
  }
  return index;
}
