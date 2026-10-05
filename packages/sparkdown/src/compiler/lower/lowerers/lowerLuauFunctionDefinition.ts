import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { StorePropertyAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import {
  AstExprFunction,
  AstExprGlobal,
  AstExprIndexName,
  AstExprLocal,
  AstStatFunction,
  AstStatLocalFunction,
} from "../../typecheck/Ast";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import {
  recordCaptureRead,
  shadowSiblingSubFlow,
} from "../expression/bindings";
import { astIdentifier, pathNames } from "../expression/lowerExpression";
import {
  bodyReferencesNameAsCall,
  buildClosureExpression,
  buildFunction,
  freeVariables,
  functionArguments,
  lowerFunctionBody,
  parameterNames,
} from "../expression/lowerFunction";
import { lowerStoreBase } from "../utils/lowerPropertyTargetAssignment";
import { wrapInWeave } from "../utils/wrapInWeave";
import { syntheticId } from "../utils/documentTag";
import { statementNodeAt, type StatementSite } from "./lowerLuauStatement";

// `function name(args) BODY end` → Knot(name, [], args, isFunction=true) with
// the body content placed in the Knot's _rootWeave. parseIncrementally
// preserves this rootWeave when it sees a Knot with one already set.
//
// A function written in another function's body is a value of that
// function's scope (`lowerNestedNamedFunction`, or a subflow when it takes
// `...`), and `function a.f` / `function a:m` stores a function in a table
// (`lowerPropertyTargetFunctionDefinition`). A function expression is
// lowered by the expression lowerer (`lowerFunctionExpression`).
//
// Function purity (no display text, no diverts in the body) is enforced
// by the grammar itself: a `LuauFunctionDefinition`'s body only includes
// Luau-statement patterns, so display lines and `-> divert` syntax can't
// land here. No lowerer-side validation is needed.

const FUNCTION_NODES = nodeNameSet(["LuauFunctionDefinition"]);

export function lowerLuauFunctionDefinition(
  stat: AstStatFunction | AstStatLocalFunction,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, FUNCTION_NODES, ctx);
  if (!node) return {};
  const func = stat.func;
  // `function a.f(...) ... end` or `function a:m(...) ... end`: Lua
  // desugars these to stores of a function value in the table.
  if (stat instanceof AstStatFunction && stat.name instanceof AstExprIndexName) {
    return lowerPropertyTargetFunctionDefinition(stat.name, func, node, site, ctx);
  }
  const identifier =
    stat instanceof AstStatLocalFunction
      ? astIdentifier({ name: stat.name.name, location: stat.name.location }, ctx)
      : stat.name instanceof AstExprGlobal || stat.name instanceof AstExprLocal
        ? astIdentifier(pathNames(stat.name)![0]!, ctx)
        : null;
  if (!identifier) return {};

  // Detect whether this definition itself is lexically nested —
  // i.e. it lives inside another function's body. If so, we treat
  // the named declaration as syntactic sugar for `local NAME =
  // function ... end`: emit a synthetic anonymous knot, capture
  // upvalues that the body references from outer scopes, and
  // declare the name as a local holding the resulting closure
  // value. Otherwise emit a top-level `Knot` as before.
  const stack = ctx.functionScopeStack;
  const enclosingScope =
    stack && stack.length > 0 ? stack[stack.length - 1] : null;

  if (enclosingScope) {
    // `local function NAME` is scoped to the innermost block (Luau), while
    // bare `function NAME` is sugar for `NAME = function() end` — visible
    // across `do`/`while`/`for`/`if` block boundaries within the enclosing
    // function. The lowerer hoists the latter's binding to the
    // function-body level so a `do ... function NAME end end` followed by
    // `NAME(...)` outside the block still resolves.
    const isLocal = stat instanceof AstStatLocalFunction;
    // Variadic functions (`function f(a, ...) ... end`) keep the
    // subFlow-knot form rather than converting to a local closure: a
    // call reaches them by path, passing the upvalues they capture
    // before its own arguments (`lowerNestedAsSubFlow`), and packs
    // their `...` when it runs, as every call arranges its arguments
    // (`arrangeArgsFor`). A `local` of the name hides the subflow for
    // the rest of its block (`shadowSiblingSubFlow`).
    if (!func.vararg) {
      return lowerNestedNamedFunction(
        func,
        node,
        identifier,
        ctx,
        enclosingScope,
        isLocal,
      );
    }
    return lowerNestedAsSubFlow(func, node, identifier, ctx, enclosingScope);
  }

  const args = functionArguments(func);
  // The body opens a per-function buffer for any nested callables
  // (function values, nested named functions), so they live as subFlows of
  // this function rather than at the chunk's top level, and stacks this
  // function's own locals so a nested function's capture scan can detect
  // shadowing.
  const { hoisted, body, nested, close } = lowerFunctionBody(func, node, ctx);
  const knot = new Knot(identifier, [], args, true);
  close(knot);
  // A definition closes at its `end` or just before a following `scene` or
  // `branch`, and records either as its end. One whose body holds story
  // lines closes incomplete at the first of them, and the rest of its body,
  // up to a stray `end`, follows as chunks of their own.
  knot._bodyClosed = !!node.getChild(`${node.name}_end`);
  const rootWeave = new Weave([...hoisted, ...body]);
  knot._rootWeave = rootWeave;
  knot.AddContent(rootWeave);
  // Nested callables collected during this function's body lowering
  // become subFlows of the knot. Adding them as content makes
  // SparkdownCompiler's flow-rewrap step pick them up (via the
  // `_subFlowsByName` preservation).
  for (const child of nested) {
    knot.AddContent(child);
    const childFlow = child as Function;
    if (childFlow.identifier?.name) {
      knot._subFlowsByName.set(childFlow.identifier.name, childFlow);
    }
  }
  return { content: [knot] };
}

