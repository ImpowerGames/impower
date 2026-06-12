import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { type SyntaxNode } from "@lezer/common";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { StorePropertyAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/StorePropertyAssignment";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { IndexExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/IndexExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
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
import { findOwnDeclarationName } from "../utils/findOwnDeclarationName";
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
  const declName = findOwnDeclarationName(nodeRef.node);
  if (!declName) {
    // Two non-named cases share this branch:
    //
    // 1. Property-target function: `function a.f(...) ... end` or
    //    `function a:m(...) ... end`. The grammar's
    //    LuauFunctionDeclarationName has a `(?!{{LUAU_ACCESSOR_OPERATOR}})`
    //    negative lookahead that rejects dotted/colon names, so the
    //    name parses as a `LuauAccessPath` child of the function
    //    definition instead. Lower as property assignment:
    //    `a.f = function(...) ... end` (or with `self` prepended for
    //    the colon form).
    //
    // 2. Anonymous function: no name at all. Expression-position
    //    anonymous fns are handled by the expression lowerer; at
    //    statement level there's nothing to emit.
    const accessPath = findChildByName(
      findChildByName(nodeRef.node, "LuauFunctionDefinition_content") ??
        nodeRef.node,
      "LuauAccessPath",
    );
    if (accessPath) {
      return lowerPropertyTargetFunctionDefinition(
        nodeRef.node,
        accessPath,
        ctx,
      );
    }
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
  // Frame for nested variadic-fn names (`lowerNestedAsSubFlow`
  // populates this so inner closures know to skip upval capture for
  // these names — see `siblingSubFlowNamesStack` comment in
  // `LowerContext`).
  const siblingSubFlows = new Map<string, string[]>();
  ctx.siblingSubFlowNamesStack?.push(siblingSubFlows);
  const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);
  ctx.siblingSubFlowNamesStack?.pop();
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
    const innerSiblingSubFlows = new Map<string, string[]>();
    ctx.siblingSubFlowNamesStack?.push(innerSiblingSubFlows);
    const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);
    ctx.siblingSubFlowNamesStack?.pop();
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

  // Always emit the closure-shaped ObjectValue (even when there are
  // no upvals) so the runtime CallValueAsFunction dispatch has the
  // `__closure_user_arity` field available to pad under-supplied
  // args with nil. Without this, callers like `function foo(a, b);
  // ... end; foo(1)` would have the function body's param binding
  // pop garbage from the caller's eval context for the missing `b`.
  // The no-upvals path is essentially free at runtime (empty upvals
  // map, fast extractClosurePath) so we don't lose anything by
  // unifying the two.
  const closureValue = buildClosureExpression(synthName, upvals, userArity);

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
// dispatch path that handles `PackTuple` for the `...` slot.
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
  node: import("@lezer/common").SyntaxNode,
  identifier: Identifier,
  args: import("../../../inkjs/compiler/Parser/ParsedHierarchy/Argument").Argument[],
  ctx: LowerContext,
  enclosingScope: ParsedObject[],
): CompiledBlock {
  const content = getFunctionBodyContent(node);
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
  if (enclosingSiblingFrame && identifier.name) {
    enclosingSiblingFrame.set(identifier.name, []);
  }
  // Free-variable scan BEFORE pushing this fn's own scope frames —
  // the scan binds the fn's params/locals internally and consults the
  // ENCLOSING declared-locals stack for what needs capturing.
  const upvals = scanFreeVariables(node, ctx);
  const upvalArgs = upvals.map(
    (n) => new Argument(new Identifier(n), false, false),
  );
  if (enclosingSiblingFrame && identifier.name) {
    enclosingSiblingFrame.set(identifier.name, upvals);
  }
  const nested: ParsedObject[] = [];
  ctx.functionScopeStack?.push(nested);
  const ownLocals = collectImmediateBodyDeclarations(node, ctx);
  ctx.declaredLocalsStack?.push(ownLocals);
  const innerHoisted: ParsedObject[] = [];
  ctx.hoistedNestedFnDeclsStack?.push(innerHoisted);
  const innerSiblingSubFlows = new Map<string, string[]>();
  ctx.siblingSubFlowNamesStack?.push(innerSiblingSubFlows);
  const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);
  ctx.siblingSubFlowNamesStack?.pop();
  ctx.hoistedNestedFnDeclsStack?.pop();
  ctx.declaredLocalsStack?.pop();
  ctx.functionScopeStack?.pop();
  enclosingScope.push(
    new Function(
      identifier,
      [...innerHoisted, ...body, ...nested],
      [...upvalArgs, ...args],
    ),
  );
  return {};
}

