import { lineBreakValues } from "../utils/assignmentLineBreak";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import type { LuauSyntaxError } from "../../typecheck/readLuauAst";
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
import { ErrorType } from "../../../runtime/Error";
import {
  isBuiltinMethod,
  lookupStdLibConstant,
  METHOD_PREFIX,
} from "../../../runtime/StdLib";
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
  AstExprSparkdownConditionalAlternator,
  AstExprSparkdownDivertTarget,
  AstExprSparkdownInterpString,
  AstExprSparkdownNew,
  AstExprSparkdownRegex,
  AstExprSparkdownSequentialAlternator,
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
import { lookupGlobalStdLibBuiltin } from "../../../runtime/StdLib";
import { mapStdLibCallToBuiltin } from "../utils/stdlibMapping";
import { validateStdLibDeprecation } from "../utils/validateStdLibDeprecation";
import {
  localHidesStdLib,
  makeGlobalFunctionCall,
  resolveCallableBinding,
} from "./bindings";
import { lowerFunctionExpression, reportReadingErrors, type ReadingErrorScope } from "./lowerFunction";
import { lowerTable } from "./lowerTable";
import { lowerAlternatorValue, soleLocalAlternators } from "../utils/alternatorValue";
import { numberLiteralValue } from "../../utils/numberLiteralValue";
import {
  processLuauEscapes,
  stringLiteralValue,
  stripQuotes,
} from "../../utils/stringLiteralValue";

const FUNCTION_CALL_SHORTHAND_NODE_LIST: SparkdownNodeName[] = [
  "LuauFunctionCallShorthand",
  "LuauDoubleQuotedFunctionCallShorthand",
  "LuauBacktickFunctionCallShorthand",
];
export const FUNCTION_CALL_SHORTHAND_NODES = nodeNameSet(
  FUNCTION_CALL_SHORTHAND_NODE_LIST,
);

const RULE_DELIMITER = /_(begin|end)(_c\d+)*$/;
const NOT_VALUE = nodeNameSet(["LuauAssignmentOperator"]);

export function containerValueNodes(parent: SyntaxNode): SyntaxNode[] {
  let content: SyntaxNode | null = null;
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.name === `${parent.name}_content`) content = child;
  }
  const nodes: SyntaxNode[] = [];
  for (let child = (content ?? parent).firstChild; child; child = child.nextSibling) {
    if (child.name === "LuauAssignmentLineBreak") nodes.push(...lineBreakValues(child));
    else if (!RULE_DELIMITER.test(child.name) && !NOT_VALUE.has(child.name)) {
      nodes.push(child);
    }
  }
  return nodes;
}

export function closingTokenOf(parent: SyntaxNode): number | undefined {
  const close = parent.getChild(`${parent.name}_end`);
  return close && close.from < close.to ? close.from : undefined;
}

export function lowerExpressionFromContainer(
  parent: SyntaxNode,
  ctx: LowerContext,
  scope: ReadingErrorScope | null = "string",
): Expression | null {
  if (scope === "expression" && inlineIfOf(parent)) {
    reportInlineIfReading(parent, ctx);
    scope = null;
  }
  const end = scope === "expression" ? closingTokenOf(parent) : undefined;
  const expr = lowerExpressionFromNodes(containerValueNodes(parent), ctx, scope, end);
  if (FUNCTION_CALL_SHORTHAND_NODES.has(parent.name)) {
    return coerceFunctionCallShorthand(expr, parent, ctx);
  }
  return expr;
}

const IF_CLAUSE_TRIVIA = new Set(["ExtraWhitespace", "Whitespace", "OptionalWhitespace", "RequiredWhitespace", "Newline"]);

function directChild(parent: SyntaxNode, name: string): SyntaxNode | null {
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (isExplicitRuleName(child.name, name)) return child;
  }
  return null;
}

export function ifClauseValueNodes(clause: SyntaxNode): SyntaxNode[] {
  const body: SyntaxNode[] = [];
  const content = directChild(clause, `${clause.name}_content`) ?? clause;
  for (let child = content.firstChild; child; child = child.nextSibling) {
    if (child.name === "LuauThenNextLineArm") {
      body.push(...ifClauseValueNodes(child));
    } else if (
      !isExplicitRuleName(child.name, "LuauThenOperator") &&
      !isExplicitRuleName(child.name, "LuauElseOperator") &&
      !IF_CLAUSE_TRIVIA.has(child.name)
    ) {
      body.push(child);
    }
  }
  return body;
}

function inlineIfOf(brace: SyntaxNode): SyntaxNode | null {
  if (FUNCTION_CALL_SHORTHAND_NODES.has(brace.name)) return null;
  const content = directChild(brace, `${brace.name}_content`) ?? brace;
  const ifExpr = directChild(content, "LuauTernaryExpression");
  return ifExpr && getDescendent("LuauTernaryExpressionCondition_content", ifExpr) ? ifExpr : null;
}

