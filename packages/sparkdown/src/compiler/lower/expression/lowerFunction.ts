// Luau functions as values: a function expression lowers to a function of
// its own (a `Function` flow nested in the enclosing function, or hoisted
// when there is none) and a closure value that names it with the enclosing
// variables it captures. The named function statements in
// `lowerLuauFunctionDefinition.ts` build theirs with the same helpers.
//
// A function's parameters and body come from the converter's AST
// (`AstExprFunction`); its body is lowered through `lowerStatements`, which
// walks the body's syntax nodes for the Sparkdown lines among its Luau and
// takes each Luau statement from the AST.

import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { DivertTarget } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/DivertTarget";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { NumberExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { VariablePointerExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/VariablePointerExpression";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { ErrorType } from "../../../inkjs/engine/Error";
import {
  AstExprCall,
  AstExprFunction,
  AstExprGlobal,
  AstExprLocal,
  AstStatBlock,
  AstStatFor,
  AstStatForIn,
  AstStatFunction,
  AstStatLocal,
  AstStatLocalFunction,
  AstStatSparkdownExplicit,
  AstStatSparkdownStore,
  AstType,
  AstTypePack,
  visitAst,
  type AstNode,
} from "../../typecheck/Ast";
import { nodeNameSet } from "../../utils/nodeNameSet";
import type { LowerContext, SiblingSubFlowInfo } from "../context";
import { lowerStatements } from "../lower";
import { getFunctionBodyContent } from "../utils/getFunctionBodyContent";
import { VARARGS_LOCAL_NAME } from "../utils/lowerArguments";
import {
  enclosingNode,
  functionBegin,
  offsetAt,
  readBlockAst,
  type LuauSource,
} from "../utils/luauAst";
import { syntheticId } from "../utils/documentTag";
import { followsLineEndingComma } from "../utils/lineContinuation";
import { statementSource } from "../utils/statementSource";
import {
  closeFunctionBody,
  openFunctionBody,
} from "../utils/statementShape";
import { recordCaptureRead } from "./bindings";

// The nodes of a function definition's content that are its header, not
// statements of its body.
export const FUNCTION_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauFunctionDeclarationName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
  "LuauComment",
]);

const FUNCTION_NODES: ReadonlySet<string> = nodeNameSet([
  "LuauFunctionDefinition",
]);

/** The syntax node of a function expression or statement the AST read. */
export function functionNode(
  func: AstExprFunction,
  source: LuauSource,
  ctx: LowerContext,
): SyntaxNode | null {
  return enclosingNode(source, functionBegin(func, ctx), FUNCTION_NODES);
}

/** A function's named parameters, in order: those it is written with, not `self`. */
export function parameterNames(func: AstExprFunction): string[] {
  return func.args.map((arg) => arg.name);
}

/**
 * The AST of a function body's statements, read from the body's syntax
 * nodes, for a function whose header Luau has no syntax for (a `define`'s
 * `name(args) ... end` method), so that only its body is read.
 */
export function bodyAst(
  content: SyntaxNode | null,
  skipNames: ReadonlySet<string>,
  ctx: LowerContext,
): AstStatBlock | null {
  const nodes: SyntaxNode[] = [];
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (!skipNames.has(child.name)) nodes.push(child);
  }
  return readBlockAst(nodes, ctx)?.unit.root ?? null;
}

/**
 * A function's parameters as the runtime binds them: each named parameter,
 * then the synthetic local that holds `...`'s values when it takes them.
 */
export function functionArguments(func: AstExprFunction): Argument[] {
  const args = func.args.map(
    (arg) => new Argument(new Identifier(arg.name), false, false),
  );
  if (func.vararg) {
    args.push(
      new Argument(new Identifier(VARARGS_LOCAL_NAME), false, false, true),
    );
  }
  return args;
}

// Visits the statements and expressions under `root` in document order,
// leaving out types; `enter` returns false to skip a node's children.
function walk(root: AstNode, enter: (node: AstNode) => boolean): void {
  visitAst(root, {
    visit: (node) =>
      node instanceof AstType || node instanceof AstTypePack
        ? false
        : enter(node),
  });
}