// `function a.f(p) BODY end` and `function a:m(p) BODY end` — the
// grammar's `LuauFunctionDeclarationName` excludes dotted/colon names
// (its `(?!{{LUAU_ACCESSOR_OPERATOR}})` lookahead), so these forms
// parse with the name as a `LuauAccessPath` child of the function
// definition instead of a `LuauFunctionDeclarationName`.
//
// Lua desugars these as:
//   `function a.f(p) BODY end`  →  `a.f = function(p) BODY end`
//   `function a:m(p) BODY end`  →  `a.m = function(self, p) BODY end`
//
// We synthesize an anonymous Function (subFlow on the enclosing
// scope's buffer or the chunk's hoisted-knots list), then emit a
// `StorePropertyAssignment(base, "name", DivertTarget(synthName))`
// to write the closure value into the table key. For the colon form,
// the function body's free-variable scan also receives `self` as a
// declared local so its references resolve as parameter reads.
//
// Limitations of the initial version:
//   - Upval capture: free variables from outer scopes are captured
//     by lowering through `buildAnonymousFunction`, but the closure
//     wrapper (with `__closure_upvals`) isn't built — the
//     `StorePropertyAssignment` stores a bare `DivertTarget`. Calls
//     work via the runtime's value-call dispatch but mutated outer
//     locals won't be reflected. Acceptable for the common
//     `function a.f` declaration where no outer locals are captured.
//   - Multi-level dotted (`function a.b.c.f`) is supported only when
//     the base is a single variable reference. Deeper bases fall
//     through to the existing access-path lowering.
function lowerPropertyTargetFunctionDefinition(
  node: SyntaxNode,
  accessPath: SyntaxNode,
  ctx: LowerContext,
): CompiledBlock {
  const parts = collectAccessParts(accessPath);
  if (parts.length < 2) {
    // Just `a` — not a property-target declaration. Treat as anon.
    return {};
  }
  const finalPart = parts[parts.length - 1]!;
  const finalInner = finalPart.firstChild;
  if (!finalInner) return {};

  // Determine the form (dot vs colon) and extract the method name.
  // `LuauFunctionAccessor` covers BOTH `.name(` and `:name(` shapes
  // (the grammar tags accessors as LuauFunctionAccessor whenever a
  // call-start follows the name) — so dispatch on the actual operator
  // text, not the node name.
  let methodName: string | null = null;
  let isColonForm = false;
  if (finalInner.name === "LuauPropertyAccessor") {
    const nameNode =
      getDescendent("LuauPropertyName", finalInner) ??
      getDescendent("LuauStdLibMethods", finalInner);
    if (nameNode) methodName = ctx.read(nameNode.from, nameNode.to);
  } else if (finalInner.name === "LuauFunctionAccessor") {
    const opNode = getDescendent("LuauAccessorOperator", finalInner);
    const opText = opNode ? ctx.read(opNode.from, opNode.to).trim() : ".";
    isColonForm = opText === ":";
    const nameNode = getDescendent("LuauFunctionName", finalInner);
    if (nameNode) methodName = ctx.read(nameNode.from, nameNode.to);
  }
  if (!methodName) return {};

  // Build the base expression. For multi-level paths like
  // `a.b.c.f`, the base is `a.b.c` — an IndexExpression chain.
  // Simple single-variable case: just `VariableReference([a])`.
  const baseParts = parts.slice(0, -1);
  const baseExpr = lowerBaseExpression(baseParts, ctx);
  if (!baseExpr) return {};

  // Build the function as an anonymous synthetic knot. Push it on
  // the enclosing scope's buffer (or hoistedKnots at the chunk top).
  // For the colon form, prepend `self` as an implicit first parameter
  // so the body's `self` references resolve as a parameter read.
  const synthName = `__anon_fn_${node.from}`;
  const userArgs = lowerArguments(node, ctx);

  // Upvalue capture — `function Class.new()` bodies routinely
  // reference outer locals (`setmetatable(self, Class)` captures
  // `Class` itself, the canonical Lua OOP pattern at basic.luau
  // lines 419-438). Scan free variables and prepend them as
  // parameters, exactly like lowerNestedNamedFunction; the stored
  // value below becomes a closure-shaped ObjectValue instead of the
  // old bare DivertTarget (which never captured, so `Class` read as
  // nil inside the body). The colon form's implicit `self` is a
  // PARAMETER, not a free variable — exclude it from capture.
  const upvals = scanFreeVariables(node, ctx).filter(
    (n) => !(isColonForm && n === "self"),
  );
  const upvalArgs = upvals.map(
    (n) => new Argument(new Identifier(n), false, false),
  );
  const finalArgs: Argument[] = isColonForm
    ? [
        ...upvalArgs,
        new Argument(new Identifier("self"), false, false),
        ...userArgs,
      ]
    : [...upvalArgs, ...userArgs];

  const content = getFunctionBodyContent(node);
  if (!content) return {};

  const nested: ParsedObject[] = [];
  ctx.functionScopeStack?.push(nested);
  const ownLocals = collectImmediateBodyDeclarations(node, ctx);
  ctx.declaredLocalsStack?.push(ownLocals);
  const innerHoisted: ParsedObject[] = [];
  ctx.hoistedNestedFnDeclsStack?.push(innerHoisted);
  const innerSiblingSubFlows = new Map<string, string[]>();
  ctx.siblingSubFlowNamesStack?.push(innerSiblingSubFlows);
  const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);
  ctx.siblingSubFlowNamesStack?.pop();
  ctx.hoistedNestedFnDeclsStack?.pop();
  ctx.declaredLocalsStack?.pop();
  ctx.functionScopeStack?.pop();

  const fn = new Function(
    new Identifier(synthName),
    [...innerHoisted, ...body, ...nested],
    finalArgs,
  );

  const stack = ctx.functionScopeStack;
  const enclosingScope =
    stack && stack.length > 0 ? stack[stack.length - 1] : null;
  if (enclosingScope) {
    enclosingScope.push(fn);
  } else if (ctx.hoistedKnots) {
    ctx.hoistedKnots.push(fn);
  } else {
    return {};
  }

  // Closure-shaped value (always — even with zero upvals the
  // `__closure_user_arity` field lets the call site pad missing
  // args with nil; see lowerNestedNamedFunction's identical choice).
  // User arity counts the implicit `self` for colon-form methods:
  // the method-call dispatch passes the receiver as the first user
  // arg.
  const userArity = (isColonForm ? 1 : 0) + userArgs.length;
  const closureValue = buildClosureExpression(synthName, upvals, userArity);
  const keyExpr = new StringExpression([new Text(methodName)]);
  const store = new StorePropertyAssignment(baseExpr, keyExpr, closureValue);
  return wrapInWeave([store]);
}

