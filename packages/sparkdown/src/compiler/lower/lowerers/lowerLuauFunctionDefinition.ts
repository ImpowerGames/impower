import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { DivertTarget } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/DivertTarget";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerStatements } from "../lower";
import {
  bodyReferencesNameAsCall,
  buildAnonymousFunction,
  buildClosureExpression,
  collectImmediateBodyDeclarations,
  countUserParameters,
  scanFreeVariables,
} from "../expression/lowerExpression";
import { getFunctionBodyContent } from "../utils/getFunctionBodyContent";
import { lowerArguments } from "../utils/lowerArguments";
import { wrapInWeave } from "../utils/wrapInWeave";

// `function name(args) BODY end` → Knot(name, [], args, isFunction=true) with
// the body content placed in the Knot's _rootWeave. parseIncrementally
// preserves this rootWeave when it sees a Knot with one already set.
//
// Anonymous function expressions (e.g. inside `return (...)`) are NOT
// dispatched here — only top-level named function declarations are. The
// expression lowerer treats anonymous functions as an unsupported primary
// for now.
//
// Function purity (no display text, no diverts in the body) is enforced
// by the grammar itself: a `LuauFunctionDefinition`'s body only includes
// Luau-statement patterns, so display lines and `-> divert` syntax can't
// land here. No lowerer-side validation is needed.

const FUNCTION_BODY_SKIP: ReadonlySet<string> = new Set([
  "LuauFunctionDeclarationName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
  "LuauComment",
]);

export function lowerLuauFunctionDefinition(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const declName = getDescendent("LuauFunctionDeclarationName", nodeRef.node);
  if (!declName) {
    // Anonymous function (no name after `function`) — skip at statement
    // level; expression-position anonymous fns are handled by the
    // expression lowerer.
    return {};
  }
  const nameNode = getDescendent("LuauFunctionName", declName);
  if (!nameNode) return {};
  const identifier = new Identifier(ctx.read(nameNode.from, nameNode.to));

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
    // Detect the explicit `local` prefix (`local function NAME ... end`).
    // Luau scopes `local function NAME` to the innermost block, while
    // bare `function NAME` is sugar for `NAME = function() end` —
    // visible across `do`/`while`/`for`/`if` block boundaries within
    // the enclosing function. The lowerer hoists the latter's binding
    // to the function-body level so a `do ... function NAME end end`
    // followed by `NAME(...)` outside the block still resolves.
    const scopeNode = getDescendent("LuauScopeModifier", nodeRef.node);
    const scopeText = scopeNode
      ? ctx.read(scopeNode.from, scopeNode.to).trim()
      : "";
    const isLocal = scopeText === "local";
    // Variadic functions (`function f(a, ...) ... end`) keep the
    // legacy subFlow-knot form rather than converting to a local
    // closure. Static-dispatch is the only path that handles the
    // call-site `PackTuple` for the `...` slot today; routing
    // through `CallValueAsFunction` would need extra runtime work to
    // pack surplus args without the lowerer knowing the target's
    // arity. Trade-off: no upvalue capture for variadic functions
    // — acceptable for V1 since varargs use rarely overlaps with
    // closure capture in practice.
    const argsPreview = lowerArguments(nodeRef.node, ctx);
    const isVariadic =
      argsPreview.length > 0 && !!argsPreview[argsPreview.length - 1]!.isVararg;
    if (!isVariadic) {
      return lowerNestedNamedFunction(
        nodeRef.node,
        identifier,
        ctx,
        enclosingScope,
        isLocal,
      );
    }
    return lowerNestedAsSubFlow(
      nodeRef.node,
      identifier,
      argsPreview,
      ctx,
      enclosingScope,
    );
  }

  const args = lowerArguments(nodeRef.node, ctx);
  const content = getFunctionBodyContent(nodeRef.node);

  // Open a per-function buffer for any nested callables (anonymous
  // function literals, nested named functions) that appear inside
  // the body. They get pushed here instead of `hoistedKnots`, so
  // they live as subFlows of this function rather than at the
  // chunk's top level.
  const nested: ParsedObject[] = [];
  ctx.functionScopeStack?.push(nested);
  // Also stack this function's immediate-body locals onto the
  // declared-locals stack so any NESTED `scanFreeVariables` call
  // can detect shadowing (a stdlib-named identifier locally
  // declared in this scope must be captured as an upval rather
  // than routed through stdlib dispatch).
  const ownLocals = collectImmediateBodyDeclarations(nodeRef.node, ctx);
  ctx.declaredLocalsStack?.push(ownLocals);
  // Hoist buffer: nested `function NAME end` declarations (without
  // `local`) push their `local NAME = nil` pre-declaration here so it
  // lands at the top of this function's body, surviving any
  // intervening do/while/for/if block scopes.
  const hoistedDecls: ParsedObject[] = [];
  ctx.hoistedNestedFnDeclsStack?.push(hoistedDecls);
  const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);
  ctx.hoistedNestedFnDeclsStack?.pop();
  ctx.declaredLocalsStack?.pop();
  ctx.functionScopeStack?.pop();

  const knot = new Knot(identifier, [], args, true);
  const rootWeave = new Weave([...hoistedDecls, ...body]);
  knot._rootWeave = rootWeave;
  knot.AddContent(rootWeave);
  // Nested callables collected during this function's body lowering
  // become subFlows of the knot. Adding them as content makes
  // SparkdownCompiler's flow-rewrap step pick them up (via the
  // `_subFlowsByName` preservation we just added).
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
// `local name = function(args) ... end`. Two-step:
//
//   1. Scan the body for free variables (names referenced inside but
//      not bound by parameters / local declarations / stdlib). Those
//      become the closure's upvalues, captured at declaration time.
//
//   2. Build a synthetic anonymous knot with the upvals prepended to
//      the user parameter list — same shape `lowerAnonymousFunction`
//      builds for `function(...) ... end` expressions. Push it onto
//      the enclosing function's nested-callables buffer so it ends
//      up as a subFlow of the parent.
//
//   3. Emit a `local NAME = <closure-value>` declaration. The closure
//      value is an `ObjectExpression` with `__closure_fn` /
//      `__closure_upvals` / `__closure_user_arity` keys that
//      `CallValueAsFunction` (Story.ts) recognizes for closure
//      dispatch.
//
// Without this, the nested function would lower as a plain
// subFlow Function — callable by name, but with no upvalue capture,
// so references to outer locals (e.g. `counter` in
// `local function AddToCounter(n) counter += n end`) fail to resolve.
function lowerNestedNamedFunction(
  node: import("@lezer/common").SyntaxNode,
  identifier: Identifier,
  ctx: LowerContext,
  enclosingScope: ParsedObject[],
  isLocal: boolean,
): CompiledBlock {
  const synthName = `__anon_fn_${node.from}`;
  const upvals = scanFreeVariables(node, ctx);

  // Detect self-recursion: if the body calls the declared name, add
  // it to upvals so the closure captures a live pointer to the local
  // (declared as nil first, then assigned the closure value). Lua's
  // `local function f() ... f() ... end` sugar enables this.
  const selfName = identifier.name ?? "";
  const isSelfReferential =
    !!selfName && bodyReferencesNameAsCall(node, ctx, selfName);
  if (isSelfReferential && !upvals.includes(selfName)) {
    upvals.push(selfName);
  }

  const fn = buildAnonymousFunction(node, synthName, ctx, upvals);
  if (!fn) {
    // Fallback: keep the legacy subFlow behaviour if the helper
    // couldn't build a function (shouldn't happen with normal
    // input, but doesn't hurt to degrade gracefully).
    const args = lowerArguments(node, ctx);
    const content = getFunctionBodyContent(node);
    const nested: ParsedObject[] = [];
    ctx.functionScopeStack?.push(nested);
    const ownLocals = collectImmediateBodyDeclarations(node, ctx);
    ctx.declaredLocalsStack?.push(ownLocals);
    const innerHoisted: ParsedObject[] = [];
    ctx.hoistedNestedFnDeclsStack?.push(innerHoisted);
    const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);
    ctx.hoistedNestedFnDeclsStack?.pop();
    ctx.declaredLocalsStack?.pop();
    ctx.functionScopeStack?.pop();
    enclosingScope.push(
      new Function(identifier, [...innerHoisted, ...body, ...nested], args),
    );
    return {};
  }
  enclosingScope.push(fn);

  const userArity = countUserParameters(node, ctx);

  const closureValue =
    upvals.length === 0
      ? new DivertTarget(new Divert([new Identifier(synthName)]))
      : buildClosureExpression(synthName, upvals, userArity);

  // `local function NAME ... end` — declaration scoped to the
  // innermost block (Luau spec). Emit the binding in place.
  //
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
    // should land at function-body top. Subsequent declarations just
    // emit the in-place reassignment; the first hoist's slot already
    // exists in scope and the reassignment lands on it.
    const targetName = identifier.name ?? "";
    const alreadyHoisted = hoistBuf.some(
      (o) =>
        o instanceof VariableAssignment &&
        o.variableName === targetName,
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
    const assignClosure = new VariableAssignment({
      variableIdentifier: identifier,
      assignedExpression: closureValue,
      isTemporaryNewDeclaration: false,
    });
    return wrapInWeave([assignClosure]);
  }

  // Local (or no enclosing hoist buffer — top-level chunk).
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

  const declaration = new VariableAssignment({
    variableIdentifier: identifier,
    assignedExpression: closureValue,
    isTemporaryNewDeclaration: true,
  });
  return wrapInWeave([declaration]);
}