// Lower a nested `function name(args) ... end` (or `local function
// name(args) ... end`) declaration as syntactic sugar for
// `local name = function(args) ... end`:
//
//   1. Scan the body for free variables (names referenced inside but
//      not bound by parameters / local declarations / stdlib). Those
//      become the closure's upvalues, captured at declaration time.
//
//   2. Build a synthetic function with the upvals prepended to the user
//      parameter list — the shape a function expression builds. Push it
//      onto the enclosing function's nested-callables buffer so it ends up
//      as a subFlow of the parent.
//
//   3. Emit a `local NAME = <closure-value>` declaration. The closure
//      value is an `ObjectExpression` with `__closure_fn` /
//      `__closure_upvals` / `__closure_user_arity` keys that
//      `CallValueAsFunction` (Story.ts) recognizes for closure
//      dispatch.
function lowerNestedNamedFunction(
  func: AstExprFunction,
  node: SyntaxNode,
  identifier: Identifier,
  ctx: LowerContext,
  enclosingScope: ParsedObject[],
  isLocal: boolean,
): CompiledBlock {
  const synthName = `__anon_fn_${syntheticId(node.from, ctx)}`;
  const upvals = freeVariables(parameterNames(func), func.body, ctx);

  // Detect self-recursion: if the body calls the declared name, add
  // it to upvals so the closure captures a live pointer to the local
  // (declared as nil first, then assigned the closure value). Lua's
  // `local function f() ... f() ... end` sugar enables this.
  const selfName = identifier.name ?? "";
  const isSelfReferential =
    !!selfName && bodyReferencesNameAsCall(func.body, selfName);
  if (isSelfReferential && !upvals.includes(selfName)) {
    upvals.push(selfName);
  }
  recordCaptureRead(ctx, upvals);

  enclosingScope.push(
    buildFunction(func, node, synthName, ctx, upvals),
  );

  // Always emit the closure-shaped ObjectValue (even when there are
  // no upvals) so the runtime CallValueAsFunction dispatch has the
  // `__closure_user_arity` field available to pad under-supplied
  // args with nil. Without this, callers like `function foo(a, b);
  // ... end; foo(1)` would have the function body's param binding
  // pop garbage from the caller's eval context for the missing `b`.
  const closureValue = buildClosureExpression(synthName, upvals, func.args.length);

  // `function NAME ... end` (no `local`) — Luau treats this as
  // `NAME = function() end`, a non-local assignment visible across
  // do/while/for/if block boundaries inside the enclosing function.
  // Hoist the `local NAME = nil` pre-declaration to the enclosing
  // function's body level and emit a REASSIGNMENT in place. The
  // reassignment walks the enclosing function's scope chain
  // innermost-first and lands on the hoisted slot.
  const hoistBuf = ctx.hoistedNestedFnDeclsStack?.at(-1);
  if (!isLocal && hoistBuf) {
    // Dedupe: when the enclosing function defines `function NAME end`
    // more than once (Luau allows function redefinition — the last
    // assignment wins), only one `local NAME = nil` pre-declaration
    // should land at function-body top.
    const targetName = identifier.name ?? "";
    const alreadyHoisted = hoistBuf.some(
      (o) => o instanceof VariableAssignment && o.variableName === targetName,
    );
    if (!alreadyHoisted) {
      hoistBuf.push(
        new VariableAssignment({
          variableIdentifier: new Identifier(targetName),
          assignedExpression: new NullExpression(),
          isTemporaryNewDeclaration: true,
        }),
      );
    }
    return wrapInWeave([
      new VariableAssignment({
        variableIdentifier: identifier,
        assignedExpression: closureValue,
        isTemporaryNewDeclaration: false,
      }),
    ]);
  }

  // Local (or no enclosing hoist buffer — top-level chunk). The local
  // hides a variadic function of its name for the rest of its block.
  shadowSiblingSubFlow(selfName, ctx);
  if (isSelfReferential) {
    const declareNil = new VariableAssignment({
      variableIdentifier: new Identifier(selfName),
      assignedExpression: new NullExpression(),
      isTemporaryNewDeclaration: true,
    });
    const assignClosure = new VariableAssignment({
      variableIdentifier: new Identifier(selfName),
      assignedExpression: closureValue,
      isTemporaryNewDeclaration: false,
    });
    return wrapInWeave([declareNil, assignClosure]);
  }
  return wrapInWeave([
    new VariableAssignment({
      variableIdentifier: identifier,
      assignedExpression: closureValue,
      isTemporaryNewDeclaration: true,
    }),
  ]);
}

