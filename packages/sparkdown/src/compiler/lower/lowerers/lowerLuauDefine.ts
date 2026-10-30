import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { luauStatementErrors, type LuauStatementError } from "../../utils/luauStatementError";
import {
  danglingDots,
  defineStatementLast,
  defineStatementThrough,
  isDefineMember,
  isDefineStatementStart,
  readsDefineProperty,
  readsDefineStatement,
} from "../../utils/defineStatement";
import { nextLuauToken } from "../../typecheck/readLuauAst";
import { checkerReadsOnTo } from "../../typecheck/LuauUnitNodes";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { NumberExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/NumberExpression";
import {
  ObjectExpression,
  ObjectExpressionEntry,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/ObjectExpression";
import { StringExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/StringExpression";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { StructDefinition } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Struct/StructDefinition";
import { StructPropertyDefinition } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Struct/StructPropertyDefinition";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import {
  DefineCellBinding,
  defineCellName,
} from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/DefineCellBinding";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import type { CompiledBlock, InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext, SiblingSubFlowInfo } from "../context";
import {
  AstExpr,
  AstExprBinary,
  AstExprCall,
  AstExprConstantBool,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprFunction,
  AstExprGroup,
  AstExprSparkdownInterpString,
  AstExprSparkdownRegex,
  AstExprTable,
  AstExprUnary,
  BinaryOp,
  QuoteStyle,
  UnaryOp,
} from "../../typecheck/Ast";
import { recordCaptureRead } from "../expression/bindings";
import {
  containerValueNodes,
  lowerExpression,
  pathNames,
} from "../expression/lowerExpression";
import {
  processLuauEscapes,
  stripQuotes,
} from "../../utils/stringLiteralValue";
import {
  buildClosureExpression,
  declaredLocalsFrame,
  freeVariables,
  readBodyAst,
  reportBodySyntaxErrors,
  reportReadingErrors,
} from "../expression/lowerFunction";
import { methodSyntaxErrors, rangeOf, readBlockAst, readExpressionAst, type LuauSource } from "../utils/luauAst";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { identifierAt, stampDebugMetadata } from "../utils/debugMetadata";
import { findOwnDeclarationName } from "../utils/findOwnDeclarationName";
import { isDefineMethodCall } from "../../utils/defineMethodCall";
import { getFunctionBodyContent } from "../utils/getFunctionBodyContent";
import { lowerArguments } from "../utils/lowerArguments";
import { validateAssignmentValue } from "../utils/validateAssignmentValue";
import { validateDefineStructure } from "../utils/validateDefineStructure";
import { wrapInWeave } from "../utils/wrapInWeave";
import { functionBindings } from "../utils/functionBindings";
import { reportErasedConstErrors } from "../utils/publishesConst";
import { syntheticId } from "../utils/documentTag";
import {
  closeFunctionBody,
  openFunctionBody,
} from "../utils/statementShape";

interface DefineProperty {
  name: string;
  key?: Expression;
  expr: Expression;
  scope: string;
  access: string;
  node: SyntaxNode;
  value: DefineValue;
}

interface DefineValue {
  expr: AstExpr;
  source: LuauSource;
  isLuau: boolean;
  nodes: SyntaxNode[];
}

function reportDefineStatement(
  start: SyntaxNode,
  ctx: LowerContext,
  structureErrors: InkDiagnostic[],
  whole = false,
): SyntaxNode {
  let last = defineStatementLast(start, whole);
  const read = (from: number, to: number) => ctx.read(from, to);
  if (!readsDefineStatement(start, read)) return last;
  const lineOf = (pos: number) => ctx.lineNumber(pos);
  let errors: LuauStatementError[];
  for (;;) {
    const reading = luauStatementErrors(start, start.from, read, last.to, ctx.documentText);
    const through = defineStatementThrough(last, reading.to, read, lineOf);
    if (through === last) {
      errors = reading.errors;
      break;
    }
    last = through;
  }
  reportStatementErrors(start, last, errors, ctx, structureErrors);
  return last;
}

function reportDefineProperty(
  propNode: SyntaxNode,
  ctx: LowerContext,
  structureErrors: InkDiagnostic[],
): number | null {
  if (!readsDefineProperty(propNode)) return null;
  const { opNode, consumed } = propertyValueNodes(propNode, ctx);
  const last = consumed[consumed.length - 1];
  if (!last || (!findAssignmentValueNode(opNode ?? null) && last.to <= propNode.to)) return null;
  const value = readExpressionAst(consumed, ctx);
  if (value && value.source.errors.length === 0) return null;
  const end = Math.max(propNode.to, last.to);
  const colon = getDescendent("LuauStructInvalidColon", propNode);
  const withEquals = (text: string, from: number) =>
    colon && colon.from >= from && colon.from < from + text.length
      ? text.slice(0, colon.from - from) + "=" + text.slice(colon.from - from + 1)
      : text;
  const read = (from: number, to: number) => withEquals(ctx.read(from, to), from);
  const documentText = colon ? () => withEquals(ctx.documentText?.() ?? ctx.read(0, end), 0) : ctx.documentText;
  const { errors } = luauStatementErrors(propNode, propNode.from, read, end, documentText);
  if (errors.length === 0 && value) return null;
  reportStatementErrors(propNode, last.from >= propNode.to ? last : propNode, errors, ctx, structureErrors);
  return end;
}

function reportStatementErrors(
  start: SyntaxNode,
  last: SyntaxNode,
  errors: LuauStatementError[],
  ctx: LowerContext,
  structureErrors: InkDiagnostic[],
): void {
  const read = (from: number, to: number) => ctx.read(from, to);
  const dotErrorsAt = new Set<number>();
  let dotAtEnd = false;
  const dots = danglingDots(start, last);
  if (dots.length > 0) {
    let root = start;
    while (root.parent) root = root.parent;
    const documentText = ctx.documentText?.() ?? ctx.read(0, root.to);
    for (const dot of dots) {
      const after = nextLuauToken(dot.to, documentText);
      if (checkerReadsOnTo(dot, after?.from, read)) continue;
      if (after) dotErrorsAt.add(after.from);
      else dotAtEnd = true;
    }
  }
  const dotError = (error: LuauStatementError) =>
    // value-level: the message of an error Luau's reading returned.
    error.message.startsWith("Expected identifier, got ") &&
    (dotErrorsAt.has(error.from) || (dotAtEnd && error.message === "Expected identifier, got <eof>"));
  for (const error of errors) {
    if (dotError(error)) continue;
    const source = {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(error.from) + 1,
      endLineNumber: ctx.lineNumber(error.to) + 1,
      startCharacterNumber: ctx.characterNumber(error.from) + 1,
      endCharacterNumber: ctx.characterNumber(error.to) + 1,
    };
    if (structureErrors.some((reported) => sameRange(reported.source, source))) continue;
    ctx.diagnostics?.push({ message: error.message, severity: ErrorType.Error, source });
  }
}

function sameRange(
  a: { startLineNumber: number; endLineNumber: number; startCharacterNumber: number; endCharacterNumber: number } | null | undefined,
  b: { startLineNumber: number; endLineNumber: number; startCharacterNumber: number; endCharacterNumber: number },
): boolean {
  return (
    !!a &&
    a.startLineNumber === b.startLineNumber &&
    a.endLineNumber === b.endLineNumber &&
    a.startCharacterNumber === b.startCharacterNumber &&
    a.endCharacterNumber === b.endCharacterNumber
  );
}

function coerceScalarLiteral(value: DefineValue, ctx: LowerContext): unknown {
  const first = value.nodes[0];
  const last = value.nodes[value.nodes.length - 1];
  if (!first || !last) return undefined;
  if (ctx.lineNumber(first.from) !== ctx.lineNumber(last.to)) return undefined;
  if (!value.isLuau) return ctx.read(first.from, last.to).trim();
  let expr = value.expr;
  while (expr instanceof AstExprGroup) expr = expr.expr;
  const range = rangeOf(expr.location, ctx);
  const text = ctx.read(range.from, range.to);
  if (expr instanceof AstExprConstantString) {
    if (expr.quoteStyle === QuoteStyle.QuotedRaw) return undefined;
    return processLuauEscapes(stripQuotes(text));
  }
  if (expr instanceof AstExprSparkdownInterpString) {
    return processLuauEscapes(stripQuotes(text));
  }
  if (expr instanceof AstExprConstantBool) return expr.value;
  if (expr instanceof AstExprConstantNumber) {
    return expr.malformed ? text : expr.value;
  }
  if (
    expr instanceof AstExprUnary &&
    expr.op === UnaryOp.Minus &&
    expr.expr instanceof AstExprConstantNumber &&
    !expr.expr.malformed
  ) {
    return -expr.expr.value;
  }
  if (
    expr instanceof AstExprSparkdownRegex ||
    expr instanceof AstExprTable ||
    expr instanceof AstExprCall ||
    expr instanceof AstExprFunction ||
    (expr instanceof AstExprBinary && expr.op === BinaryOp.Concat)
  ) {
    return undefined;
  }
  if (pathNames(expr)?.length === 2) return undefined;
  return text;
}

function expressionToContextValue(expr: Expression | null): unknown {
  if (!expr) return undefined;
  if (expr instanceof NumberExpression) {
    return expr.value;
  }
  if (expr instanceof StringExpression) {
    return expr.isSingleString ? expr.toString() : undefined;
  }
  if (expr instanceof VariableReference) {
    const path = expr.path;
    if (path.length === 1) {
      return { $type: "", $name: path[0] ?? "" };
    }
    if (path.length === 2) {
      return { $type: path[0] ?? "", $name: path[1] ?? "" };
    }
    return undefined;
  }
  if (expr instanceof ObjectExpression) {
    const entries = expr.entries;
    if (entries.length === 0) {
      return {};
    }
    let isArray = true;
    for (let i = 0; i < entries.length; i += 1) {
      if (entries[i]!.key !== String(i + 1)) {
        isArray = false;
        break;
      }
    }
    if (isArray) {
      const arr: unknown[] = [];
      for (const entry of entries) {
        const value = expressionToContextValue(entry.value);
        if (value === undefined) return undefined;
        arr.push(value);
      }
      return arr;
    }
    const obj: Record<string, unknown> = {};
    for (const entry of entries) {
      if (typeof entry.key !== "string") return undefined;
      const value = expressionToContextValue(entry.value);
      if (value === undefined) return undefined;
      obj[entry.key] = value;
    }
    return obj;
  }
  return undefined;
}

function containsStructRef(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsStructRef);
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("$type" in v && "$name" in v) return true;
    return Object.values(v).some(containsStructRef);
  }
  return false;
}

