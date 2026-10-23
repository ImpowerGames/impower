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
import { recordCaptureRead, recordRebind } from "../expression/bindings";
import { astIdentifier, pathNames } from "../expression/lowerExpression";
import {
  bodyReferencesNameAsCall,
  buildClosureExpression,
  buildFunction,
  freeVariables,
  functionArguments,
  lowerFunctionBody,
  parameterNames,
  closureRootCaptures,
  rootCaptureSlots,
  type RootRead,
} from "../expression/lowerFunction";
import { lowerStoreBase } from "../utils/lowerPropertyTargetAssignment";
import { wrapInWeave } from "../utils/wrapInWeave";
import { reportReassignedConst } from "../utils/publishesConst";
import { syntheticId } from "../utils/documentTag";
import { statementNodeAt, type StatementSite } from "./lowerLuauStatement";

// `function name(args) BODY end` → Knot(name, [], args, isFunction=true) with
// the body content placed in the Knot's _rootWeave. parseIncrementally
// preserves this rootWeave when it sees a Knot with one already set.
//
// A function written in another function's body is a value of that
// function's scope (`lowerNestedNamedFunction`), with `...` or without,
// and `function a.f` / `function a:m` stores a function in a table
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
  // `function X()` over a function's `const X` reassigns it: Luau's error.
  if (stat instanceof AstStatFunction) reportReassignedConst(stat.name, site.node, ctx);
  if (!identifier) return {};

  // Detect whether this definition itself is lexically nested —
  // i.e. it lives inside another function's body. If so, we treat
  // the named definition as syntactic sugar over a function value:
  // emit a synthetic anonymous knot, capture upvalues that the body
  // references from outer scopes, and either declare a local holding
  // the resulting closure value (`local function NAME`) or assign it
  // to NAME (`function NAME`, below). Otherwise emit a top-level
  // `Knot` as before.
  const stack = ctx.functionScopeStack;
  const enclosingScope =
    stack && stack.length > 0 ? stack[stack.length - 1] : null;

  if (enclosingScope) {
    // `local function NAME` declares a local scoped to the innermost block
    // (Luau), while bare `function NAME` is sugar for `NAME = function()
    // end` (I-1422): it assigns the local named NAME in scope where it is
    // written (a parameter, a `local`, a local function, an enclosing
    // function's local, a top-level `local` the function's entry binds),
    // and the global NAME when none is.
    const isLocal = stat instanceof AstStatLocalFunction;
    // A variadic function (`function f(a, ...) ... end`) is a closure
    // too, which packs its `...` when a call runs it, as every call
    // arranges its arguments (`arrangeArgsFor`). Its closure captures the
    // locals it reads where it is defined, as Luau's does, so a call from
    // a scope with a local of one of their names still reads the one it
    // closes over (I-1361); a closure written before the statement calls
    // it through the variable, nil until the statement runs (I-1360); and
    // any assignment to the name rebinds that variable (I-1355).
    return lowerNestedNamedFunction(func, node, identifier, ctx, enclosingScope, isLocal);
  }

  const args = functionArguments(func);
  // The body opens a per-function buffer for any nested callables
  // (function values, nested named functions), so they live as subFlows of
  // this function rather than at the chunk's top level, and stacks this
  // function's own locals so a nested function's capture scan can detect
  // shadowing. Its entry binds each name the body reads from a `local` of
  // the root frame's own scope in scope where the function is written
  // (`rootBindings`, captured none): a function written at the top level
  // reads and writes that local as Luau's upvalue, though it is built before
  // the local exists.
  const { hoisted, body, nested, close } = lowerFunctionBody(func, node, ctx, null);
  const knot = new Knot(identifier, [], args, true);
  close(knot);
  // A definition closes at its `end` or just before a following `scene` or
  // `branch`, and records either as its end. One whose body holds story
  // lines closes incomplete at the first of them, and the rest of its body,
  // up to a stray `end`, follows as chunks of their own.
  knot._bodyClosed = !!node.getChild("LuauFunctionDefinition_end");
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

