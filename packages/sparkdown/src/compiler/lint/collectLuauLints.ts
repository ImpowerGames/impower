// Lints for Luau code: mistakes that compile but are almost certainly not
// what the author meant. Each rule and its message follow the Luau linter
// rule of the same name (`Luau/Linter.cpp`), whose tests are ported in
// `src/tests/luau-conformance/Lint*.test.ts`; `docs/compiler/LINTS.md` lists
// which Luau lints sparkdown has.
//
// The syntax tree is the TextMate-derived one the editor highlights with, not
// a Luau AST: operators and operands are flat siblings, and some one-line
// forms nest differently from their multi-line spelling. Every rule here is
// therefore written to stay silent when the tree does not have the shape it
// expects. A missed warning costs little; a false one teaches authors to
// ignore warnings.
//
// The pass runs over a whole script on every compile rather than inside the
// incremental annotators, because every rule reads beyond the node it
// reports on (an unused local depends on every later line of its block).

import { type SyntaxNode, type Tree } from "@lezer/common";

export type LuauLintCode =
  | "LocalUnused"
  | "UnreachableCode"
  | "DuplicateCondition"
  | "ForRange";

export interface LuauLint {
  code: LuauLintCode;
  from: number;
  to: number;
  message: string;
}

interface Source {
  read: (from: number, to: number) => string;
  /** 1-based line and column of an offset. */
  position: (pos: number) => { line: number; column: number };
}

function* childrenOf(node: SyntaxNode | null | undefined) {
  for (let c = node?.firstChild; c; c = c.nextSibling) {
    yield c;
  }
}

function childNamed(node: SyntaxNode | null | undefined, name: string) {
  for (const c of childrenOf(node)) {
    if (c.name === name) return c;
  }
  return null;
}

function contentOf(node: SyntaxNode | null | undefined) {
  return node ? childNamed(node, `${node.name}_content`) : null;
}

function hasAncestor(node: SyntaxNode, name: string): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (p.name === name) return true;
  }
  return false;
}

/** The range of `node` without its leading and trailing whitespace. */
function trimmedRange(node: SyntaxNode, src: Source) {
  const text = src.read(node.from, node.to);
  const lead = text.length - text.trimStart().length;
  const trail = text.length - text.trimEnd().length;
  return { from: node.from + lead, to: node.to - trail };
}

/** The `LuauVariableName` of an access path that is one bare name. */
function soleVariableName(path: SyntaxNode): SyntaxNode | null {
  const parts = [...childrenOf(contentOf(path))].filter((c) => !isTrivia(c));
  if (parts.length !== 1 || parts[0]!.name !== "LuauAccessPart") return null;
  const inPart = [...childrenOf(parts[0])].filter((c) => !isTrivia(c));
  if (inPart.length !== 1 || inPart[0]!.name !== "LuauVariable") return null;
  const token = inPart[0]!.firstChild?.firstChild;
  return token?.name === "LuauVariableName" ? token : null;
}

// ---------------------------------------------------------------------------
// Statements and blocks

// Nodes that stand for one Luau statement inside a block.
const STATEMENTS = new Set([
  "LuauVariableDefinition",
  "LuauReassignment",
  "LuauAccessPath",
  "LuauIfBlock",
  "LuauDoBlock",
  "LuauWhileLoop",
  "LuauForLoop",
  "LuauRepeatLoop",
  "LuauReturnStatement",
  "LuauBreakStatement",
  "LuauContinueStatement",
  "LuauFunctionDefinition",
]);

// The `elseif` and `else` arms, which the grammar places inside the `if`
// block's content after the `then` arm's statements.
const IF_ARMS = new Set(["LuauElseifBlock", "LuauElseBlock"]);

function isTrivia(node: SyntaxNode) {
  return (
    node.from === node.to ||
    node.name === "Newline" ||
    node.name.endsWith("Whitespace") ||
    node.name.includes("Comment") ||
    node.name.endsWith("_begin") ||
    node.name.endsWith("_end")
  );
}