// The name a function statement declares, when it is a plain name rather
// than a field (`function a.f`) or method (`function a:m`).
function declaredFunctionName(
  stat: AstStatFunction | AstStatLocalFunction,
): string | null {
  if (stat instanceof AstStatLocalFunction) return stat.name.name;
  if (stat.name instanceof AstExprGlobal) return stat.name.name;
  if (stat.name instanceof AstExprLocal) return stat.name.local.name;
  return null;
}

// The names a declaration statement declares: a `local` or `const`, or a
// `store`, bare or after `&`.
function declarationNames(node: AstNode): string[] {
  const stat =
    node instanceof AstStatSparkdownExplicit ? node.statement : node;
  if (stat instanceof AstStatLocal) return stat.vars.map((v) => v.name);
  if (stat instanceof AstStatSparkdownStore) return stat.vars.map((v) => v.name);
  return [];
}

// The variables a loop declares.
function loopNames(node: AstNode): string[] {
  if (node instanceof AstStatFor) return [node.variable.name];
  if (node instanceof AstStatForIn) return node.vars.map((v) => v.name);
  return [];
}

/**
 * The names a function's own scope declares, for `declaredLocalsStack`, so
 * a function nested in it can tell a local of this one from a global: its
 * parameters, and the locals, `store` and `const` declarations, loop
 * variables and named nested functions of its body, in the blocks inside
 * the body too but not inside the functions nested in it. A variadic nested
 * function is no local: it lowers as a subflow that calls reach by path
 * (`lowerNestedAsSubFlow`), and recording its name would have a sibling
 * closure capture a variable that does not exist.
 */
export function immediateBodyDeclarations(
  params: readonly string[],
  body: AstStatBlock | null,
): Set<string> {
  const out = new Set<string>(params);
  if (!body) return out;
  walk(body, (node) => {
    if (node instanceof AstExprFunction) return false;
    if (node instanceof AstStatFunction || node instanceof AstStatLocalFunction) {
      const name = declaredFunctionName(node);
      if (name && !node.func.vararg) out.add(name);
      return false;
    }
    for (const name of declarationNames(node)) out.add(name);
    for (const name of loopNames(node)) out.add(name);
    return true;
  });
  return out;
}

// Heuristic: names matching common stdlib namespaces / globals don't
// need to be captured. False positives (a user-defined `math` would not
// be captured) are acceptable since Luau warns against shadowing stdlib
// names anyway — and a name an enclosing function declares as a local is
// captured whatever it matches (`isShadowedLocal`).
const STDLIB_NAMES_FOR_FREE_VAR_SCAN: ReadonlySet<string> = new Set([
  // Namespaces
  "math", "string", "table", "utf8", "bit32", "os", "vector",
  "coroutine", "debug", "task", "buffer",
  "count", "lang", "plural", "system",
  // Globals
  "_G", "_VERSION",
  // Functions
  "assert", "collectgarbage", "error", "gcinfo", "getfenv",
  "getmetatable", "ipairs", "loadstring", "newproxy", "next",
  "pairs", "pcall", "print", "rawequal", "rawget", "rawset",
  "require", "select", "setfenv", "setmetatable", "tonumber",
  "tostring", "type", "typeof", "unpack", "xpcall",
  // Keywords / control (shouldn't be referenced as values but just in case)
  "true", "false", "nil",
  // NOTE: `self` is NOT in this set. It's an implicit method receiver
  // parameter (for colon-form methods) or an ordinary user parameter
  // — never a stdlib-resolved global. When a nested closure inside a
  // method body references `self`, it must be captured as an upval
  // pointing at the outer frame's parameter slot. Treating it as a
  // stdlib name would block that capture and the inner closure would
  // see nil at runtime.
]);

/**
 * The names a function's body reads from the scopes around it, in the order
 * it first reads them: the function's upvalues, which its closure captures
 * when it is built. A name counts as bound inside the function, and is not
 * captured, when it is a parameter or anything the body declares at any
 * depth (a local, a `store` or `const`, a loop variable, a named function);
 * a name read in a function nested in the body counts as read by this one,
 * which must capture it for the nested function to capture in turn. A name
 * that is a variadic function of an enclosing scope is reached by path and
 * not captured. Otherwise a name an enclosing function declares is
 * captured, and a stdlib name, a global callable or any other global is
 * not.
 */