export function contextValueToExpression(value: unknown): Expression {
  if (typeof value === "boolean") {
    return new NumberExpression(value, "bool");
  }
  if (typeof value === "number") {
    return new NumberExpression(value, Number.isInteger(value) ? "int" : "float");
  }
  if (typeof value === "string") {
    return new StringExpression([new Text(value)]);
  }
  if (Array.isArray(value)) {
    return new ObjectExpression(
      value.map(
        (v, i) =>
          new ObjectExpressionEntry(String(i + 1), contextValueToExpression(v)),
      ),
    );
  }
  if (value && typeof value === "object") {
    return new ObjectExpression(
      Object.entries(value as Record<string, unknown>).map(
        ([k, v]) => new ObjectExpressionEntry(k, contextValueToExpression(v)),
      ),
    );
  }
  return new ObjectExpression([]);
}

const METHOD_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauFunctionDeclarationName",
  "LuauFunctionName",
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauGenericsDeclaration",
  "LuauComment",
]);

export function lowerLuauDefine(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const structureErrors = validateDefineStructure(nodeRef.node, ctx);
  ctx.diagnostics?.push(...structureErrors);
  const nameNode = getDescendent("LuauDefineName", nodeRef.node);

  const headerLine = ctx.lineNumber(nodeRef.node.from);
  const inBody = (node: SyntaxNode) => ctx.lineNumber(node.from) !== headerLine;
  const content = findChildByName(nodeRef.node, "LuauDefine_content");
  const properties: DefineProperty[] = [];
  const methodNodes: { name: string; node: SyntaxNode }[] = [];
  if (content) {
    let child = content.firstChild;
    while (child) {
      if (child.name === "LuauPropertyDefinition") {
        const readEnd = inBody(child) ? reportDefineProperty(child, ctx, structureErrors) : null;
        const prop = nameNode ? readPropertyDefinition(child, ctx, readEnd !== null) : null;
        if (prop) properties.push(prop);
        const end = prop ? rangeOf(prop.value.expr.location, ctx).to : readEnd;
        if (end !== null) {
          while (child.nextSibling && child.nextSibling.from < end) child = child.nextSibling;
        }
      } else if (isDefineMethodCall(child, (pos) => ctx.lineNumber(pos))) {
        if (inBody(child)) child = reportDefineStatement(child, ctx, structureErrors, true);
      } else if (child.name === "LuauMethodDefinition") {
        const methodNameNode = getDescendent("LuauFunctionName", child);
        if (methodNameNode) {
          methodNodes.push({
            name: ctx.read(methodNameNode.from, methodNameNode.to),
            node: child,
          });
        }
      } else if (child.name === "LuauFunctionDefinition") {
        const declName = findOwnDeclarationName(child);
        const fnNameNode = declName
          ? getDescendent("LuauFunctionName", declName)
          : null;
        if (fnNameNode) {
          methodNodes.push({
            name: ctx.read(fnNameNode.from, fnNameNode.to),
            node: child,
          });
        } else if (inBody(child)) {
          child = reportDefineStatement(child, ctx, structureErrors);
        }
      } else if (inBody(child) && isDefineStatementStart(child, (pos) => ctx.lineNumber(pos))) {
        child = reportDefineStatement(child, ctx, structureErrors);
      }
      child = child.nextSibling;
    }
  }
  if (!nameNode) return {};
  const nameIdentifier = identifierAt(nameNode, ctx);

  const parentNode = getDescendent("LuauDefineParentName", nodeRef.node);
  const parentIdentifier = parentNode ? identifierAt(parentNode, ctx) : null;

  const entries: ObjectExpressionEntry[] = [];
  for (const prop of properties) {
    let entryExpr: Expression = prop.expr;
    if (coerceScalarLiteral(prop.value, ctx) === undefined) {
      const ctxValue = expressionToContextValue(prop.expr);
      if (ctxValue !== undefined && containsStructRef(ctxValue)) {
        entryExpr = contextValueToExpression(ctxValue);
      }
    }
    entries.push(new ObjectExpressionEntry(prop.key ?? prop.name, entryExpr));
  }
  const named = properties.filter((p) => !p.key);
  const cellBindings: DefineCellBinding[] = [];
  const defineEnd = findChildByName(nodeRef.node, "LuauDefine_end");
  const lentEnd = !(defineEnd && getDescendent("LuauEndKeyword", defineEnd));
  for (const method of methodNodes) {
    const headerIsRead = !lentEnd || method !== methodNodes[methodNodes.length - 1];
    const lowered = lowerDefineMethod(method.name, method.node, ctx, headerIsRead, (local) =>
      defineCellName(
        parentIdentifier?.name ?? "",
        nameIdentifier.name ?? "",
        method.name,
        local,
      ),
    );
    if (lowered) {
      entries.push(new ObjectExpressionEntry(method.name, lowered.closure));
      for (const { cell, local } of lowered.cells) {
        cellBindings.push(new DefineCellBinding(cell, local));
      }
    }
  }
  const pushNameList = (key: string, names: string[]) => {
    if (names.length === 0) return;
    entries.push(
      new ObjectExpressionEntry(
        key,
        new ObjectExpression(
          names.map(
            (n, i) =>
              new ObjectExpressionEntry(
                String(i + 1),
                new StringExpression([new Text(n)]),
              ),
          ),
        ),
      ),
    );
  };
  pushNameList(
    "__storeProps",
    named.filter((p) => p.scope === "store").map((p) => p.name),
  );
  pushNameList(
    "__readProps",
    named.filter((p) => p.access === "read").map((p) => p.name),
  );
  pushNameList(
    "__writeProps",
    named.filter((p) => p.access === "write").map((p) => p.name),
  );

  const defineExpr = new FunctionCall(new Identifier("__def"), [
    new ObjectExpression(entries),
    new StringExpression([new Text(nameIdentifier.name ?? "")]),
    new StringExpression([new Text(parentIdentifier?.name ?? "")]),
  ]);

  let structDef: StructDefinition | null = null;
  if (parentIdentifier) {
    const propertyDefs = named.map(
      (p) => new StructPropertyDefinition(1, new Identifier(p.name), p.expr),
    );
    structDef = new StructDefinition(propertyDefs);
    structDef.name = nameIdentifier;
    structDef.type = parentIdentifier;
    structDef.identifier = nameIdentifier;
  }

  const declaration = new VariableAssignment({
    variableIdentifier: nameIdentifier,
    assignedExpression: defineExpr,
    ...(structDef ? { structDef } : {}),
    isGlobalDeclaration: true,
    isDefineDeclaration: true,
  });

  const block = wrapInWeave([declaration, ...cellBindings]);

  if (parentIdentifier) {
    const type = parentIdentifier.name ?? "";
    const name = nameIdentifier.name ?? "";
    if (type && name) {
      const struct: Record<string, unknown> = { $type: type, $name: name };
      for (const prop of named) {
        let value =
          prop.expr instanceof VariableReference
            ? expressionToContextValue(prop.expr)
            : undefined;
        if (value === undefined) {
          value = coerceScalarLiteral(prop.value, ctx);
        }
        if (value === undefined) {
          value = expressionToContextValue(prop.expr);
        }
        if (value !== undefined) {
          struct[prop.name] = value;
        }
      }
      block.context = { [type]: { [name]: struct } };
    }
  } else {
    const type = nameIdentifier.name ?? "";
    if (type) {
      const struct: Record<string, unknown> = {
        $type: type,
        $name: "$default",
      };
      for (const prop of named) {
        let value = coerceScalarLiteral(prop.value, ctx);
        if (value === undefined) {
          value = expressionToContextValue(prop.expr);
        }
        if (value !== undefined) {
          struct[prop.name] = value;
        }
      }
      block.context = { [type]: { ["$default"]: struct } };
    }
  }

  return block;
}