/** The statements of a block, in order. Anything else that stands between
 *  statements (a narrative line, a fragment the grammar split off) is kept
 *  as `null`, so the statement after it is never taken as directly following
 *  the one before it. */
function statementsOf(content: SyntaxNode | null): (SyntaxNode | null)[] {
  const out: (SyntaxNode | null)[] = [];
  for (const c of childrenOf(content)) {
    if (
      isTrivia(c) ||
      c.name.endsWith("Condition") ||
      c.name === "LuauFunctionDeclarationName" ||
      c.name === "LuauFunctionParameters" ||
      IF_ARMS.has(c.name)
    ) {
      continue;
    }
    out.push(STATEMENTS.has(c.name) ? c : null);
  }
  return out;
}

/** The node whose children are a function's body statements. A multi-line
 *  body is wrapped in `LuauFunctionBody`; a one-line body is not. */
function functionBodyContent(fn: SyntaxNode): SyntaxNode | null {
  const content = contentOf(fn);
  const body = childNamed(content, "LuauFunctionBody");
  return body ? contentOf(body) : content;
}

// Blocks the grammar closes with their own `end`. A `while` or `for` loop's
// `end` belongs to its `do` block.
const END_BLOCKS = new Set([
  "LuauFunctionDefinition",
  "LuauDoBlock",
  "LuauIfBlock",
]);

/** Whether an `end`-closed block found its `end`. An unfinished function
 *  (one being typed, or one the parser gave up on partway) ends early, and
 *  the statements after the break are parsed as top-level code, so its blocks
 *  do not show what the author wrote. */
function hasEnd(block: SyntaxNode): boolean {
  const end = childNamed(block, `${block.name}_end`);
  let found = false;
  end?.cursor().iterate((ref) => {
    if (ref.name === "LuauEndKeyword") found = true;
    return !found;
  });
  return found;
}

/** The body block of a `while` or `for` loop. */
function loopBody(loop: SyntaxNode): SyntaxNode | null {
  return contentOf(childNamed(contentOf(loop), "LuauDoBlock"));
}

// ---------------------------------------------------------------------------
// UnreachableCode

// Ordered so that the weakest exit among an `if`'s arms is their minimum.
const enum Exit {
  None = 0,
  Continue = 1,
  Break = 2,
  Return = 3,
  Error = 4,
}

const EXIT_REASON: Record<Exit, string> = {
  [Exit.None]: "",
  [Exit.Continue]: "continues",
  [Exit.Break]: "breaks",
  [Exit.Return]: "returns",
  [Exit.Error]: "errors",
};

// `error(...)` and `assert(false)` never return.
function isErrorCall(stmt: SyntaxNode, src: Source) {
  if (stmt.name !== "LuauAccessPath") return false;
  const parts = [...childrenOf(contentOf(stmt))];
  if (parts.length !== 1 || parts[0]!.name !== "LuauAccessPart") return false;
  const call = parts[0]!.firstChild;
  if (call?.name !== "LuauFunctionCall" || call.nextSibling) return false;
  const callee = call.firstChild?.firstChild?.firstChild;
  if (!callee) return false;
  const name = src.read(callee.from, callee.to).trim();
  const args = contentOf(
    childNamed(contentOf(call), "LuauFunctionCallParameters"),
  );
  const argText = args ? src.read(args.from, args.to).trim() : "";
  return name === "error" || (name === "assert" && argText === "false");
}