export function freeVariables(
  params: readonly string[],
  body: AstStatBlock | null,
  ctx: LowerContext,
): string[] {
  if (!body) return [];
  const bound = new Set<string>(params);
  walk(body, (node) => {
    if (node instanceof AstStatFunction || node instanceof AstStatLocalFunction) {
      const name = declaredFunctionName(node);
      if (name) bound.add(name);
    }
    for (const name of declarationNames(node)) bound.add(name);
    for (const name of loopNames(node)) bound.add(name);
    return true;
  });
  const isGlobalCallable = (name: string) =>
    ctx.globalCallableNames?.has(name) ?? false;
  // Rebound entries (`f = <expr>` over a global/former subflow) are
  // dispatch metadata only — they must NOT suppress upval capture
  // decisions; the name resolves like any other reference here.
  const isSiblingSubFlow = (name: string) => {
    const stack = ctx.siblingSubFlowNamesStack;
    if (!stack) return false;
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i]!.get(name);
      if (entry !== undefined && !entry.rebound) return true;
    }
    return false;
  };
  const isShadowedLocal = (name: string) => {
    const stack = ctx.declaredLocalsStack;
    if (!stack) return false;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i]!.has(name)) return true;
    }
    return false;
  };
  const free: string[] = [];
  const seen = new Set<string>();
  const read = (name: string) => {
    if (bound.has(name) || seen.has(name)) return;
    // A variadic sibling is the innermost binding and wins over a
    // same-named local of an outer scope (`resolveCallableBinding`).
    if (isSiblingSubFlow(name)) return;
    if (!isShadowedLocal(name)) {
      if (STDLIB_NAMES_FOR_FREE_VAR_SCAN.has(name) || isGlobalCallable(name)) {
        return;
      }
    }
    seen.add(name);
    free.push(name);
  };
  const readNames = (node: AstNode): boolean => {
    if (node instanceof AstExprGlobal) read(node.name);
    else if (node instanceof AstExprLocal) read(node.local.name);
    else if (node instanceof AstStatFunction) {
      // A function statement's plain name is declared, not read
      // (`function a.f` reads `a`).
      if (!declaredFunctionName(node)) walk(node.name, readNames);
      walk(node.func, readNames);
      return false;
    } else if (node instanceof AstStatSparkdownStore) {
      // A `store` declares its names and reads its values.
      for (const value of node.values) walk(value, readNames);
      return false;
    }
    return true;
  };
  walk(body, readNames);
  return free;
}

/**
 * Whether a function's body calls `name` by name anywhere, nested functions
 * included: `local function f() ... f() ... end` refers to itself, so the
 * closure captures a live pointer to the local it is assigned to.
 */
export function bodyReferencesNameAsCall(
  body: AstStatBlock | null,
  name: string,
): boolean {
  if (!body) return false;
  let found = false;
  walk(body, (node) => {
    if (found) return false;
    if (node instanceof AstExprCall && !node.self) {
      const callee = node.func;
      const callName =
        callee instanceof AstExprGlobal
          ? callee.name
          : callee instanceof AstExprLocal
            ? callee.local.name
            : null;
      if (callName === name) found = true;
    }
    return !found;
  });
  return found;
}

/**
 * The names the statements of `block` declare as locals themselves
 * (`local x`, `local function f`), not those declared inside the blocks
 * within it: what a `repeat` loop's `until` condition sees of its body.
 */
export function blockLocalNames(block: AstStatBlock): string[] {
  const names: string[] = [];
  for (const stat of block.body) {
    if (stat instanceof AstStatLocal && !stat.isConst) {
      names.push(...stat.vars.map((v) => v.name));
    } else if (stat instanceof AstStatLocalFunction && !stat.isConst) {
      names.push(stat.name.name);
    }
  }
  return names;
}