export function defineMethodReads(
  defineNode: SyntaxNode,
  ctx: LowerContext,
): string[] {
  const reads = new Set<string>();
  const content = findChildByName(defineNode, "LuauDefine_content");
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    const declName =
      child.name === "LuauFunctionDefinition" ? findOwnDeclarationName(child) : null;
    const isMethod =
      (child.name === "LuauMethodDefinition" && !isDefineMethodCall(child, (pos) => ctx.lineNumber(pos)) && !!getDescendent("LuauFunctionName", child)) ||
      (!!declName && !!getDescendent("LuauFunctionName", declName));
    const body = isMethod ? getFunctionBodyContent(child) : null;
    if (!body) continue;
    const params = lowerArguments(child, ctx)
      .filter((a) => !a.isVararg)
      .map((a) => a.identifier?.name ?? "");
    const reading = readBodyAst(body, METHOD_BODY_SKIP, ctx);
    const free = freeVariables(["self", ...params], reading?.unit.root ?? null, ctx, {
      node: child,
      unscoped: true,
    });
    for (const name of free) reads.add(name);
  }
  return [...reads];
}

function lowerDefineMethod(
  _methodName: string,
  node: SyntaxNode,
  ctx: LowerContext,
  headerIsRead: boolean,
  cellName: (local: string) => string,
): { closure: Expression; cells: { cell: string; local: string }[] } | null {
  const content = getFunctionBodyContent(node);
  if (!content) return null;

  const synthName = `__define_fn_${syntheticId(node.from, ctx)}`;
  const userArgs = lowerArguments(node, ctx);
  const params = userArgs
    .filter((a) => !a.isVararg)
    .map((a) => a.identifier?.name ?? "");
  const reading = readBodyAst(content, METHOD_BODY_SKIP, ctx);
  const atTopLevel = !ctx.functionScopeStack?.length;
  const defineReads: string[] = [];
  const upvals = freeVariables(
    params,
    reading?.unit.root ?? null,
    ctx,
    { node, defineReads: atTopLevel ? defineReads : undefined },
  ).filter((n) => n !== "self");
  recordCaptureRead(ctx, upvals);
  const upvalArgs = upvals.map(
    (n) => new Argument(new Identifier(n), false, false, false, true),
  );
  const finalArgs: Argument[] = [
    ...upvalArgs,
    new Argument(new Identifier("self"), false, false),
    ...userArgs,
  ];

  const nested: ParsedObject[] = [];
  ctx.functionScopeStack?.push(nested);
  const bodyAst = reading?.unit.root ?? null;
  const bindings = functionBindings([{ name: "self" }, ...params.map((name) => ({ name }))], bodyAst, ctx, content.from);
  ctx.functionBindingsStack?.push(bindings);
  ctx.declaredLocalsStack?.push(declaredLocalsFrame(["self", ...params], bodyAst, bindings, ctx));
  const hoistedDecls: ParsedObject[] = [];
  const siblingSubFlows = new Map<string, SiblingSubFlowInfo>();
  ctx.siblingSubFlowNamesStack?.push(siblingSubFlows);
  const shape = openFunctionBody(ctx, node);
  const body = lowerStatements(content, ctx, METHOD_BODY_SKIP, shape);
  if (reading) reportErasedConstErrors(reading.unit.root, node, ctx);
  let bodyStart = content.firstChild;
  while (bodyStart && METHOD_BODY_SKIP.has(bodyStart.name)) bodyStart = bodyStart.nextSibling;
  const reportFrom = headerIsRead ? node.from : bodyStart?.from;
  if (reportFrom !== undefined) {
    const errors = node.name === "LuauMethodDefinition" ? methodSyntaxErrors(node, ctx) : readBlockAst([node], ctx)?.unit.errors ?? [];
    reportBodySyntaxErrors(errors, ctx, reportFrom);
  }
  ctx.siblingSubFlowNamesStack?.pop();
  ctx.functionBindingsStack?.pop();
  ctx.declaredLocalsStack?.pop();
  ctx.functionScopeStack?.pop();

  const fn = new Function(
    new Identifier(synthName),
    [...hoistedDecls, ...body, ...nested],
    finalArgs,
  );
  closeFunctionBody(ctx, shape, fn, node, hoistedDecls);
  stampDebugMetadata([fn], node.from, node.to, ctx);

  const stack = ctx.functionScopeStack;
  const enclosingScope =
    stack && stack.length > 0 ? stack[stack.length - 1] : null;
  if (enclosingScope) {
    enclosingScope.push(fn);
  } else if (ctx.hoistedKnots) {
    ctx.hoistedKnots.push(fn);
  } else {
    return null;
  }

  const userArity = 1 + userArgs.filter((a) => !a.isVararg).length;
  const cells = atTopLevel
    ? []
    : upvals.map((local) => ({ cell: cellName(local), local }));
  return {
    closure: buildClosureExpression(
      synthName,
      atTopLevel ? upvals : cells.map(({ cell }) => cell),
      userArity,
    ),
    cells,
  };
}