export function reportInlineIfReading(brace: SyntaxNode, ctx: LowerContext): void {
  const ifExpr = inlineIfOf(brace);
  const nodes = containerValueNodes(brace);
  if (!ifExpr || nodes.length === 0) return;
  const end = closingTokenOf(brace);
  const reading = readExpressionAst(nodes, ctx, end);
  if (!reading) return;
  let errors = reading.source.errors;
  const ifContent = directChild(ifExpr, `${ifExpr.name}_content`) ?? ifExpr;
  let lastClause: SyntaxNode | null = null;
  let hasElse = false;
  for (let child = ifContent.firstChild; child; child = child.nextSibling) {
    if (isExplicitRuleName(child.name, "LuauThenExpression")) lastClause = child;
    else if (isExplicitRuleName(child.name, "LuauElseExpression")) hasElse = true;
    else if (child.name === "LuauElseifKeyword") lastClause = null;
  }
  const lastValue = lastClause ? ifClauseValueNodes(lastClause) : [];
  if (end !== undefined && !hasElse && lastValue.length > 0) {
    const atEnd = (error: LuauSyntaxError) => offsetAt(error.location.begin, ctx) === end;
    const own = readExpressionAst(lastValue, ctx, end)?.source.errors ?? [];
    errors = [...errors.filter((error) => !atEnd(error)), ...own.filter(atEnd)];
  }
  reportReadingErrors(errors, nodes[0]!, ctx, "expression");
}

export function lowerExpressionFromNodes(
  nodes: readonly SyntaxNode[],
  ctx: LowerContext,
  scope: ReadingErrorScope | null = "string",
  end?: number,
): Expression | null {
  const reading = readExpressionAst(nodes, ctx, end);
  if (reading && scope) reportReadingErrors(reading.source.errors, nodes[0]!, ctx, scope);
  return reading ? lowerExpression(reading.expr, reading.source, ctx) : null;
}

export function lowerExpression(
  expr: AstExpr,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  if (expr instanceof AstExprGlobal || expr instanceof AstExprLocal) {
    return lowerNamePath(pathNames(expr)!, expr.location, ctx);
  }
  if (expr instanceof AstExprIndexName) {
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
    return new NullExpression();
  }
  if (expr instanceof AstExprVarargs) {
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
  if (expr instanceof AstExprSparkdownSequentialAlternator || expr instanceof AstExprSparkdownConditionalAlternator) {
    const node = expr.source.node as SyntaxNode | undefined;
    return (node ? lowerAlternatorValue(node, ctx, false, soleLocalAlternators.has(expr)) : null) ?? new NullExpression();
  }
  return null;
}

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

export function asOneValue(expr: Expression): Expression {
  const maybeMultiValued =
    expr instanceof FunctionCall ||
    expr instanceof CallValueExpression ||
    expr instanceof TernaryExpression ||
    (expr instanceof VariableReference && expr.name === VARARGS_LOCAL_NAME);
  return maybeMultiValued ? new SingleValueExpression(expr) : expr;
}

export interface PathName {
  name: string;
  location: Location;
}

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

export function astIdentifier(
  name: PathName,
  ctx: LowerContext,
): Identifier {
  const identifier = new Identifier(name.name);
  const range = rangeOf(name.location, ctx);
  identifier.debugMetadata = buildDebugMetadata(range.from, range.to, ctx);
  return identifier;
}

function lowerNamePath(
  names: PathName[],
  location: Location,
  ctx: LowerContext,
): Expression {
  const identifiers = names.map((name) => astIdentifier(name, ctx));
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
  if (ctx.stampExpressionSpans) {
    const span = rangeOf(location, ctx);
    stampDebugMetadata([ref], span.from, span.to, ctx);
  }
  return ref;
}

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
    const callee = lowerExpression(func, source, ctx);
    return callee ? new CallValueExpression(callee, args) : null;
  }
  if (callsLocal(name, args.length, offsetAt(call.location.begin, ctx), ctx)) {
    return new CallValueExpression(
      new VariableReference([new Identifier(name)]),
      args,
    );
  }
  const functionCall = makeGlobalFunctionCall(
    new Identifier(name),
    args,
    rangeOf(call.location, ctx),
    ctx,
  );
  functionCall.proxyDivert.argumentsMalformed = call.malformed;
  return functionCall;
}

function callsLocal(
  name: string,
  argCount: number,
  at: number,
  ctx: LowerContext,
): boolean {
  if (resolveCallableBinding(name, ctx) === "local") return true;
  return (
    lookupGlobalStdLibBuiltin(name, argCount) !== null &&
    localHidesStdLib(name, ctx, at)
  );
}