function lintUnreachable(
  functions: SyntaxNode[],
  closed: (fn: SyntaxNode) => boolean,
  src: Source,
  out: LuauLint[],
) {
  const block = (content: SyntaxNode | null): Exit => {
    const stmts = statementsOf(content);
    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i];
      if (!stmt) continue;
      const exit = statement(stmt);
      if (exit === Exit.None) continue;
      const next = stmts[i + 1];
      if (next === undefined) return exit;
      // `error("...")` followed by a final `return` is a common way to
      // satisfy a caller that expects a value.
      if (
        exit === Exit.Error &&
        isErrorCall(stmt, src) &&
        next?.name === "LuauReturnStatement" &&
        i + 2 === stmts.length
      ) {
        return exit;
      }
      if (next) {
        const range = trimmedRange(next, src);
        // What follows a `return`, `break` or error call on its own line can
        // only be a piece of its expression the grammar split off. A block
        // (`do return end print(x)`) has no such ambiguity.
        const sameLine =
          src.position(range.from).line ===
          src.position(trimmedRange(stmt, src).to).line;
        const isBlock = stmt.name === "LuauDoBlock" || stmt.name === "LuauIfBlock";
        if (isBlock || !sameLine) {
          out.push({
            code: "UnreachableCode",
            ...range,
            message: `Unreachable code (previous statement always ${EXIT_REASON[exit]})`,
          });
        }
      }
      return exit;
    }
    return Exit.None;
  };

  const statement = (stmt: SyntaxNode): Exit => {
    switch (stmt.name) {
      case "LuauReturnStatement":
        return Exit.Return;
      case "LuauBreakStatement":
        return Exit.Break;
      case "LuauContinueStatement":
        return Exit.Continue;
      case "LuauAccessPath":
        return isErrorCall(stmt, src) ? Exit.Error : Exit.None;
      case "LuauDoBlock":
        return block(contentOf(stmt));
      case "LuauIfBlock": {
        const content = contentOf(stmt);
        let exit = block(content);
        let hasElse = false;
        for (const arm of childrenOf(content)) {
          if (!IF_ARMS.has(arm.name)) continue;
          hasElse ||= arm.name === "LuauElseBlock";
          exit = Math.min(exit, block(contentOf(arm)));
        }
        return hasElse ? exit : Exit.None;
      }
      case "LuauWhileLoop":
      case "LuauForLoop":
        block(loopBody(stmt));
        return Exit.None;
      case "LuauRepeatLoop":
        block(contentOf(stmt));
        return Exit.None;
      default:
        // A nested function's body is a block of its own, which the walk
        // below reaches separately.
        return Exit.None;
    }
  };

  for (const fn of functions) {
    if (closed(fn)) block(functionBodyContent(fn));
  }
}

// ---------------------------------------------------------------------------
// LocalUnused

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

// Where a local's scope starts is uncertain on one line: the grammar can nest
// the statements after `local a = 1` inside the declaration, so its end is
// not where the next statement begins. A binding therefore has two starts,
// each erring toward silence. Reads count from right after the declared
// names, so a read in a nested statement is never missed; the binding hides
// an outer one of the same name only from the declaration's end, so a read of
// the outer one in the initializer (`local x = x + 1`) still counts for it.
interface Binding {
  name: string;
  /** Where the name is written in its declaration. */
  nameFrom: number;
  nameTo: number;
  /** Reads of the name in `[readsFrom, scopeTo)` can be this binding's. */
  readsFrom: number;
  /** In `[hidesFrom, scopeTo)` the name no longer means an outer binding. */
  hidesFrom: number;
  scopeTo: number;
  /** Parameters, loop variables and local functions only hide outer names;
   *  an unused one is not reported. */
  reported: boolean;
}

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

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;

/** One walk over an outermost function: the names it declares, and whether
 *  every `end`-closed block in it (itself included) found its `end`. The walk
 *  reads each node's name from the cursor and builds a node object only for
 *  the few kinds it looks inside. */