// Variadic nested fns keep the "subFlow `Function` attached to the
// enclosing flow" shape, which their call sites reach by path; the call
// packs the `...` slot when it runs (`arrangeArgsFor`).
// Upvalue capture works by prepending the body's free variables as
// PARAMETERS (the same shape closures use): every call site prepends
// matching `VariablePointerExpression`s (see the sibling-subflow
// lookup in `lowerExpression`'s call dispatch), so reads and writes
// go through the shared cell — `local abs = math.abs function foo(...)
// return abs(...) end` must read the enclosing local. Self-recursion
// still works via in-flow name resolution since the function lives at
// its own name — the self-call's prepended pointers reference the
// subflow's OWN upval parameters, threading the same cells through
// each recursion level.
function lowerNestedAsSubFlow(
  func: AstExprFunction,
  node: SyntaxNode,
  identifier: Identifier,
  ctx: LowerContext,
  enclosingScope: ParsedObject[],
): CompiledBlock {
  const args = functionArguments(func);
  // Register the NAME on the ENCLOSING scope's sibling-subFlow frame
  // BEFORE the free-variable scan: a self-recursive body reference
  // (`function concat(...) ... concat(...) end`) must resolve via
  // in-flow name dispatch, NOT be captured as an upval of itself
  // (the call site would then emit a pointer to a variable that
  // doesn't exist). The placeholder empty upval list is replaced
  // with the real list right after the scan — before the body
  // lowers — so self-recursive call sites prepend the same upval
  // pointers as external callers (threading this fn's own upval
  // params down each level).
  const enclosingSiblingFrame = ctx.siblingSubFlowNamesStack?.at(-1);
  const fixedArity = args.filter((a) => !a.isVararg).length;
  // REDEFINITION (`function f(...)` twice in one function body —
  // vararg.luau lines 9/64): both bodies must survive as distinct
  // containers (`_subFlowsByName` is name-keyed, so a second
  // same-named Function would silently replace the first and calls
  // BEFORE the redefinition would jump into the wrong body). Mangle
  // the second+ definition's container name; the registry entry maps
  // the source name to it, and since registration happens in lexical
  // order, call sites before the redefinition bound the first
  // container and sites after bind this one — matching Lua's
  // assign-a-global semantics.
  const knotName = enclosingSiblingFrame?.has(identifier.name ?? "")
    ? `${identifier.name}__redef_${syntheticId(node.from, ctx)}`
    : (identifier.name ?? "");
  const knotIdentifier =
    knotName === identifier.name ? identifier : new Identifier(knotName);
  if (enclosingSiblingFrame && identifier.name) {
    enclosingSiblingFrame.set(identifier.name, {
      upvals: [],
      arity: fixedArity,
      knotName,
    });
  }
  // Free-variable scan BEFORE pushing this fn's own scope frames —
  // the scan binds the fn's params/locals internally and consults the
  // ENCLOSING declared-locals stack for what needs capturing.
  const upvals = freeVariables(parameterNames(func), func.body, ctx);
  recordCaptureRead(ctx, upvals);
  const upvalArgs = upvals.map(
    (n) => new Argument(new Identifier(n), false, false, false, true),
  );
  if (enclosingSiblingFrame && identifier.name) {
    enclosingSiblingFrame.set(identifier.name, {
      upvals,
      arity: fixedArity,
      knotName,
    });
  }
  const { hoisted, body, nested, close } = lowerFunctionBody(func, node, ctx);
  const fn = new Function(
    knotIdentifier,
    [...hoisted, ...body, ...nested],
    [...upvalArgs, ...args],
  );
  close(fn);
  fn._outsideBlocks = isWrittenInFunctionBody(node);
  enclosingScope.push(fn);
  return {};
}

