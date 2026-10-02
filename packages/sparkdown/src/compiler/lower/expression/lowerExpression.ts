// Luau expressions lowered to ink's `Expression` hierarchy.
//
// An expression is read by the converter in `typecheck/readLuauAst.ts`,
// which reads the syntax tree's tokens and decides what the tree leaves
// flat (operator precedence and associativity, call and method chains, call
// sugar) as Luau's parser decides it, building the `AstExpr` classes of
// `typecheck/Ast.ts`. This module lowers that AST. What it decides is the
// runtime's: how a name, a call or a method reaches its target (a local
// value, a variadic sibling function, a knot, a stdlib builtin), how many
// values a call gives where one is taken, and how a literal's text becomes a
// runtime value.
//
// Sparkdown's lowerers hold syntax nodes: `lowerExpressionFromContainer`
// and `lowerExpressionFromNodes` read the expression those nodes hold and
// lower it. The Luau statement lowerers hold the statement's AST and lower
// its expressions with `lowerExpression`.

import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { CallValueExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/CallValueExpression";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { IndexExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/IndexExpression";
import { NullExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NullExpression";
import { NumberExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import { SingleValueExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/SingleValueExpression";
import {
  StashAndRereadExpression,
  StashedTempReadExpression,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StashAndRereadExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import {
  TernaryExpression,
  type TernaryBranch,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/TernaryExpression";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { DivertTarget } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/DivertTarget";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { ErrorType } from "../../../inkjs/engine/Error";
import {
  isBuiltinMethod,
  lookupStdLibConstant,
  METHOD_PREFIX,
} from "../../../inkjs/engine/StdLib";
import {
  AstExpr,
  AstExprBinary,
  AstExprCall,
  AstExprConstantBool,
  AstExprConstantNil,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprError,
  AstExprFunction,
  AstExprGlobal,
  AstExprGroup,
  AstExprIfElse,
  AstExprIndexExpr,
  AstExprIndexName,
  AstExprInstantiate,
  AstExprInterpString,
  AstExprLocal,
  AstExprSparkdownCallShorthand,
  AstExprSparkdownDivertTarget,
  AstExprSparkdownInterpString,
  AstExprSparkdownNew,
  AstExprSparkdownRegex,
  AstExprTable,
  AstExprTypeAssertion,
  AstExprUnary,
  AstExprVarargs,
  QuoteStyle,
  binaryOpToString,
  unaryOpToString,
} from "../../typecheck/Ast";
import type { Location } from "../../typecheck/Location";
import GRAMMAR_DEFINITION from "../../../../language/sparkdown.language-grammar.json";
import { type SparkdownNodeName } from "../../types/SparkdownNodeName";
import { nodeNameSet } from "../../utils/nodeNameSet";
import type { LowerContext } from "../context";
import { buildDebugMetadata, stampDebugMetadata } from "../utils/debugMetadata";
import { syntheticId } from "../utils/documentTag";
import { VARARGS_LOCAL_NAME } from "../utils/lowerArguments";
import { lowerDivertPath } from "../utils/lowerDivertPath";
import {
  enclosingNode,
  errorMessage,
  offsetAt,
  rangeOf,
  readExpressionAst,
  type LuauSource,
} from "../utils/luauAst";
import { reportValueInVain } from "../utils/lineContinuation";
import { mapStdLibCallToBuiltin } from "../utils/stdlibMapping";
import { validateStdLibDeprecation } from "../utils/validateStdLibDeprecation";
import {
  makeGlobalFunctionCall,
  recordSiblingRead,
  resolveCallableBinding,
  siblingSubFlowInfo,
  withSiblingSubFlowUpvalArgs,
} from "./bindings";
import { buildClosureExpression, lowerFunctionExpression } from "./lowerFunction";
import { lowerTable } from "./lowerTable";

// ============================================================================
// Reading an expression from syntax nodes
// ============================================================================

// `{{fn}}` / `{{fn(args)}}` function-call shorthand containers (issue #223).
// One per string-bounding context (see the grammar); all three carry the SAME
// semantics: the body must be a function call, and a bare name is coerced to
// a nullary call. Consumers that scan for interpolation nodes treat these as
// interpolations; the coercion lives in `lowerExpressionFromContainer` so
// every context (display text, content strings, prop values, Luau strings,
// Sparkle bindings) picks it up through the one funnel they already call.
const FUNCTION_CALL_SHORTHAND_NODE_LIST: SparkdownNodeName[] = [
  "LuauFunctionCallShorthand",
  "LuauDoubleQuotedFunctionCallShorthand",
  "LuauBacktickFunctionCallShorthand",
];
export const FUNCTION_CALL_SHORTHAND_NODES = nodeNameSet(
  FUNCTION_CALL_SHORTHAND_NODE_LIST,
);

// The nodes a rule puts around its content (`{` and `}` of an
// interpolation), and the operator before a value, which are no part of the
// value a container holds.
const RULE_DELIMITER = /_(begin|end)(_c\d+)*$/;
const NOT_VALUE = nodeNameSet(["LuauAssignmentOperator"]);

/** The nodes that hold the value of a container node: its content's children, without its delimiters or an assignment's operator. */
export function containerValueNodes(parent: SyntaxNode): SyntaxNode[] {
  let content: SyntaxNode | null = null;
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.name === `${parent.name}_content`) content = child;
  }
  const nodes: SyntaxNode[] = [];
  for (let child = (content ?? parent).firstChild; child; child = child.nextSibling) {
    if (!RULE_DELIMITER.test(child.name) && !NOT_VALUE.has(child.name)) {
      nodes.push(child);
    }
  }
  return nodes;
}

/**
 * Lowers the value a container node holds (an interpolation, a condition,
 * the operation after `=`): the expression its content reads as.
 */
export function lowerExpressionFromContainer(
  parent: SyntaxNode,
  ctx: LowerContext,
): Expression | null {
  const expr = lowerExpressionFromNodes(containerValueNodes(parent), ctx);
  if (FUNCTION_CALL_SHORTHAND_NODES.has(parent.name)) {
    return coerceFunctionCallShorthand(expr, parent, ctx);
  }
  return expr;
}

/** Lowers the one expression some sibling nodes hold. */
export function lowerExpressionFromNodes(
  nodes: readonly SyntaxNode[],
  ctx: LowerContext,
): Expression | null {
  const reading = readExpressionAst(nodes, ctx);
  return reading ? lowerExpression(reading.expr, reading.source, ctx) : null;
}

// ============================================================================
// Lowering the AST
// ============================================================================

/**
 * Lowers an expression of the converter's AST; `source` is what it was
 * read from. Returns null for an expression with nothing to lower (a syntax
 * error, which the type checker reports, or a construct that has no value
 * here).
 */
export function lowerExpression(
  expr: AstExpr,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  if (expr instanceof AstExprGlobal || expr instanceof AstExprLocal) {
    return lowerNamePath(pathNames(expr)!, expr.location, ctx);
  }
  if (expr instanceof AstExprIndexName) {
    // A `.` with no name after it (`t.a.` before the line's end) is the
    // converter's error, reported by the type checker; the value is the
    // path before the `.`.
    if (expr.index === MISSING_NAME) return lowerExpression(expr.expr, source, ctx);
    const names = pathNames(expr);
    if (names) return lowerNamePath(names, expr.location, ctx);
    const base = lowerChainBase(expr.expr, source, ctx);
    return base
      ? new IndexExpression(base, new StringExpression([new Text(expr.index)]))
      : null;
  }
  if (expr instanceof AstExprIndexExpr) {
    const base = lowerChainBase(expr.expr, source, ctx);
    const key = lowerExpression(expr.index, source, ctx);
    return base && key ? new IndexExpression(base, key) : null;
  }
  if (expr instanceof AstExprCall) return lowerCall(expr, source, ctx);
  if (expr instanceof AstExprGroup) {
    // Lua adjusts `(expr)` to exactly ONE value — a parenthesized
    // multi-return call truncates (`(ret2(f()))` is one value,
    // calls.luau line 210).
    reportValueInVain(expr.expr, source, ctx);
    const inner = lowerExpression(expr.expr, source, ctx);
    return inner ? asOneValue(inner) : null;
  }
  if (expr instanceof AstExprBinary) {
    const left = lowerExpression(expr.left, source, ctx);
    if (!left) return null;
    const right = lowerExpression(expr.right, source, ctx);
    return right
      ? new BinaryExpression(left, right, binaryOpToString(expr.op))
      : left;
  }
  if (expr instanceof AstExprUnary) {
    const operand = lowerExpression(expr.expr, source, ctx);
    return operand
      ? UnaryExpression.WithInner(operand, unaryOpToString(expr.op))
      : null;
  }
  if (expr instanceof AstExprConstantNumber) return lowerNumber(expr, ctx);
  if (expr instanceof AstExprConstantString) return lowerString(expr, ctx);
  if (expr instanceof AstExprConstantBool) {
    return new NumberExpression(expr.value, "bool");
  }
  if (expr instanceof AstExprConstantNil) {
    // First-class nil — emits a runtime `NullValue` with its own
    // `ValueType.Null`. Falsy in conditionals and equality-distinct
    // from `0` (`nil == 0` is false).
    return new NullExpression();
  }
  if (expr instanceof AstExprVarargs) {
    // `...` reads the synthetic varargs local bound at function entry,
    // which holds a `MultiValue`; receiving contexts spread or truncate
    // it (see `lowerArguments.ts`).
    return new VariableReference([new Identifier(VARARGS_LOCAL_NAME)]);
  }
  if (expr instanceof AstExprTable) return lowerTable(expr, source, ctx);
  if (expr instanceof AstExprFunction) {
    return lowerFunctionExpression(expr, source, ctx);
  }
  if (expr instanceof AstExprIfElse) return lowerIfElse(expr, source, ctx);
  if (
    expr instanceof AstExprInterpString ||
    expr instanceof AstExprSparkdownInterpString
  ) {
    return lowerInterpolatedString(expr, source, ctx);
  }
  // A cast and an explicit type instantiation give their value as it is.
  if (
    expr instanceof AstExprTypeAssertion ||
    expr instanceof AstExprInstantiate
  ) {
    return lowerExpression(expr.expr, source, ctx);
  }
  if (expr instanceof AstExprSparkdownDivertTarget) {
    return lowerDivertTargetLiteral(expr.source.node as SyntaxNode, ctx);
  }
  if (expr instanceof AstExprSparkdownRegex) {
    // `@/pattern/flags` lowers to the VERBATIM `/pattern/flags` string —
    // sigil dropped, delimiters kept — which is the value `Matcher` (which
    // splits `/source/flags`) reads. No escape processing: a regex is raw,
    // which is the whole point of having a literal (`\p{L}` instead of
    // `"\\p{L}"`, and `{2,}` without it reading as an interpolation).
    return new StringExpression([
      new Text(
        ctx.read(expr.source.from, expr.source.to).trim().replace(/^@/, ""),
      ),
    ]);
  }
  if (expr instanceof AstExprSparkdownNew) return lowerNew(expr, source, ctx);
  if (expr instanceof AstExprSparkdownCallShorthand) {
    const node = enclosingNode(
      source,
      offsetAt(expr.location.begin, ctx),
      FUNCTION_CALL_SHORTHAND_NODES,
    );
    return coerceFunctionCallShorthand(
      lowerExpression(expr.expr, source, ctx),
      node ?? rangeOf(expr.location, ctx),
      ctx,
    );
  }
  if (expr instanceof AstExprError) return lowerMalformedString(expr, source, ctx);
  // A syntax error, which the type checker reports, an alternator used as
  // a value, which the display lowerers lower themselves, and a branch's
  // argument, which only the type checker reads.
  return null;
}

// A string literal with an escape Luau's parser rejects. A `\u{...}` escape
// above U+10FFFF, which Luau encodes as extended UTF-8 and a JS string cannot
// hold, lowers to U+FFFD (DIVERGENCES.md); any other escape lowers as
// `processLuauEscapes` reads it. Any other syntax error lowers to nothing.
function lowerMalformedString(
  expr: AstExprError,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  if (
    expr.expressions.length > 0 ||
    errorMessage(expr, source) !== MALFORMED_STRING
  ) {
    return null;
  }
  const range = rangeOf(expr.location, ctx);
  const text = stripQuotes(ctx.read(range.from, range.to).trim());
  return new StringExpression([new Text(processLuauEscapes(text))]);
}

const MALFORMED_STRING = "String literal contains malformed escape sequence";

/**
 * `expr` adjusted to exactly one value where Luau takes one (a parenthesis,
 * an if expression's arm, a table's key and keyed value): a call or `...`
 * may give several values or none, and is wrapped in a
 * `SingleValueExpression`; literals, operators and the like are
 * single-valued by construction and pass through unwrapped (keeps `(42)`
 * structurally identical to `42`).
 */
export function asOneValue(expr: Expression): Expression {
  const maybeMultiValued =
    expr instanceof FunctionCall ||
    expr instanceof CallValueExpression ||
    expr instanceof TernaryExpression ||
    (expr instanceof VariableReference && expr.name === VARARGS_LOCAL_NAME);
  return maybeMultiValued ? new SingleValueExpression(expr) : expr;
}

// ============================================================================
// Names and paths
// ============================================================================

/** A name in a dotted path, and where it is written. */
export interface PathName {
  name: string;
  location: Location;
}

/**
 * The names of a dotted path, root first, when `expr` is one: a name,
 * followed by any number of `.name` fields (`a`, `a.b.c`). Null for any
 * other expression.
 */
// The name the converter gives a name it could not read, as Luau's parser
// does (`kParseNameError`).
const MISSING_NAME = "%error-id%";

export function pathNames(expr: AstExpr): PathName[] | null {
  const names: PathName[] = [];
  let current = expr;
  while (current instanceof AstExprIndexName && current.op === ".") {
    names.unshift({ name: current.index, location: current.indexLocation });
    current = current.expr;
  }
  if (current instanceof AstExprGlobal) {
    names.unshift({ name: current.name, location: current.location });
  } else if (current instanceof AstExprLocal) {
    names.unshift({ name: current.local.name, location: current.location });
  } else {
    return null;
  }
  return names;
}

/** An `Identifier` for a name, positioned where it is written, so a diagnostic about the name points at it. */
export function astIdentifier(
  name: PathName,
  ctx: LowerContext,
): Identifier {
  const identifier = new Identifier(name.name);
  const range = rangeOf(name.location, ctx);
  identifier.debugMetadata = buildDebugMetadata(range.from, range.to, ctx);
  return identifier;
}

// A dotted path (`a`, `a.b.c`) as a value. A path is one
// `VariableReference`, so ink's hierarchical name resolution (knot and
// stitch lookup, function parameters) keeps working; a variadic sibling
// function referenced by its name is a value of its own, and a path naming
// a stdlib constant (`math.pi`, `_VERSION`) is that constant.
function lowerNamePath(
  names: PathName[],
  location: Location,
  ctx: LowerContext,
): Expression {
  const identifiers = names.map((name) => astIdentifier(name, ctx));
  // Sibling variadic subflow referenced as a VALUE (`call(c12, ...)`,
  // `local h = c12`, `type(c12)`): variadic nested fns stay
  // knot-form subflows of the enclosing function (see
  // lowerLuauFunctionDefinition) — there's no local variable
  // holding a closure, so a VariableReference would read nil and
  // the runtime Knot fallback only checks TOP-LEVEL knots. No
  // captures → a bare DivertTarget (the runtime value-call path
  // packs `...` args for those). With captures → a closure-shaped
  // value whose upval pointers snapshot the enclosing frame's
  // cells at REFERENCE time, exactly like anonymous closures —
  // `extractClosurePath` re-threads them below the user args at
  // call time (vararg.luau line 74: `call(f, a)` where f captures
  // `lim`).
  if (
    identifiers.length === 1 &&
    resolveCallableBinding(identifiers[0]!.name, ctx) === "sibling"
  ) {
    const info = siblingSubFlowInfo(identifiers[0]!.name, ctx);
    const knotName = info?.knotName ?? identifiers[0]!.name;
    if (info) {
      // The subflow's definition decides the pointers the value holds and
      // the arity it records.
      recordSiblingRead(
        ctx,
        `value:${identifiers[0]!.name}=${info.upvals.join(",")}/${info.arity}`,
      );
    }
    if (info && info.upvals.length > 0) {
      return buildClosureExpression(knotName, info.upvals, info.arity);
    }
    return new DivertTarget(new Divert([new Identifier(knotName)]), true);
  }
  // Stdlib constant short-circuit: when the dotted path matches a
  // registered constant (`math.pi`, `math.huge`, `_VERSION`, ...),
  // emit the value directly instead of a `VariableReference` that
  // would fail to resolve at runtime.
  const dotted = identifiers.map((id) => id.name).join(".");
  const constVal = lookupStdLibConstant(dotted);
  if (constVal !== undefined) {
    if (typeof constVal === "number") {
      return new NumberExpression(
        constVal,
        Number.isInteger(constVal) && Number.isFinite(constVal) ? "int" : "float",
      );
    }
    if (typeof constVal === "string") {
      return new StringExpression([new Text(constVal)]);
    }
    if (typeof constVal === "boolean") {
      return new NumberExpression(constVal, "bool");
    }
  }
  const ref = new VariableReference(identifiers);
  // In a Sparkle binding, stamp the reference with its own token span, which
  // its hoisted binding function has no statement to inherit from (see
  // LowerContext.stampExpressionSpans).
  if (ctx.stampExpressionSpans) {
    const span = rangeOf(location, ctx);
    stampDebugMetadata([ref], span.from, span.to, ctx);
  }
  return ref;
}

/**
 * The value an index or field is read from (`t` in `t[k]`, `f()` in
 * `f().x`). A dotted path there is the variable it names, without the
 * substitutions a path read as a value takes: `_G['foo']` indexes the
 * globals-table proxy.
 */
export function lowerChainBase(
  expr: AstExpr,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  const names = pathNames(expr);
  if (names) {
    return new VariableReference(names.map((name) => astIdentifier(name, ctx)));
  }
  return lowerExpression(expr, source, ctx);
}

// ============================================================================
// Calls
// ============================================================================

/** The values a call passes, each lowered; one that lowers to nothing is left out. */
export function lowerCallArguments(
  args: readonly AstExpr[],
  source: LuauSource,
  ctx: LowerContext,
): Expression[] {
  const out: Expression[] = [];
  for (const arg of args) {
    const lowered = lowerExpression(arg, source, ctx);
    if (lowered) out.push(lowered);
  }
  return out;
}

// A call's arguments, lowered, with a continuation line where an argument
// should begin reported (`tostring(` then `.a)`).
function callArguments(
  args: readonly AstExpr[],
  source: LuauSource,
  ctx: LowerContext,
): Expression[] {
  for (const arg of args) reportValueInVain(arg, source, ctx);
  return lowerCallArguments(args, source, ctx);
}

function lowerCall(
  call: AstExprCall,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  const func = call.func;
  // `obj:m(args)` and `obj.m(args)`: a method of the value, or a stdlib
  // builtin when `obj` names a stdlib library.
  if (func instanceof AstExprIndexName) {
    return lowerMethodCall(call, func, source, ctx);
  }
  const args = callArguments(call.args, source, ctx);
  const name =
    func instanceof AstExprGlobal
      ? func.name
      : func instanceof AstExprLocal
        ? func.local.name
        : null;
  if (name === null) {
    // A call of any other value: `(f)(x)`, `f(a)(b)`, `t[k](x)`, the
    // IIFE shape `(function() ... end)(args)`.
    const callee = lowerExpression(func, source, ctx);
    return callee ? new CallValueExpression(callee, args) : null;
  }
  // A name that is a local of an enclosing function (not a stdlib name, a
  // knot or a variadic sibling function) holds a value: the call
  // dispatches through it, which handles closures, `__call` metamethods
  // and `__stdlib_fn` markers. A static `FunctionCall` would divert to a
  // knot of the name, which does not exist.
  if (resolveCallableBinding(name, ctx) === "local") {
    return new CallValueExpression(
      new VariableReference([new Identifier(name)]),
      args,
    );
  }
  // Sibling subflows dispatch against their CONTAINER name — mangled when
  // the source name was redefined (see SiblingSubFlowInfo.knotName).
  const callName = siblingSubFlowInfo(name, ctx)?.knotName ?? name;
  return makeGlobalFunctionCall(
    new Identifier(callName),
    withSiblingSubFlowUpvalArgs(name, args, ctx),
    rangeOf(call.location, ctx),
    ctx,
  );
}

// The libraries the grammar reads as stdlib namespaces
// (`LUAU_STANDARD_LIB_CONSTANTS`), whose fields a dot call reaches by path.
const STDLIB_NAMESPACES: ReadonlySet<string> = new Set(
  GRAMMAR_DEFINITION.variables.LUAU_STANDARD_LIB_CONSTANTS as string[],
);

// `obj:method(args)` and `obj.method(args)`. A colon call passes the
// receiver as the first argument, evaluated once; a dot call does not.
function lowerMethodCall(
  call: AstExprCall,
  func: AstExprIndexName,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  const methodName = func.index;
  const isColonForm = func.op === ":";
  const args = callArguments(call.args, source, ctx);

  // Luau stdlib mapping: when the receiver is a single name (`math`,
  // `string`, `story`, ...) AND the `<receiver>.<method>` pair maps to a
  // runtime builtin (e.g. `math.floor` → `FLOOR`), emit a direct builtin
  // call with the args alone — no receiver-threading.
  const receiverNames = pathNames(func.expr);
  let stdlibMember: Identifier | null = null;
  if (receiverNames?.length === 1) {
    const receiverName = receiverNames[0]!.name;
    const builtin = mapStdLibCallToBuiltin(receiverName, methodName, args.length);
    if (builtin) {
      // Editor-side strikethrough for deprecated stdlib calls (e.g.
      // `table.getn(t)`, `math.pow(a, b)`). Runtime still dispatches
      // normally; the diagnostic is purely a hint.
      validateStdLibDeprecation(builtin, rangeOf(func.location, ctx), ctx);
      const builtinCall = new FunctionCall(new Identifier(builtin), args);
      // `count.visited(-> t)` — boolean shorthand: wrap the READ_COUNT
      // call in `> 0` so authors get a genuine boolean ("has the reader
      // been here?") instead of a count.
      if (receiverName === "count" && methodName === "visited") {
        return new BinaryExpression(
          builtinCall,
          new NumberExpression(0, "int"),
          ">",
        );
      }
      return builtinCall;
    }
    const method = { name: methodName, location: func.indexLocation };
    if (STDLIB_NAMESPACES.has(receiverName)) {
      // `table.nogetn()`: a dot call on a stdlib library with no such
      // builtin. The callee is the dotted path itself, so an unresolved
      // path reports the member (`Cannot find item or path named
      // \`table.nogetn\``) rather than the library, which exists. A local
      // that shadows the library resolves the path at run time.
      if (!isColonForm) {
        return new CallValueExpression(
          new VariableReference([
            astIdentifier(receiverNames[0]!, ctx),
            astIdentifier(method, ctx),
          ]),
          args,
        );
      }
      // `table:nogetn()` lowers like any other colon call below, so a
      // local that shadows the library keeps builtin method dispatch and
      // its receiver is evaluated once. The receiver names the member, so
      // an unresolved library reports `table.nogetn` as the dot form does.
      stdlibMember = astIdentifier(method, ctx);
    }
  }

  const receiver = lowerExpression(func.expr, source, ctx);
  if (!receiver) return null;
  if (stdlibMember && receiver instanceof VariableReference) {
    receiver.unresolvedMember = stdlibMember;
  }

  // Builtin method dispatch (`s:upper()`, `t:find(x)`, `t:union(other)`,
  // ...). When the method name matches a registered builtin in
  // `METHOD_DISPATCH`, emit a FunctionCall to the synthetic
  // `__method_<name>` instead of the bare method name — the runtime
  // recognizes the prefix and routes to per-receiver-type dispatch in
  // `callBuiltinMethod`.
  if (isBuiltinMethod(methodName)) {
    return new FunctionCall(
      new Identifier(`${METHOD_PREFIX}${methodName}`),
      [receiver, ...args],
    );
  }

  // A user-defined method lives at `receiver.<name>` as a table key (a
  // closure or a divert target): the call evaluates the index and
  // dispatches through `CallValueAsFunction`.
  const key = new StringExpression([new Text(methodName)]);
  if (isColonForm) {
    // The colon form needs the receiver TWICE (method lookup + threaded
    // `self` arg) but Lua evaluates it exactly ONCE. Stash it in a temp
    // via the first generated arg (CallValueExpression generates args
    // before the target), and read the temp for the index lookup —
    // `a:add(10):add(20)` must not run `add(10)` twice (calls.luau line
    // 47). The temp is named after the call's `:`, which no other call
    // shares.
    const tempName = `__mcall_${syntheticId(offsetAt(func.opPosition, ctx), ctx)}`;
    return new CallValueExpression(
      new IndexExpression(new StashedTempReadExpression(tempName), key),
      [new StashAndRereadExpression(receiver, tempName), ...args],
    );
  }
  return new CallValueExpression(new IndexExpression(receiver, key), args);
}

// `new ClassName(args)` — instance construction for `define`-declared
// classes. Lowers to the hidden stdlib constructor `__new(ClassTable,
// ...args)` (see StdLib.ts), which builds a fresh table whose metatable
// `__index`es the class, copies `store`-marked defaults, and forwards args
// to an `init` method when the class defines one.
function lowerNew(
  expr: AstExprSparkdownNew,
  source: LuauSource,
  ctx: LowerContext,
): Expression {
  return new FunctionCall(new Identifier("__new"), [
    new VariableReference([new Identifier(expr.className)]),
    ...callArguments(expr.args, source, ctx),
  ]);
}

// Apply the `{{...}}` shorthand semantics to the lowered body expression:
//   - `{{fn(a, b)}}` — already a call; pass it through unchanged (identical
//     to `{fn(a, b)}`).
//   - `{{fn}}` — the shorthand's whole point: a bare name becomes a nullary
//     call, dispatched exactly like a written-out `fn()` (local binding →
//     value call; global/knot/stdlib → FunctionCall).
//   - `{{obj.fn}}` — a dotted path calls the referenced VALUE (`math.random`
//     works without being a registered global).
//   - anything else (`{{1 + 2}}`, bare `{{}}`) — the classic "expected a
//     function name" error the old InkParser raised for a bare `{{`.
// `range` is the shorthand's, braces included.
function coerceFunctionCallShorthand(
  expr: Expression | null,
  range: { from: number; to: number },
  ctx: LowerContext,
): Expression | null {
  if (expr instanceof FunctionCall || expr instanceof CallValueExpression) {
    return expr;
  }
  if (expr instanceof VariableReference) {
    const path = expr.pathIdentifiers;
    if (path.length === 1 && path[0]?.name) {
      const nameStr = path[0].name;
      if (resolveCallableBinding(nameStr, ctx) === "local") {
        return new CallValueExpression(
          new VariableReference([new Identifier(nameStr)]),
          [],
        );
      }
      const callName = siblingSubFlowInfo(nameStr, ctx)?.knotName ?? nameStr;
      return makeGlobalFunctionCall(
        new Identifier(callName),
        withSiblingSubFlowUpvalArgs(nameStr, [], ctx),
        range,
        ctx,
      );
    }
    return new CallValueExpression(expr, []);
  }
  if (ctx.diagnostics) {
    ctx.diagnostics.push({
      message:
        "Expected a function name — `{{...}}` is the function-call shorthand (`{{fn}}` or `{{fn(args)}}`). For a literal brace, write `\\{`",
      severity: ErrorType.Error,
      source: {
        fileName: null,
        filePath: ctx.filePath ?? null,
        startLineNumber: ctx.lineNumber(range.from) + 1,
        endLineNumber: ctx.lineNumber(range.to) + 1,
        startCharacterNumber: ctx.characterNumber(range.from) + 1,
        endCharacterNumber: ctx.characterNumber(range.to) + 1,
      },
    });
  }
  return null;
}

// ============================================================================
// If expressions
// ============================================================================

// Luau's `if cond then a elseif cond2 then b else c` EXPRESSION lowers to
// a `TernaryExpression`, one branch per arm, whose jump layout evaluates
// only the arm it takes. An `elseif` arm is a branch of the same
// expression; an `else` arm that is itself an if expression (`else if`) is
// a value of its own. Each arm's value is one value, whatever it is (`if c
// then f() else 0` is f()'s first value). The clause-less interpolation
// `{if x}` shows the value of `x`.
function lowerIfElse(
  expr: AstExprIfElse,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  if (!expr.hasThen) return lowerExpression(expr.condition, source, ctx);
  const branches: TernaryBranch[] = [];
  for (let arm: AstExprIfElse = expr; ; ) {
    const condition = lowerExpression(arm.condition, source, ctx);
    if (!condition) return null;
    const value = lowerExpression(arm.trueExpr, source, ctx);
    if (!value) return null;
    branches.push({ condition, value: asOneValue(value) });
    if (!arm.hasElse) break;
    const next = arm.falseExpr;
    if (next instanceof AstExprIfElse && isElseifArm(next, ctx)) {
      arm = next;
      continue;
    }
    const otherwise = lowerExpression(next, source, ctx);
    if (!otherwise) return null;
    branches.push({ condition: null, value: asOneValue(otherwise) });
    break;
  }
  return new TernaryExpression(branches);
}

// Whether an if expression is an `elseif` arm of the one before it, which
// begins at its `elseif`, rather than an `else` arm's value (`else if`).
function isElseifArm(expr: AstExprIfElse, ctx: LowerContext): boolean {
  const from = offsetAt(expr.location.begin, ctx);
  return ctx.read(from, from + 6) === "elseif";
}

// ============================================================================
// Literals
// ============================================================================

// A number's value and kind, from its text as written: hexadecimal and
// binary numbers are integers, and a decimal one is a float when it has a
// fraction or an exponent. Underscores separate digits.
function lowerNumber(
  expr: AstExprConstantNumber,
  ctx: LowerContext,
): Expression {
  const range = rangeOf(expr.location, ctx);
  const text = ctx.read(range.from, range.to).replaceAll("_", "");
  const prefix = text.slice(0, 2).toLowerCase();
  if (prefix === "0x") return new NumberExpression(Number(text), "int");
  if (prefix === "0b") {
    const digits = text.slice(2);
    const binary =
      digits.length > 0 && [...digits].every((d) => d === "0" || d === "1");
    return new NumberExpression(
      binary ? parseInt(digits, 2) : Number(text),
      "int",
    );
  }
  const isFloat =
    text.includes(".") || text.includes("e") || text.includes("E");
  return new NumberExpression(Number(text), isFloat ? "float" : "int");
}

// A string literal's value: a quoted string's text with its escapes
// read, a long string's (`[[...]]`) as written, with its line endings
// normalized to "\n" and a line break directly after the opening bracket
// dropped (`[[\nfoo]]` is "foo").
function lowerString(
  expr: AstExprConstantString,
  ctx: LowerContext,
): Expression {
  const range = rangeOf(expr.location, ctx);
  const text = stripQuotes(ctx.read(range.from, range.to).trim());
  let value: string;
  if (expr.quoteStyle === QuoteStyle.QuotedRaw) {
    value = text.replace(/\r\n|\r/g, "\n");
    if (value.startsWith("\n")) value = value.slice(1);
  } else {
    value = processLuauEscapes(text);
  }
  return new StringExpression([new Text(value)]);
}

// Convert Luau string-literal escape sequences to their character
// values. Mirrors Luau's lexer: standard one-letter escapes
// (`\a \b \f \n \r \t \v`), quote escapes (`\' \"`), backslash
// (`\\`), brace (`\{`), and `\z` (skip following whitespace),
// plus numeric (`\ddd`), hex (`\xHH`), and Unicode (`\u{HHHH}`)
// forms. Unknown escapes pass the following character through.
export function processLuauEscapes(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c !== "\\") {
      out += c;
      i++;
      continue;
    }
    if (i + 1 >= s.length) {
      out += "\\";
      break;
    }
    const next = s[i + 1]!;
    switch (next) {
      case "a":
        out += "\x07";
        i += 2;
        break;
      case "b":
        out += "\b";
        i += 2;
        break;
      case "f":
        out += "\f";
        i += 2;
        break;
      case "n":
        out += "\n";
        i += 2;
        break;
      case "r":
        out += "\r";
        i += 2;
        break;
      case "t":
        out += "\t";
        i += 2;
        break;
      case "v":
        out += "\v";
        i += 2;
        break;
      case "'":
      case '"':
      case "\\":
      case "{":
        out += next;
        i += 2;
        break;
      case "z": {
        i += 2;
        while (i < s.length && /\s/.test(s[i]!)) i++;
        break;
      }
      case "x": {
        const hex = s.slice(i + 2, i + 4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          out += next;
          i += 2;
        }
        break;
      }
      case "u": {
        const m = s.slice(i + 2).match(/^\{([0-9a-fA-F]+)\}/);
        if (m) {
          // Luau encodes up to `\u{7FFFFFFF}` as extended UTF-8; a JS string
          // cannot hold anything above U+10FFFF, so those become U+FFFD.
          // The validator already reports anything above Luau's own limit.
          const code = parseInt(m[1]!, 16);
          out += code > 0x10ffff ? "�" : String.fromCodePoint(code);
          i += 2 + m[0]!.length;
        } else {
          out += next;
          i += 2;
        }
        break;
      }
      case "\n":
        out += "\n";
        i += 2;
        break;
      default: {
        if (/\d/.test(next)) {
          // Decimal escape: 1–3 digits.
          const m = s.slice(i + 1).match(/^\d{1,3}/);
          if (m) {
            const code = parseInt(m[0]!, 10);
            if (code <= 255) {
              out += String.fromCharCode(code);
              i += 1 + m[0]!.length;
              break;
            }
          }
        }
        out += next;
        i += 2;
      }
    }
  }
  return out;
}

// A quoted literal's text between its delimiters.
export function stripQuotes(text: string): string {
  if (text.length < 2) return text;
  const first = text[0];
  const last = text[text.length - 1];
  if (
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === "`" && last === "`")
  ) {
    return text.slice(1, -1);
  }
  if (first === "[") {
    const m = text.match(/^\[(=*)\[([\s\S]*?)\]\1\]$/);
    if (m) return m[2]!;
  }
  return text;
}

// `"..."` uses its own interpolation rule (bounded by the closing quote), so
// both node names count as an interpolation. The `{{fn}}` call-shorthand
// containers interpolate their call's return value the same way.
const INTERPOLATION_NODES = nodeNameSet([
  "LuauInterpolatedStringExpression",
  "LuauDoubleQuotedStringInterpolation",
  "LuauBacktickStringInterpolation",
  ...FUNCTION_CALL_SHORTHAND_NODE_LIST,
]);

const INTERPOLATING_STRINGS = nodeNameSet([
  "LuauInterpolatedString",
  "LuauDoubleQuotedString",
]);

// A string that interpolates (a backtick string, or a double-quoted one
// with an interpolation in it): its text between the interpolations, with
// its escapes read, and each interpolated value, the expressions of the
// AST in order. The runtime's BeginString..EndString frame emitted by
// StringExpression concatenates them; each value is written as one value
// (a call's first, or nil for a call that returns none).
function lowerInterpolatedString(
  expr: AstExprInterpString | AstExprSparkdownInterpString,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  const node = enclosingNode(
    source,
    offsetAt(expr.location.begin, ctx),
    INTERPOLATING_STRINGS,
  );
  if (!node) return null;
  let content: SyntaxNode | null = null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === `${node.name}_content`) content = child;
  }
  if (!content) return new StringExpression([new Text("")]);
  const parts: ParsedObject[] = [];
  let textBuf = "";
  const flush = () => {
    if (textBuf.length > 0) {
      parts.push(new Text(processLuauEscapes(textBuf)));
      textBuf = "";
    }
  };
  let next = 0;
  for (let child = content.firstChild; child; child = child.nextSibling) {
    if (!INTERPOLATION_NODES.has(child.name)) {
      textBuf += ctx.read(child.from, child.to);
      continue;
    }
    flush();
    const interpolated = expr.expressions[next++];
    const lowered = interpolated
      ? lowerExpression(interpolated, source, ctx)
      : null;
    if (lowered) {
      const value = asOneValue(lowered);
      value.outputWhenComplete = true;
      parts.push(value);
    }
  }
  flush();
  if (parts.length === 0) parts.push(new Text(""));
  return new StringExpression(parts);
}

// `-> name(.path)*` as a value: a `DivertTarget` whose runtime
// `DivertTargetValue` can be stored, compared with `==`, or diverted to
// with `-> x`.
function lowerDivertTargetLiteral(
  node: SyntaxNode,
  ctx: LowerContext,
): Expression {
  const pathNode = getDescendent("DivertPath", node);
  const parts: Identifier[] = pathNode ? lowerDivertPath(pathNode, ctx) : [];
  return new DivertTarget(new Divert(parts));
}