const ASSIGNMENT_RHS_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauAssignmentOperator",
  "ExtraWhitespace",
  "Whitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "Newline",
  "LuauComment",
]);

function findAssignmentValueNode(
  opNode: SyntaxNode | null,
): SyntaxNode | null {
  if (!opNode) return null;
  let content = opNode.firstChild;
  while (content) {
    if (isExplicitRuleName(content.name, "LuauAssignmentOperation_content")) break;
    content = content.nextSibling;
  }
  let child = (content ?? opNode).firstChild;
  while (child) {
    if (!ASSIGNMENT_RHS_SKIP.has(child.name)) return child;
    child = child.nextSibling;
  }
  return null;
}

function reportUnreadValueErrors(propNode: SyntaxNode, ctx: LowerContext): void {
  const { consumed } = propertyValueNodes(propNode, ctx);
  const reading = consumed.length > 0 ? readExpressionAst(consumed, ctx) : null;
  if (!reading) return;
  reportReadingErrors(reading.source.errors, consumed[0]!, ctx, "string");
}

function propertyValueNodes(propNode: SyntaxNode, ctx: LowerContext): { opNode: SyntaxNode | undefined; consumed: SyntaxNode[] } {
  const opNode = getDescendent(["LuauAssignmentOperation", "LuauSparkdownExplicitAssignmentOperation", "LuauPropertyColonOperation"], propNode);
  const valueNodes = opNode ? containerValueNodes(opNode) : [];
  const candidates = [...valueNodes];
  for (let next = propNode.nextSibling; next; next = next.nextSibling) {
    if (opNode && next.to <= opNode.to) continue;
    if (isDefineMember(next)) break;
    candidates.push(next);
  }
  const continued = readExpressionAst(candidates, ctx);
  const end = continued ? rangeOf(continued.expr.location, ctx).to : propNode.to;
  const consumed = end <= propNode.to ? valueNodes : candidates.filter((node) => node.from < end);
  return { opNode, consumed };
}