function readFunction(
  fn: SyntaxNode,
  src: Source,
): { bindings: Binding[]; closed: boolean } {
  const bindings: Binding[] = [];
  let closed = true;
  const add = (
    token: SyntaxNode,
    readsFrom: number,
    hidesFrom: number,
    scopeTo: number,
    reported: boolean,
  ) => {
    const { from } = trimmedRange(token, src);
    const name = src.read(from, token.to).match(IDENTIFIER)?.[0];
    if (!name) return;
    bindings.push({
      name,
      nameFrom: from,
      nameTo: from + name.length,
      readsFrom,
      hidesFrom,
      scopeTo,
      reported,
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
      const params = contentOf(childNamed(content, "LuauFunctionParameters"));
      for (const p of childrenOf(params)) {
        if (p.name === "LuauFunctionParameter") {
          add(p, p.to, p.to, node.to, false);
        }
      }
      const begin = childNamed(node, "LuauFunctionDefinition_begin");
      const isLocal =
        begin !== null && /^local\b/.test(src.read(begin.from, begin.to).trim());
      const nameNode = childNamed(content, "LuauFunctionDeclarationName");
      const end = isLocal ? blockEnd(node) : null;
      if (nameNode && end !== null) {
        add(nameNode, nameNode.to, nameNode.to, end, false);
      }
    } else if (node.name === "LuauVariableDefinition") {
      const begin = childNamed(node, "LuauVariableDefinition_begin");
      if (!begin || src.read(begin.from, begin.to).trim() !== "local") continue;
      const end = blockEnd(node);
      if (end === null) continue;
      const names: SyntaxNode[] = [];
      for (const assignment of childrenOf(contentOf(node))) {
        if (assignment.name !== "LuauVariableAssignment") continue;
        const nameBegin = childNamed(assignment, "LuauVariableAssignment_begin");
        const token = nameBegin?.firstChild?.firstChild;
        if (token?.name === "LuauVariableName") names.push(token);
        // The names end at the `=`; in `local a = b, c` the grammar also
        // wraps the value `c` as an assignment.
        if (childNamed(assignment, "LuauVariableAssignment_content")) break;
      }
      const readsFrom = names.length > 0 ? names[names.length - 1]!.to : node.to;
      for (const token of names) {
        add(token, readsFrom, node.to, end, true);
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
        add(token, body.from, body.from, body.to, false);
      }
    }
  } while (cursor.next() && cursor.from < fn.to);
  return { bindings, closed };
}

/** Finds the innermost node that covers the character at a position. */
type TokenAt = (pos: number) => SyntaxNode;

/** A `TokenAt` for `tree`. A long script's root has thousands of children,
 *  which Lezer searches one by one on every lookup from the top, so the root's
 *  children are indexed once and searched by halving. Within the child,
 *  resolving at the middle of the character with side 0 enters only nodes
 *  that strictly contain that point; resolving at the position itself can
 *  stop at a zero-width `_begin` node that starts there. */
function tokenFinder(tree: Tree): TokenAt {
  const top: SyntaxNode[] = [];
  for (let c = tree.topNode.firstChild; c; c = c.nextSibling) top.push(c);
  return (pos) => {
    let lo = 0;
    let hi = top.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const node = top[mid]!;
      if (node.to <= pos) lo = mid + 1;
      else if (node.from > pos) hi = mid - 1;
      else return node.resolveInner(pos + 0.5, 0);
    }
    return tree.topNode;
  };
}

