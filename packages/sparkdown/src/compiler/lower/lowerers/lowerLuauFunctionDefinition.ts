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
    return lowerNestedNamedFunction(
      nodeRef.node,
      identifier,
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
  const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);
  ctx.functionScopeStack?.pop();

  const knot = new Knot(identifier, [], args, true);
  const rootWeave = new Weave(body);
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
    const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);
    ctx.functionScopeStack?.pop();
    enclosingScope.push(
      new Function(identifier, [...body, ...nested], args),
    );
    return {};
  }
  enclosingScope.push(fn);

  const userArity = countUserParameters(node, ctx);

  const closureValue =
    upvals.length === 0
      ? new DivertTarget(new Divert([new Identifier(synthName)]))
      : buildClosureExpression(synthName, upvals, userArity);

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
