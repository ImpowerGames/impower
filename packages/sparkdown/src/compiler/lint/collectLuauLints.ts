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
// Rules about names read the model in `luauNames.ts` rather than the tree.

import { type SyntaxNode, type Tree } from "@lezer/common";
import { readScriptNames, type ScriptNames } from "./luauNames";
import {
  childNamed,
  childrenOf,
  contentOf,
  createSource,
  findConstructs,
  type Found,
  IF_ARMS,
  isBinaryOperation,
  isTrivia,
  outermostFunction,
  soleVariableName,
  type Source,
  type TokenAt,
  tokenFinder,
  trimmedRange,
} from "./luauTree";

/** The rules, by the name each warning carries as its diagnostic code. */
export const LUAU_LINT_CODES = [
  "LocalUnused",
  "UnreachableCode",
  "DuplicateCondition",
  "ForRange",
  "PlaceholderRead",
] as const;

export type LuauLintCode = (typeof LUAU_LINT_CODES)[number];

export interface LuauLint {
  code: LuauLintCode;
  from: number;
  to: number;
  message: string;
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

/** The node whose children are a function's body statements. A function
 *  with a statement in it wraps them in `LuauFunctionBody`; one with none,
 *  and a `define` method, has no wrapper. */
function functionBodyContent(fn: SyntaxNode): SyntaxNode | null {
  const content = contentOf(fn);
  const body = childNamed(content, "LuauFunctionBody");
  return body ? contentOf(body) : content;
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

// Parameters, loop variables and local functions only hide outer names; an
// unused one is not reported, nor is a local whose statement the grammar
// nested inside another, since where that statement ends is uncertain. A
// write does not use a local; every other occurrence that can refer to it
// does.
function lintUnusedLocals(names: ScriptNames, out: LuauLint[]) {
  for (const fn of names.functions) {
    if (!fn.closed) continue;
    const used = new Set<number>();
    for (const occurrence of fn.occurrences) {
      if (occurrence.kind === "write") continue;
      for (const d of occurrence.declarations) used.add(d.nameFrom);
    }
    for (const d of fn.declarations) {
      if (d.kind !== "local" || d.nested || d.name.startsWith("_")) continue;
      if (used.has(d.nameFrom)) continue;
      out.push({
        code: "LocalUnused",
        from: d.nameFrom,
        to: d.nameTo,
        message: `Variable '${d.name}' is never used; prefix with '_' to silence`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// PlaceholderRead

// A read of `_`, whether it names a local or a global. A plain write is the
// placeholder's purpose; a compound write (`_ += 1`) also reads it. The model
// counts a table constructor's key (`{_ = 1}`) as an occurrence so that no
// use is missed, but a key is a field name and is not reported.
function lintPlaceholderReads(
  names: ScriptNames,
  tokenAt: TokenAt,
  out: LuauLint[],
) {
  for (const fn of names.functions) {
    for (const occurrence of fn.occurrences) {
      if (occurrence.name !== "_") continue; // not a node name
      if (occurrence.kind === "write" || occurrence.kind === "functionName") {
        continue;
      }
      if (isTableKey(tokenAt(occurrence.from))) continue;
      out.push({
        code: "PlaceholderRead",
        from: occurrence.from,
        to: occurrence.to,
        message:
          "Placeholder value '_' is read here; consider using a named variable",
      });
    }
  }
}

/** Whether `token` is the name of a table constructor field, `name = value`:
 *  a bare name directly in the table whose next sibling, past any comments
 *  and line breaks, is the field's `= value`. */
function isTableKey(token: SyntaxNode) {
  // A bare name's path is five levels up: its content, the part, the
  // variable and the variable's capture wrap the name.
  let path: SyntaxNode | null = token;
  for (let up = 0; path && path.name !== "LuauAccessPath"; up++) {
    path = up < 5 ? path.parent : null;
  }
  if (!path || path.parent?.name !== "LuauTable_content") return false;
  if (soleVariableName(path)?.from !== token.from) return false;
  let next = path.nextSibling;
  while (next && isTrivia(next)) next = next.nextSibling;
  return next?.name === "LuauAssignmentOperation";
}

// ---------------------------------------------------------------------------
// Expressions, as flat token lists

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
  // A bare length (`#t`, `#t:len()`, `##t`), the only bound Luau's rule
  // fires for. The grammar nests whatever follows `#` inside the length
  // operation: an operand can take several nodes (`t:len()` is an access
  // path and a parenthetical), and arithmetic after it (`#t - 1`) is a
  // binary operation there too, which makes the bound something else.
  const isLength = (tokens: SyntaxNode[]) => {
    if (tokens.length !== 1 || tokens[0]!.name !== "LuauLengthOperation") {
      return false;
    }
    const parts = [...childrenOf(contentOf(tokens[0]!))].filter(
      (c) => !isTrivia(c),
    );
    return (
      parts.length >= 2 &&
      parts[0]!.name === "LuauLengthOperator" &&
      !parts.slice(1).some(isBinaryOperation)
    );
  };
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

export interface LuauScriptLints {
  lints: LuauLint[];
  /** The script's names, which `indexProgramNames` combines with other
   *  scripts' for a rule that looks at the whole program. */
  names: ScriptNames;
}

export function collectLuauLints(
  tree: Tree,
  read: (from: number, to: number) => string,
): LuauScriptLints {
  const text = read(0, tree.length);
  const src = createSource(text, read);
  const tokenAt = tokenFinder(tree);
  const found = findConstructs(tokenAt, text);
  const names = readScriptNames(text, src, tokenAt, found);
  // A nested function is as closed as the outermost one around it.
  const closedByFrom = new Map(
    names.functions.map((f) => [f.node.from, f.closed]),
  );
  const closed = (fn: SyntaxNode) =>
    closedByFrom.get(outermostFunction(fn)?.from ?? -1) ?? false;
  const out: LuauLint[] = [];
  lintUnusedLocals(names, out);
  lintPlaceholderReads(names, tokenAt, out);
  lintUnreachable(found.functions, closed, src, out);
  lintDuplicateConditions(found, src, out);
  lintForRanges(found, src, out);
  return {
    lints: out.sort((a, b) => a.from - b.from || a.to - b.to),
    names,
  };
}