// Tokens whose text is never a read of a variable.
function isNonReference(token: SyntaxNode): boolean {
  if (token.name === "LuauPropertyName") return true;
  if (
    token.name === "LuauFunctionName" &&
    token.parent?.name === "LuauFunctionAccessor"
  ) {
    return true;
  }
  for (let p: SyntaxNode | null = token; p; p = p.parent) {
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

/** Whether `token` is a whole target of a plain `=` assignment, which writes
 *  the variable without reading it. */
function isAssignmentTarget(token: SyntaxNode, src: Source): boolean {
  let path: SyntaxNode | null = token;
  while (path && path.name !== "LuauAccessPath") path = path.parent;
  // Nodes are compared by position: the tree hands out a fresh object for
  // the same node on every visit.
  if (!path || soleVariableName(path)?.from !== token.from) return false;
  if (path.parent?.name !== "LuauReassignment_content") return false;
  // Targets come before the operator; what follows it are values.
  for (let s = path.nextSibling; s; s = s.nextSibling) {
    if (s.name === "LuauAssignmentOperation") {
      const op = childNamed(contentOf(s), "LuauAssignmentOperator");
      return op !== null && src.read(op.from, op.to).trim() === "=";
    }
  }
  return false;
}

const IDENTIFIERS = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;

/** Where each name in `wanted` occurs in `[from, to)`, in order. */
function occurrences(src: Source, from: number, to: number, wanted: Set<string>) {
  const found = new Map<string, number[]>();
  for (const match of src.read(from, to).matchAll(IDENTIFIERS)) {
    if (!wanted.has(match[0])) continue;
    let list = found.get(match[0]);
    if (!list) found.set(match[0], (list = []));
    list.push(from + match.index!);
  }
  return found;
}

function lintUnusedLocals(
  tokenAt: TokenAt,
  functions: { fn: SyntaxNode; bindings: Binding[]; closed: boolean }[],
  src: Source,
  out: LuauLint[],
) {
  // The outermost function contains every nested one, so one pass over it
  // covers them all.
  for (const { fn, bindings, closed } of functions) {
    if (!closed) continue;
    const declarations = new Set(bindings.map((b) => b.nameFrom));
    const byName = new Map<string, Binding[]>();
    for (const b of bindings) {
      let list = byName.get(b.name);
      if (!list) byName.set(b.name, (list = []));
      list.push(b);
    }
    const reported = bindings.filter(
      (b) => b.reported && !b.name.startsWith("_"),
    );
    const positions = occurrences(
      src,
      fn.from,
      fn.to,
      new Set(reported.map((b) => b.name)),
    );
    for (const binding of reported) {
      // Later declarations of the same name that hide this one.
      const shadows = byName
        .get(binding.name)!
        .filter(
          (b) => b.nameFrom > binding.nameFrom && b.nameFrom < binding.scopeTo,
        );
      // Every occurrence that is not a declaration, a hidden name, a field or
      // a plain write counts as a read, whatever node it sits in.
      let used = false;
      for (const pos of positions.get(binding.name) ?? []) {
        if (pos < binding.readsFrom) continue;
        if (pos >= binding.scopeTo) break;
        if (declarations.has(pos)) continue;
        if (shadows.some((b) => pos >= b.hidesFrom && pos < b.scopeTo)) {
          continue;
        }
        // A field after `.` (but not the `..` operator) or a method after `:`.
        const before = src.read(Math.max(0, pos - 2), pos);
        if (/(^|[^.])\.$|:$/.test(before)) continue;
        const token = tokenAt(pos);
        if (isNonReference(token) || isAssignmentTarget(token, src)) {
          continue;
        }
        used = true;
        break;
      }
      if (!used) {
        out.push({
          code: "LocalUnused",
          from: binding.nameFrom,
          to: binding.nameTo,
          message: `Variable '${binding.name}' is never used; prefix with '_' to silence`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Expressions, as flat token lists

// Operation wrappers whose content is `<binary operator> <operand>...`, which
// read as part of the enclosing list. Unary `#t` stays one token.
function isBinaryOperation(node: SyntaxNode) {
  return (
    node.name.endsWith("Operation") &&
    node.name !== "LuauLengthOperation" &&
    contentOf(node) !== null
  );
}

function flatten(nodes: Iterable<SyntaxNode>, out: SyntaxNode[] = []) {
  for (const n of nodes) {
    if (isTrivia(n)) continue;
    if (isBinaryOperation(n)) {
      flatten(childrenOf(contentOf(n)), out);
    } else {
      out.push(n);
    }
  }
  return out;
}

function splitOn(tokens: SyntaxNode[], src: Source, op: "and" | "or") {
  const parts: SyntaxNode[][] = [[]];
  for (const t of tokens) {
    if (
      t.name === "LuauLogicalOperator" &&
      src.read(t.from, t.to).trim() === op
    ) {
      parts.push([]);
    } else {
      parts[parts.length - 1]!.push(t);
    }
  }
  return parts;
}

/** The tokens inside `(...)` when `tokens` is exactly one parenthetical. */
function groupContents(tokens: SyntaxNode[]): SyntaxNode[] | null {
  if (tokens.length !== 1 || tokens[0]!.name !== "LuauParenthetical") {
    return null;
  }
  return flatten(childrenOf(contentOf(tokens[0]!)));
}

// Tokens that end one expression of a list and begin the next.
function isSeparator(token: SyntaxNode) {
  return (
    token.name === "LuauCommaSeparator" ||
    token.name === "LuauAssignmentOperator" ||
    token.name === "LuauThenOperator" ||
    token.name === "LuauElseOperator" ||
    token.name.endsWith("Keyword")
  );
}

// ---------------------------------------------------------------------------
// DuplicateCondition

function lintDuplicateConditions(found: Found, src: Source, out: LuauLint[]) {
  const text = (tokens: SyntaxNode[]) =>
    src
      .read(tokens[0]!.from, tokens[tokens.length - 1]!.to)
      .trim()
      .replace(/\s+/g, " ");
  const rangeOf = (tokens: SyntaxNode[]) => ({
    from: trimmedRange(tokens[0]!, src).from,
    to: trimmedRange(tokens[tokens.length - 1]!, src).to,
  });
  // Parentheticals already read as part of an enclosing chain.
  const consumed = new Set<number>();
  const reported = new Set<number>();

  const report = (conditions: SyntaxNode[][]) => {
    const seen: SyntaxNode[][] = [];
    for (const c of conditions) {
      if (c.length === 0) continue;
      const earlier = seen.find((s) => text(s) === text(c));
      if (!earlier) {
        seen.push(c);
        continue;
      }
      const range = rangeOf(c);
      if (reported.has(range.from)) continue;
      reported.add(range.from);
      const here = src.position(range.from);
      const there = src.position(rangeOf(earlier).from);
      out.push({
        code: "DuplicateCondition",
        ...range,
        message:
          here.line === there.line
            ? `Condition has already been checked on column ${there.column}`
            : `Condition has already been checked on line ${there.line}`,
      });
    }
  };

  // The operands of an `op` chain, looking through parentheses.
  const chain = (tokens: SyntaxNode[], op: "and" | "or"): SyntaxNode[][] => {
    const parts = splitOn(tokens, src, op);
    if (parts.length > 1) return parts.flatMap((p) => chain(p, op));
    const inner = groupContents(tokens);
    if (inner && splitOn(inner, src, op).length > 1) {
      consumed.add(tokens[0]!.from);
      return chain(inner, op);
    }
    return [tokens];
  };

  const expression = (tokens: SyntaxNode[]) => {
    if (tokens.length === 0) return;
    const inner = groupContents(tokens);
    if (inner) {
      consumed.add(tokens[0]!.from);
      expression(inner);
      return;
    }
    const ors = splitOn(tokens, src, "or");
    if (ors.length > 1) {
      // `a and b or c` is the idiomatic conditional expression; `a` and `b`
      // are not alternatives of each other there.
      if (ors.length === 2) {
        const group = groupContents(ors[0]!);
        const ands = splitOn(group ?? ors[0]!, src, "and");
        if (ands.length === 2) {
          if (group) consumed.add(ors[0]![0]!.from);
          for (const part of [...ands, ors[1]!]) expression(part);
          return;
        }
      }
      const conditions = chain(tokens, "or");
      report(conditions);
      for (const c of conditions) expression(c);
      return;
    }
    if (splitOn(tokens, src, "and").length > 1) {
      const conditions = chain(tokens, "and");
      report(conditions);
      for (const c of conditions) expression(c);
    }
  };

  // An `if` chain, statement or expression, checks each condition once.
  for (const node of found.ifChains) {
    if (node.name === "LuauIfBlock") {
      const content = contentOf(node);
      report(
        [
          childNamed(content, "LuauIfBlockCondition"),
          ...[...childrenOf(content)]
            .filter((c) => c.name === "LuauElseifBlock")
            .map((c) => childNamed(contentOf(c), "LuauElseifBlockCondition")),
        ].map((c) => flatten(childrenOf(contentOf(c)))),
      );
    } else {
      report(
        [...childrenOf(contentOf(node))]
          .filter((c) => c.name === "LuauTernaryExpressionCondition")
          .map((c) => flatten(childrenOf(contentOf(c)))),
      );
    }
  }
  // Outermost lists come first, so a parenthetical an enclosing chain already
  // read is known to be consumed by the time its own list comes up.
  for (const list of found.logicalLists) {
    if (
      list.name === "LuauParenthetical_content" &&
      list.parent &&
      consumed.has(list.parent.from)
    ) {
      continue;
    }
    let segment: SyntaxNode[] = [];
    for (const t of [...flatten(childrenOf(list)), null]) {
      if (t === null || isSeparator(t)) {
        expression(segment);
        segment = [];
      } else {
        segment.push(t);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ForRange

// C's `%g`, which Luau's message uses.
function formatNumber(value: number) {
  return String(Number(value.toPrecision(6)));
}

function lintForRanges(found: Found, src: Source, out: LuauLint[]) {
  const constant = (tokens: SyntaxNode[]) => {
    if (tokens.length !== 1 || !tokens[0]!.name.startsWith("LuauNumeric")) {
      return null;
    }
    const literal = src.read(tokens[0]!.from, tokens[0]!.to).trim();
    const value = Number(literal.replace(/_/g, ""));
    return Number.isFinite(value) ? value : null;
  };
  const isLength = (tokens: SyntaxNode[]) =>
    tokens.length === 1 && tokens[0]!.name === "LuauLengthOperation";
  const backwards =
    "For loop should iterate backwards; did you forget to specify -1 as step?";

  for (const loop of found.forLoops) {
    const header = contentOf(childNamed(contentOf(loop), "LuauForCondition"));
    const tokens = flatten(childrenOf(header));
    const assign = tokens.findIndex((t) => t.name === "LuauAssignmentOperator");
    if (assign < 0) continue;
    const parts: SyntaxNode[][] = [[]];
    for (const t of tokens.slice(assign + 1)) {
      if (t.name === "LuauCommaSeparator") parts.push([]);
      else parts[parts.length - 1]!.push(t);
    }
    // An explicit step means the author chose the direction.
    if (parts.length !== 2) continue;
    const [fromTokens, toTokens] = parts as [SyntaxNode[], SyntaxNode[]];
    if (fromTokens.length === 0 || toTokens.length === 0) continue;
    const from = constant(fromTokens);
    const to = constant(toTokens);
    let message: string | null = null;
    if (isLength(fromTokens) && to === 1) {
      message = backwards;
    } else if (from !== null && to !== null && from > to) {
      message = backwards;
    } else if (
      from !== null &&
      to !== null &&
      from + Math.floor(to - from) !== to
    ) {
      const end = from + Math.floor(to - from);
      message = `For loop ends at ${formatNumber(end)} instead of ${formatNumber(to)}; did you forget to specify step?`;
    } else if (from === 0 && isLength(toTokens)) {
      message = "For loop starts at 0, but arrays start at 1";
    } else if (isLength(fromTokens) && to === 0) {
      message = `${backwards} Also consider changing 0 to 1 since arrays start at 1`;
    }
    if (message) {
      out.push({
        code: "ForRange",
        from: trimmedRange(fromTokens[0]!, src).from,
        to: trimmedRange(toTokens[toTokens.length - 1]!, src).to,
        message,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Finding the constructs

interface Found {
  /** Every function definition, in source order. */
  functions: SyntaxNode[];
  forLoops: SyntaxNode[];
  /** `if` statements and `if` expressions. */
  ifChains: SyntaxNode[];
  /** Nodes whose children hold an `and` or `or` operator, outermost first. */
  logicalLists: SyntaxNode[];
}

// Each rule starts from a construct that is spelled with one of these words.
const KEYWORDS = /\b(function|for|if|and|or)\b/g;

/** The nearest node named `name` at or above `node`, within a few levels. */
function ancestorNamed(node: SyntaxNode, names: Set<string>, levels: number) {
  for (let n: SyntaxNode | null = node; n && levels >= 0; n = n.parent) {
    if (names.has(n.name)) return n;
    levels--;
  }
  return null;
}

const FUNCTION = new Set(["LuauFunctionDefinition"]);
const FOR_LOOP = new Set(["LuauForLoop"]);
const IF_CHAIN = new Set(["LuauIfBlock", "LuauTernaryExpression"]);
const LOGICAL_OPERATOR = new Set(["LuauLogicalOperator"]);

/** Finds the constructs the rules check from their keywords in the text,
 *  which costs a small fraction of walking a script's whole tree: a long
 *  script is mostly narrative, and its tree has several nodes per word. A
 *  keyword that is not a Luau keyword there (prose, a string, a comment)
 *  resolves to some other node and is dropped. */
function findConstructs(tokenAt: TokenAt, text: string): Found {
  const found: Found = {
    functions: [],
    forLoops: [],
    ifChains: [],
    logicalLists: [],
  };
  const seen = new Set<string>();
  const add = (list: SyntaxNode[], node: SyntaxNode | null) => {
    if (!node) return;
    const key = `${node.name}:${node.from}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(node);
  };
  for (const match of text.matchAll(KEYWORDS)) {
    const token = tokenAt(match.index!);
    switch (match[1]) {
      case "function":
        if (token.name === "LuauFunctionKeyword") {
          add(found.functions, ancestorNamed(token, FUNCTION, 4));
        }
        break;
      case "for":
        if (token.name === "LuauForKeyword") {
          add(found.forLoops, ancestorNamed(token, FOR_LOOP, 4));
        }
        break;
      case "if":
        if (token.name === "LuauIfKeyword") {
          add(found.ifChains, ancestorNamed(token, IF_CHAIN, 4));
        }
        break;
      default: {
        const operator = ancestorNamed(token, LOGICAL_OPERATOR, 3);
        if (!operator) break;
        // The list is the first node above the operator that is not one of
        // the operation wrappers `flatten` reads through.
        let list = operator.parent;
        while (
          list &&
          (isBinaryOperation(list) || list.name.endsWith("Operation_content"))
        ) {
          list = list.parent;
        }
        add(found.logicalLists, list);
      }
    }
  }
  found.logicalLists.sort((a, b) => a.from - b.from || b.to - a.to);
  return found;
}

// ---------------------------------------------------------------------------

export function collectLuauLints(
  tree: Tree,
  read: (from: number, to: number) => string,
): LuauLint[] {
  const text = read(0, tree.length);
  // Built on first use: most scripts have nothing to report.
  let lineStarts: number[] | undefined;
  const position = (pos: number) => {
    if (!lineStarts) {
      lineStarts = [0];
      for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) {
        lineStarts.push(i + 1);
      }
    }
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: pos - lineStarts[lo]! + 1 };
  };
  const src: Source = { read, position };
  const tokenAt = tokenFinder(tree);
  const found = findConstructs(tokenAt, text);
  const outermost = found.functions
    .filter((fn) => !hasAncestor(fn, "LuauFunctionDefinition"))
    .map((fn) => ({ fn, ...readFunction(fn, src) }));
  // A nested function is as closed as the outermost one around it.
  const closedByFrom = new Map(outermost.map((f) => [f.fn.from, f.closed]));
  const closed = (fn: SyntaxNode) => {
    let top = fn;
    for (let p = fn.parent; p; p = p.parent) {
      if (p.name === "LuauFunctionDefinition") top = p;
    }
    return closedByFrom.get(top.from) ?? false;
  };
  const out: LuauLint[] = [];
  lintUnusedLocals(tokenAt, outermost, src, out);
  lintUnreachable(found.functions, closed, src, out);
  lintDuplicateConditions(found, src, out);
  lintForRanges(found, src, out);
  return out.sort((a, b) => a.from - b.from || a.to - b.to);
}