// Walk a `LuauAccessPath` into its top-level `LuauAccessPart` segments.
function collectAccessParts(accessPath: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const content = findChildByName(accessPath, "LuauAccessPath_content");
  const root = content ?? accessPath;
  let inner = root.firstChild;
  while (inner) {
    if (inner.name === "LuauAccessPart") out.push(inner);
    inner = inner.nextSibling;
  }
  return out;
}

// Build a value-chain expression for the base portion of a
// property-target function definition's name. Mirrors a subset of
// `lowerBaseFromParts` in `lowerPropertyTargetAssignment.ts` — kept
// inline to avoid a circular import.
function lowerBaseExpression(
  parts: SyntaxNode[],
  ctx: LowerContext,
): Expression | null {
  if (parts.length === 0) return null;
  // First part must be a LuauVariable. Build a VariableReference.
  const firstInner = parts[0]!.firstChild;
  if (firstInner?.name !== "LuauVariable") return null;
  const nameNode =
    getDescendent("LuauStdLibConstants", firstInner) ??
    getDescendent("LuauVariableName", firstInner);
  if (!nameNode) return null;
  let current: Expression = new VariableReference([
    new Identifier(ctx.read(nameNode.from, nameNode.to)),
  ]);
  // Subsequent parts must be LuauPropertyAccessor — fold into
  // IndexExpression chain.
  for (let i = 1; i < parts.length; i++) {
    const inner = parts[i]!.firstChild;
    if (inner?.name !== "LuauPropertyAccessor") return null;
    const propNameNode =
      getDescendent("LuauPropertyName", inner) ??
      getDescendent("LuauStdLibMethods", inner);
    if (!propNameNode) return null;
    current = new IndexExpression(
      current,
      new StringExpression([new Text(ctx.read(propNameNode.from, propNameNode.to))]),
    );
  }
  return current;
}

function findChildByName(parent: SyntaxNode, name: string): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