function readPropertyDefinition(
  propNode: SyntaxNode,
  ctx: LowerContext,
  reported = false,
): DefineProperty | null {
  let name: string | null = null;
  let keyExpr: Expression | null = null;
  const bracketAssignment = getDescendent("LuauBracketKeyAssignment", propNode);
  if (bracketAssignment) {
    const indexNode = getDescendent(
      "LuauTableIndexDeclaration",
      bracketAssignment,
    );
    if (!indexNode) {
      if (!reported) reportUnreadValueErrors(propNode, ctx);
      return null;
    }
    const key = readExpressionAst(containerValueNodes(indexNode), ctx);
    if (key) reportReadingErrors(key.source.errors, indexNode, ctx, "string");
    if (
      key?.expr instanceof AstExprConstantString &&
      key.expr.quoteStyle !== QuoteStyle.QuotedRaw
    ) {
      const range = rangeOf(key.expr.location, ctx);
      name = processLuauEscapes(stripQuotes(ctx.read(range.from, range.to)));
    } else if (key) {
      keyExpr = lowerExpression(key.expr, key.source, ctx);
      if (keyExpr) {
        stampDebugMetadata([keyExpr], indexNode.from, indexNode.to, ctx);
        name = "";
      }
    }
    if (name == null) {
      if (!reported) reportUnreadValueErrors(propNode, ctx);
      return null;
    }
  } else {
    const begin = findChildByName(propNode, "LuauPropertyDefinition_begin");
    const keywordKey = begin ? getDescendent("LuauDefineKeywordKey", begin) : null;
    const variableAssignment = keywordKey
      ? null
      : getDescendent(["LuauVariableAssignment", "LuauPropertyColonAssignment"], propNode);
    const nameNode = keywordKey ?? (variableAssignment
      ? getDescendent("LuauVariableName", variableAssignment)
      : null);
    if (!nameNode) {
      if (!reported) reportUnreadValueErrors(propNode, ctx);
      return null;
    }
    name = ctx.read(nameNode.from, nameNode.to);
  }

  const { opNode, consumed } = propertyValueNodes(propNode, ctx);
  const reading = readExpressionAst(consumed, ctx);
  if (reading && !reported) reportReadingErrors(reading.source.errors, consumed[0]!, ctx, "string");
  if (opNode && !reported && (!reading || reading.source.errors.length > 0)) validateAssignmentValue(opNode, ctx);
  const expr = reading
    ? lowerExpression(reading.expr, reading.source, ctx)
    : null;
  if (!expr || !reading) return null;
  const value: DefineValue = {
    expr: reading.expr,
    source: reading.source,
    isLuau: reading.source.errors.length === 0,
    nodes: consumed.filter(
      (n) => !ASSIGNMENT_RHS_SKIP.has(n.name) && !n.name.endsWith("Comment"),
    ),
  };
  const valueNode = findAssignmentValueNode(opNode ?? null);

  if (valueNode && opNode) {
    stampDebugMetadata([expr], valueNode.from, opNode.to, ctx);
  }

  const scopeNode = getDescendent("LuauScopeModifier", propNode);
  const accessNode = getDescendent("LuauAccessModifier", propNode);
  const scope = scopeNode
    ? ctx.read(scopeNode.from, scopeNode.to).trim()
    : "";
  const access = accessNode
    ? ctx.read(accessNode.from, accessNode.to).trim()
    : "";

  return {
    name,
    ...(keyExpr ? { key: keyExpr } : {}),
    expr,
    scope,
    access,
    node: propNode,
    value,
  };
}