// Build the closure-value `ObjectExpression`. The shape is recognized
// by `CallValueAsFunction`'s closure-aware dispatch in Story.ts:
//   {
//     __closure_fn: -> __anon_fn_<syntheticId>,
//     __closure_upvals: { "0": <upval0>, "1": <upval1>, ... },
//     __closure_user_arity: <K>,
//   }
//
// Each upval value is a `VariablePointerExpression` — at runtime that
// emits a `VariablePointerValue` referencing the outer-scope variable.
// The runtime auto-resolves the pointer's `contextIndex` to the
// current frame at push time and registers it as an "open upvalue".
// When the outer frame later pops, `CallStack.Pop` snapshots the
// current value into `pointer.closedValue`, so the closure keeps
// working after its lexical parent is gone (Lua semantics).
//
// Multiple closures capturing the same outer variable share a single
// `VariablePointerValue` (dedup happens at auto-resolve time), so
// mutations made by one closure are visible to the others — both
// while the parent is alive and after it has closed.
export function buildClosureExpression(
  synthName: string,
  upvals: string[],
  userArity: number,
): Expression {
  const fnDivert = new DivertTarget(
    new Divert([new Identifier(synthName)]),
    true,
  );
  const upvalEntries: ObjectExpressionEntry[] = upvals.map(
    (name, i) =>
      new ObjectExpressionEntry(
        String(i),
        new VariablePointerExpression(name),
      ),
  );
  const upvalObject = new ObjectExpression(upvalEntries);
  const arityExpr = new NumberExpression(userArity, "int");
  return new ObjectExpression([
    new ObjectExpressionEntry("__closure_fn", fnDivert),
    new ObjectExpressionEntry("__closure_upvals", upvalObject),
    new ObjectExpressionEntry("__closure_user_arity", arityExpr),
  ]);
}

/**
 * Lowers the body of the function `func` (written at the syntax node `node`)
 * inside the scopes a function opens: a buffer for the functions nested in
 * it, its own locals on the declared-locals stack, a buffer for the
 * `local NAME = nil` declarations its bare nested `function NAME`s hoist,
 * and a frame for its variadic nested functions. Returns the body's objects
 * with the hoisted declarations first and the nested functions last, and
 * passes the shape of the body to `close` once the function is built.
 */
export function lowerFunctionBody(
  func: AstExprFunction,
  node: SyntaxNode,
  ctx: LowerContext,
  skipNames: ReadonlySet<string> = FUNCTION_BODY_SKIP,
): {
  hoisted: ParsedObject[];
  body: ParsedObject[];
  nested: ParsedObject[];
  close: (flow: ParsedObject) => void;
} {
  const content = getFunctionBodyContent(node);
  const nested: ParsedObject[] = [];
  ctx.functionScopeStack?.push(nested);
  ctx.declaredLocalsStack?.push(
    immediateBodyDeclarations(parameterNames(func), func.body),
  );
  const hoisted: ParsedObject[] = [];
  ctx.hoistedNestedFnDeclsStack?.push(hoisted);
  const siblingSubFlows = new Map<string, SiblingSubFlowInfo>();
  ctx.siblingSubFlowNamesStack?.push(siblingSubFlows);
  const shape = openFunctionBody(ctx, node);
  const body = lowerStatements(content, ctx, skipNames, shape);
  ctx.siblingSubFlowNamesStack?.pop();
  ctx.hoistedNestedFnDeclsStack?.pop();
  ctx.declaredLocalsStack?.pop();
  ctx.functionScopeStack?.pop();
  return {
    hoisted,
    body,
    nested,
    close: (flow) => closeFunctionBody(ctx, shape, flow, node, hoisted),
  };
}

// A function written as a value, as a `Function` flow of its own named
// `name`, whose parameters are the captured `upvals` followed by its own:
// the closure-dispatch path in `CallValueAsFunction` pushes the upvals as
// the first arguments, so the body's reads of captured names resolve as
// parameter reads. Functions nested in its body attach to it as subflows.
export function buildFunction(
  func: AstExprFunction,
  node: SyntaxNode,
  name: string,
  ctx: LowerContext,
  upvals: string[] = [],
  leading: Argument[] = [],
): Function {
  const upvalArgs = upvals.map(
    (upvalName) =>
      new Argument(new Identifier(upvalName), false, false, false, true),
  );
  const args = [...upvalArgs, ...leading, ...functionArguments(func)];
  const { hoisted, body, nested, close } = lowerFunctionBody(func, node, ctx);
  const fn = new Function(
    new Identifier(name),
    [...hoisted, ...body, ...nested],
    args,
  );
  close(fn);
  return fn;
}