// Lower a nested `local function name(args) ... end` declaration as
// syntactic sugar for `local name = function(args) ... end`, and a nested
// `function name(args) ... end` as `name = function(args) ... end`:
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
//   3. Emit a `local NAME = <closure-value>` declaration, or the
//      assignment `NAME = <closure-value>`. The closure
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
  const rootReads: RootRead[] = [];
  const upvals = freeVariables(parameterNames(func), func.body, ctx, { node, rootReads });

  // Detect self-reference: if the body calls the declared name, or reads
  // it as a value (`type(f)`, `local again = f`), which the scan captures,
  // the closure captures a live pointer to the local (declared as nil
  // first, then assigned the closure value). Lua's `local function f()
  // ... f ... end` sugar enables this.
  const selfName = identifier.name ?? "";
  const isSelfReferential =
    !!selfName &&
    (upvals.includes(selfName) || bodyReferencesNameAsCall(func.body, selfName));
  if (isSelfReferential && !upvals.includes(selfName)) {
    upvals.push(selfName);
  }
  recordCaptureRead(ctx, upvals);

  // `function NAME` assigns NAME (below): calls of a name no local takes,
  // in its own body (a recursive call) and after it, dispatch through the
  // value NAME holds as they run, as after `NAME = <expr>`
  // (`recordRebind`), so the body is lowered after the rebind is recorded.
  if (!isLocal) recordRebind(selfName, ctx);

  // Its frames and its value are labelled by the name it is written with,
  // not the generated one (`functionLabel`).
  const fn = buildFunction(func, node, synthName, ctx, upvals);
  fn._authoredName = selfName || null;
  enclosingScope.push(fn);

  // Always emit the closure-shaped ObjectValue (even when there are
  // no upvals) so the runtime CallValueAsFunction dispatch has the
  // `__closure_user_arity` field available to pad under-supplied
  // args with nil. Without this, callers like `function foo(a, b);
  // ... end; foo(1)` would have the function body's param binding
  // pop garbage from the caller's eval context for the missing `b`.
  // The closure of a `local function` that reads its own name captures
  // the local its statement has just declared, by name.
  const closureValue = buildClosureExpression(
    synthName,
    upvals,
    func.args.length,
    rootCaptureSlots(
      rootReads.filter(({ name }) => !isSelfReferential || name !== selfName),
      upvals,
      ctx,
    ),
    closureRootCaptures(rootReads, upvals, ctx),
  );

  // `function NAME ... end` (no `local`) is `NAME = function() end`, as
  // Luau's is (I-1422): it assigns the variable NAME resolves to where it
  // is written, the innermost local of that name in scope (one the
  // function's entry binds to a top-level `local` included), else the
  // global, and declares nothing that would hide it from the lines before.
  if (!isLocal) {
    return wrapInWeave([
      new VariableAssignment({
        variableIdentifier: identifier,
        assignedExpression: closureValue,
        isTemporaryNewDeclaration: false,
      }),
    ]);
  }

  // A `local function`.
  if (isSelfReferential) {
    // The body calls the function by its name, so the name is declared
    // before the closure is built and the closure is assigned after. The
    // assignment is the declaration's initializer, not a write to the
    // variable: a data breakpoint on a variable of the same name declared
    // before it does not hear it (#1720).
    const declareNil = new VariableAssignment({
      variableIdentifier: new Identifier(selfName),
      assignedExpression: new NullExpression(),
      isTemporaryNewDeclaration: true,
    });
    const assignClosure = new VariableAssignment({
      variableIdentifier: new Identifier(selfName),
      assignedExpression: closureValue,
      isTemporaryNewDeclaration: false,
      isDeclarationInitializer: true,
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
  const rootReads: RootRead[] = [];
  const upvals = freeVariables(parameterNames(func), func.body, ctx, { node, rootReads }).filter(
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
  const closureValue = buildClosureExpression(
    synthName,
    upvals,
    userArity,
    rootCaptureSlots(rootReads, upvals, ctx),
    closureRootCaptures(rootReads, upvals, ctx),
  );
  const keyExpr = new StringExpression([new Text(name.index)]);
  const definition = new StorePropertyAssignment(baseExpr, keyExpr, closureValue);
  definition.definesFunction = true;
  return wrapInWeave([definition]);
}