const FUNCTION_BODY_CONTENT: ReadonlySet<string> = nodeNameSet([
  "LuauFunctionBody_content",
  "LuauFunctionDefinition_content",
  "LuauMethodDefinition_content",
]);

// Whether a function definition is written directly in the body of the
// function around it, outside every block of it: the nearest content node
// above it is that function's body, not a block's.
function isWrittenInFunctionBody(node: SyntaxNode): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (p.name.endsWith("_content")) {
      return FUNCTION_BODY_CONTENT.has(p.name);
    }
  }
  return false;
}

// `function a.f(p) BODY end` and `function a:m(p) BODY end`. Lua
// desugars these as:
//   `function a.f(p) BODY end`  →  `a.f = function(p) BODY end`
//   `function a:m(p) BODY end`  →  `a.m = function(self, p) BODY end`
//
// The function is built as a synthetic function (a subFlow on the
// enclosing scope's buffer or the chunk's hoisted-knots list), and a
// `StorePropertyAssignment(base, "name", closure)` writes its closure value
// into the table key. The colon form's implicit `self` is a parameter.
function lowerPropertyTargetFunctionDefinition(
  name: AstExprIndexName,
  func: AstExprFunction,
  node: SyntaxNode,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const isColonForm = name.op === ":";
  const baseExpr = lowerStoreBase(name.expr, site.source, ctx);
  if (!baseExpr) return {};
  const synthName = `__anon_fn_${syntheticId(node.from, ctx)}`;

  // Upvalue capture — `function Class.new()` bodies routinely
  // reference outer locals (`setmetatable(self, Class)` captures
  // `Class` itself, the canonical Lua OOP pattern at basic.luau
  // lines 419-438). The colon form's implicit `self` is a
  // PARAMETER, not a free variable — exclude it from capture.
  const upvals = freeVariables(parameterNames(func), func.body, ctx).filter(
    (n) => !(isColonForm && n === "self"),
  );
  recordCaptureRead(ctx, upvals);
  const leading = isColonForm
    ? [new Argument(new Identifier("self"), false, false)]
    : [];
  const stack = ctx.functionScopeStack;
  const enclosingScope =
    stack && stack.length > 0 ? stack[stack.length - 1] : null;
  if (!enclosingScope && !ctx.hoistedKnots) return {};
  const fn = buildFunction(func, node, synthName, ctx, upvals, leading);
  if (enclosingScope) {
    enclosingScope.push(fn);
  } else {
    ctx.hoistedKnots!.push(fn);
  }

  // Closure-shaped value (always — even with zero upvals the
  // `__closure_user_arity` field lets the call site pad missing
  // args with nil). User arity counts the implicit `self` for
  // colon-form methods (the method-call dispatch passes the receiver
  // as the first user arg) but NOT `...`: `__closure_user_arity` is
  // the FIXED-param count by contract; the runtime value-call packing
  // pushes the packed `...` MultiValue as one extra slot beyond it.
  const userArity = (isColonForm ? 1 : 0) + func.args.length;
  const closureValue = buildClosureExpression(synthName, upvals, userArity);
  const keyExpr = new StringExpression([new Text(name.index)]);
  return wrapInWeave([
    new StorePropertyAssignment(baseExpr, keyExpr, closureValue),
  ]);
}