// The name in a function's own header: a plain name
// (`LuauFunctionDeclarationName`) or a dotted or method name, which
// parses as a `LuauAccessPath`. Only nodes before the parameter list
// count, since an inline body's statements sit beside it.
function findHeaderName(node: SyntaxNode): SyntaxNode | null {
  let content: SyntaxNode | null = null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "LuauFunctionDefinition_content") content = child;
  }
  for (let child = (content ?? node).firstChild; child; child = child.nextSibling) {
    if (child.name === "LuauFunctionParameters") return null;
    if (child.name === "LuauFunctionDeclarationName") {
      return getDescendent("LuauFunctionName", child) ?? child;
    }
    if (child.name === "LuauAccessPath") return child;
  }
  return null;
}

// Luau's parser reads a function expression's `(` where the name sits,
// so it reports `Expected '(' when parsing function, got 'NAME'`. The
// squiggle covers the name.
function reportNamedFunctionValue(nameNode: SyntaxNode, ctx: LowerContext) {
  if (!ctx.diagnostics) return;
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  ctx.diagnostics.push({
    message: `Expected '(' when parsing function, got '${name}'`,
    severity: ErrorType.Error,
    source: statementSource(nameNode, ctx),
  });
}

// The function, taking only the parameters written after `offset`.
function withArgsAfter(
  func: AstExprFunction,
  offset: number,
  ctx: LowerContext,
): AstExprFunction {
  const args = func.args.filter(
    (arg) => offsetAt(arg.location.begin, ctx) >= offset,
  );
  if (args.length === func.args.length) return func;
  return Object.assign(
    Object.create(Object.getPrototypeOf(func) as object) as AstExprFunction,
    func,
    { args },
  );
}

/**
 * Lowers a function expression (`function(x) return x * 2 end`): builds its
 * function, attached to the enclosing function's buffer as a nested
 * subflow, or hoisted to the chunk's top level when no function encloses
 * it, and returns the closure value that names it with the variables it
 * captures. The closure-shaped value is built even with no upvalues, so the
 * runtime's value-call dispatch has `__closure_user_arity` to pad
 * under-supplied arguments with nil.
 *
 * A named function in a value position (`g = function named() ... end`) is
 * a Luau parse error: it is reported at the name and then lowered as if
 * anonymous, so the rest of the story compiles.
 */
export function lowerFunctionExpression(
  func: AstExprFunction,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  if (!ctx.hoistedKnots && !ctx.functionScopeStack) {
    // Snapshot-only callers that don't wire up either hoist target
    // can't support function values at runtime.
    return null;
  }
  const node = functionNode(func, source, ctx);
  if (!node) return null;
  const headerName = findHeaderName(node);
  if (headerName) {
    // A named function on the line after a list's comma is a statement to
    // Sparkdown's grammar, and the comma is reported as missing its value
    // (`commaBeforeStatement`).
    if (!followsLineEndingComma(node, ctx)) {
      reportNamedFunctionValue(headerName, ctx);
    }
    // Luau's parser, recovering, reads the name as the parameter list
    // (`function a.f()` takes `a`); the function takes the parameters it
    // is written with.
    func = withArgsAfter(func, headerName.to, ctx);
  }

  const synthName = `__anon_fn_${syntheticId(node.from, ctx)}`;
  const upvals = freeVariables(parameterNames(func), func.body, ctx);
  recordCaptureRead(ctx, upvals);
  const userArity = func.args.length;

  // Compound-assignment lowering (`obj[fn()] += 1`) lowers the target's
  // expressions twice, once to read and once to write, which builds the
  // same function twice under the same name; a duplicate sibling would be
  // a "duplicate flow" error, so the first one built is kept.
  const stack = ctx.functionScopeStack;
  const targetBuf =
    stack && stack.length > 0 ? stack[stack.length - 1] : ctx.hoistedKnots;
  const alreadyRegistered = !!targetBuf?.some(
    (o) => o instanceof Function && o.identifier?.name === synthName,
  );
  if (!alreadyRegistered) {
    const fn = buildFunction(func, node, synthName, ctx, upvals);
    if (stack && stack.length > 0) {
      stack[stack.length - 1]!.push(fn);
    } else if (ctx.hoistedKnots) {
      ctx.hoistedKnots.push(fn);
    } else {
      return null;
    }
  } else if (upvals.length === 0) {
    return new DivertTarget(new Divert([new Identifier(synthName)]), true);
  }
  return buildClosureExpression(synthName, upvals, userArity);
}