// Variadic nested fns keep the legacy "subFlow `Function` attached to
// the enclosing flow" shape so their call sites can reach the static-
// dispatch path that handles `PackTuple` for the `...` slot. Trade-off
// for V1: variadic functions can't capture upvalues from outer scopes
// (the closure-dispatch path doesn't yet pack surplus args at runtime,
// see `extractClosurePath` in Story.ts). Self-recursion still works via
// in-flow name resolution since the function lives at its own name.
function lowerNestedAsSubFlow(
  node: import("@lezer/common").SyntaxNode,
  identifier: Identifier,
  args: import("../../../inkjs/compiler/Parser/ParsedHierarchy/Argument").Argument[],
  ctx: LowerContext,
  enclosingScope: ParsedObject[],
): CompiledBlock {
  const content = getFunctionBodyContent(node);
  const nested: ParsedObject[] = [];
  ctx.functionScopeStack?.push(nested);
  const ownLocals = collectImmediateBodyDeclarations(node, ctx);
  ctx.declaredLocalsStack?.push(ownLocals);
  const innerHoisted: ParsedObject[] = [];
  ctx.hoistedNestedFnDeclsStack?.push(innerHoisted);
  const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);
  ctx.hoistedNestedFnDeclsStack?.pop();
  ctx.declaredLocalsStack?.pop();
  ctx.functionScopeStack?.pop();
  enclosingScope.push(
    new Function(identifier, [...innerHoisted, ...body, ...nested], args),
  );
  return {};
}