const STDLIB_NAMESPACES: ReadonlySet<string> = new Set(
  GRAMMAR_DEFINITION.variables.LUAU_STANDARD_LIB_CONSTANTS as string[],
);

function lowerMethodCall(
  call: AstExprCall,
  func: AstExprIndexName,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  const methodName = func.index;
  const isColonForm = func.op === ":";
  const args = callArguments(call.args, source, ctx);

  const receiverNames = pathNames(func.expr);
  let stdlibMember: Identifier | null = null;
  const receiverName = receiverNames?.length === 1 ? receiverNames[0]!.name : null;
  if (
    receiverName !== null &&
    !isColonForm &&
    (mapStdLibCallToBuiltin(receiverName, methodName, args.length) ||
      STDLIB_NAMESPACES.has(receiverName)) &&
    localHidesStdLib(
      receiverName,
      ctx,
      offsetAt(receiverNames![0]!.location.begin, ctx),
    )
  ) {
    const receiver = lowerExpression(func.expr, source, ctx);
    return receiver
      ? new CallValueExpression(
          new IndexExpression(receiver, new StringExpression([new Text(methodName)])),
          args,
        )
      : null;
  }
  if (receiverName !== null) {
    const builtin = mapStdLibCallToBuiltin(receiverName, methodName, args.length);
    if (builtin) {
      validateStdLibDeprecation(builtin, rangeOf(func.location, ctx), ctx);
      const builtinCall = new FunctionCall(new Identifier(builtin), args);
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
      if (!isColonForm) {
        return new CallValueExpression(
          new VariableReference([
            astIdentifier(receiverNames![0]!, ctx),
            astIdentifier(method, ctx),
          ]),
          args,
        );
      }
      stdlibMember = astIdentifier(method, ctx);
    }
  }

  const receiver = lowerExpression(func.expr, source, ctx);
  if (!receiver) return null;
  if (stdlibMember && receiver instanceof VariableReference) {
    receiver.unresolvedMember = stdlibMember;
  }

  if (isBuiltinMethod(methodName)) {
    return new FunctionCall(
      new Identifier(`${METHOD_PREFIX}${methodName}`),
      [receiver, ...args],
    );
  }

  const key = new StringExpression([new Text(methodName)]);
  if (isColonForm) {
    const tempName = `__mcall_${syntheticId(offsetAt(func.opPosition, ctx), ctx)}`;
    return new CallValueExpression(
      new IndexExpression(new StashedTempReadExpression(tempName), key),
      [new StashAndRereadExpression(receiver, tempName), ...args],
      methodName,
    );
  }
  return new CallValueExpression(new IndexExpression(receiver, key), args);
}

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
      if (callsLocal(nameStr, 0, range.from, ctx)) {
        return new CallValueExpression(
          new VariableReference([new Identifier(nameStr)]),
          [],
        );
      }
      return makeGlobalFunctionCall(
        new Identifier(nameStr),
        [],
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

function lowerIfElse(
  expr: AstExprIfElse,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  if (!expr.hasThen) return lowerExpression(expr.condition, source, ctx);
  const branches: TernaryBranch[] = [];
  for (let arm: AstExprIfElse = expr; ; ) {
    if (!arm.hasThen) break;
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

function isElseifArm(expr: AstExprIfElse, ctx: LowerContext): boolean {
  const from = offsetAt(expr.location.begin, ctx);
  return ctx.read(from, from + 6) === "elseif";
}

function lowerNumber(
  expr: AstExprConstantNumber,
  ctx: LowerContext,
): Expression {
  const range = rangeOf(expr.location, ctx);
  const text = ctx.read(range.from, range.to).replaceAll("_", "");
  const prefix = text.slice(0, 2).toLowerCase();
  const value = numberLiteralValue(text);
  if (prefix === "0x" || prefix === "0b") {
    return new NumberExpression(value, "int");
  }
  const isFloat =
    text.includes(".") || text.includes("e") || text.includes("E");
  return new NumberExpression(value, isFloat ? "float" : "int");
}

function lowerString(
  expr: AstExprConstantString,
  ctx: LowerContext,
): Expression {
  const range = rangeOf(expr.location, ctx);
  const value = stringLiteralValue(
    ctx.read(range.from, range.to),
    expr.quoteStyle === QuoteStyle.QuotedRaw,
  );
  return new StringExpression([new Text(value)]);
}

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

function lowerDivertTargetLiteral(
  node: SyntaxNode,
  ctx: LowerContext,
): Expression {
  const pathNode = getDescendent(["DivertPath", "SparkdownExplicitDivertPath"], node);
  const parts: Identifier[] = pathNode ? lowerDivertPath(pathNode, ctx) : [];
  return new DivertTarget(new Divert(parts));
}
