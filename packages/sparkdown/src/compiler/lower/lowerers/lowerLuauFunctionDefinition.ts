import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerStatements } from "../lower";
import { getFunctionBodyContent } from "../utils/getFunctionBodyContent";
import { lowerArguments } from "../utils/lowerArguments";

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

  const args = lowerArguments(nodeRef.node, ctx);

  const content = getFunctionBodyContent(nodeRef.node);

  // Open a per-function buffer for any nested callables (anonymous
  // function literals, future nested named functions) that appear
  // inside the body. They get pushed here instead of `hoistedKnots`,
  // so they live as subFlows of this function rather than at the
  // chunk's top level.
  const nested: ParsedObject[] = [];
  ctx.functionScopeStack?.push(nested);
  const body = lowerStatements(content, ctx, FUNCTION_BODY_SKIP);
  ctx.functionScopeStack?.pop();

  // Detect whether this definition itself is lexically nested — i.e.
  // it lives inside another function's body. If so, emit a `Function`
  // and push it onto the enclosing scope's buffer; the enclosing
  // function's lowerer attaches it as a subFlow. Otherwise emit a
  // top-level `Knot` as before.
  const stack = ctx.functionScopeStack;
  const enclosingScope =
    stack && stack.length > 0 ? stack[stack.length - 1] : null;

  if (enclosingScope) {
    const nestedFn = new Function(identifier, [...body, ...nested], args);
    enclosingScope.push(nestedFn);
    // Statement-position: no value left behind at the call site.
    return {};
  }

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
