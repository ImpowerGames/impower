import { isExplicitRuleName } from "../../utils/explicitRuleNames";

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
import { ErrorType } from "../../../runtime/Error";
import {
  AstExprCall,
  AstExprFunction,
  AstExprGlobal,
  AstExprSparkdownConditionalAlternator,
  AstExprSparkdownSequentialAlternator,
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
  type AstLocal,
  type AstNode,
} from "../../typecheck/Ast";
import type { LuauAstUnit, LuauSyntaxError } from "../../typecheck/readLuauAst";
import { withMessageLines } from "../../typecheck/messageLines";
import { nodeNameSet } from "../../utils/nodeNameSet";
import {
  functionBindings,
  type FunctionBinding,
} from "../utils/functionBindings";
import { reportErasedConstErrors } from "../utils/publishesConst";
import { Location, Position } from "../../typecheck/Location";
import { lineCountOf, syntaxErrorEnd } from "../../typecheck/syntaxErrorRange";
import { isReadLuau, storyStoreOf } from "../../typecheck/LuauUnitNodes";
import type { LowerContext, SiblingSubFlowInfo } from "../context";
import { lowerStatements } from "../lower";
import { rawContext } from "../recordingContext";
import { defineMethodReads } from "../lowerers/lowerLuauDefine";
import { getFunctionBodyContent } from "../utils/getFunctionBodyContent";
import { alternatorPartsAst, alternatorScopesOf } from "../utils/alternatorArms";
import { VARARGS_LOCAL_NAME } from "../utils/lowerArguments";
import {
  documentText,
  enclosingNode,
  nodeAfterAttributes,
  offsetAt,
  rangeOf,
  readBlockAst,
  type LuauSource,
} from "../utils/luauAst";
import { syntheticId } from "../utils/documentTag";
import {
  answersDeclaration,
  rootDeclarationAnswer,
  rootLocalAnswer,
  rootLocalAnswerIgnoringBlocks,
  rootSlotName,
} from "../utils/rootLocalReads";
import { ROOT_IN_BLOCK, ROOT_NONE } from "../../utils/rootLocals";
import { followsLineEndingComma } from "../utils/lineContinuation";
import { statementSource } from "../utils/statementSource";
import {
  closeFunctionBody,
  openFunctionBody,
} from "../utils/statementShape";
import { recordCaptureRead, scopeDeclaredLocals } from "./bindings";

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

export function functionNode(
  func: AstExprFunction,
  source: LuauSource,
  ctx: LowerContext,
): SyntaxNode | null {
  const attributed = nodeAfterAttributes(func, source, FUNCTION_NODES, ctx);
  if (attributed !== undefined) return attributed;
  return enclosingNode(source, offsetAt(func.location.begin, ctx), FUNCTION_NODES);
}

export function parameterNames(func: AstExprFunction): string[] {
  return func.args.map((arg) => arg.name);
}

export function readBodyAst(
  content: SyntaxNode | null,
  skipNames: ReadonlySet<string>,
  ctx: LowerContext,
): { unit: LuauAstUnit } | null {
  const nodes: SyntaxNode[] = [];
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (!skipNames.has(child.name)) nodes.push(child);
  }
  return readBlockAst(nodes, ctx);
}

export function reportBodySyntaxErrors(
  errors: readonly LuauSyntaxError[],
  ctx: LowerContext,
  bodyFrom = 0,
): void {
  reportSyntaxErrors(errors.filter((error) => !error.sparkdown && !error.pastChunkEnd), ctx, bodyFrom);
}

export function reportSyntaxErrors(
  errors: readonly LuauSyntaxError[],
  ctx: LowerContext,
  bodyFrom = 0,
): void {
  const diagnostics = ctx.diagnostics;
  if (!diagnostics) return;
  const reported = new Set(
    diagnostics.map((d) => `${d.source?.startLineNumber}:${d.source?.startCharacterNumber} ${d.message}`),
  );
  for (const error of errors) {
    const { begin, end } = error.location;
    const rangeEnd = syntaxErrorEnd(
      { line: begin.line, character: begin.column },
      { line: end.line, character: end.column },
      error.message,
      () => lineCountOf(documentText(ctx)),
    );
    const { from, to } = rangeOf(new Location(begin, new Position(rangeEnd.line, rangeEnd.character)), ctx);
    if (from < bodyFrom) continue;
    const source = {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(from) + 1,
      endLineNumber: ctx.lineNumber(to) + 1,
      startCharacterNumber: ctx.characterNumber(from) + 1,
      endCharacterNumber: ctx.characterNumber(to) + 1,
    };
    const chunkLine = error.location.begin.line - ctx.lineNumber(from);
    let namesLine = false;
    const message = withMessageLines(error.message, (line) => {
      namesLine = true;
      return line - chunkLine;
    });
    const key = `${source.startLineNumber}:${source.startCharacterNumber} ${message}`;
    if (reported.has(key)) continue;
    reported.add(key);
    diagnostics.push({
      message,
      severity: ErrorType.Error,
      source,
      ...(namesLine ? { messageLinesInChunk: true as const } : {}),
    });
  }
}

export type ReadingErrorScope = "string" | "expression";

function isPropertyName(node: SyntaxNode | null): boolean {
  for (let n = node; n; n = n.parent) {
    if (isExplicitRuleName(n.name, "LuauPropertyName")) return true;
    if (isExplicitRuleName(n.name, "LuauPropertyAccessor")) return false;
  }
  return false;
}

export function reportReadingErrors(
  errors: readonly LuauSyntaxError[],
  node: SyntaxNode,
  ctx: LowerContext,
  scope: ReadingErrorScope,
): void {
  let root = node;
  while (root.parent) root = root.parent;
  const read = (from: number, to: number) => ctx.read(from, to);
  const owned = errors.filter((error) => {
    if (error.sparkdown || error.pastChunkEnd) return false;
    if (scope === "string" && !error.ofString) return false;
    const at = root.resolveInner(offsetAt(error.location.begin, ctx), 1);
    if (!error.ofString && isPropertyName(at)) return false;
    return !isReadLuau(at, read) && !storyStoreOf(at, read);
  });
  if (owned.length > 0) reportSyntaxErrors(owned, ctx);
}

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

function walk(root: AstNode, enter: (node: AstNode) => boolean): void {
  visitAst(root, {
    visit: (node) =>
      node instanceof AstType || node instanceof AstTypePack
        ? false
        : enter(node),
  });
}

function bodyWideDeclarations(body: AstStatBlock): Set<string> {
  const names = new Set<string>();
  walk(body, (node) => {
    if (node instanceof AstExprFunction) return false;
    const stat =
      node instanceof AstStatSparkdownExplicit ? node.statement : node;
    if (stat instanceof AstStatSparkdownStore) {
      for (const v of stat.vars) names.add(v.name);
    }
    return true;
  });
  return names;
}

function declarationNames(node: AstNode): string[] {
  const stat =
    node instanceof AstStatSparkdownExplicit ? node.statement : node;
  if (stat instanceof AstStatLocal) return stat.vars.map((v) => v.name);
  if (stat instanceof AstStatSparkdownStore) return stat.vars.map((v) => v.name);
  return [];
}

function declaredLocals(node: AstNode): readonly AstLocal[] {
  const stat =
    node instanceof AstStatSparkdownExplicit ? node.statement : node;
  if (stat instanceof AstStatLocal) return stat.vars;
  if (stat instanceof AstStatLocalFunction) return [stat.name];
  if (stat instanceof AstStatFor) return [stat.variable];
  if (stat instanceof AstStatForIn) return stat.vars;
  if (stat instanceof AstExprFunction) {
    return stat.self ? [stat.self, ...stat.args] : stat.args;
  }
  return [];
}

function loopNames(node: AstNode): string[] {
  if (node instanceof AstStatFor) return [node.variable.name];
  if (node instanceof AstStatForIn) return node.vars.map((v) => v.name);
  return [];
}

export function immediateBodyDeclarations(
  params: readonly string[],
  body: AstStatBlock | null,
  ctx: LowerContext,
): Set<string> {
  const out = new Set<string>(params);
  if (!body) return out;
  const declares = (node: AstNode): boolean => {
    if (node instanceof AstExprFunction) return false;
    if (node instanceof AstStatLocalFunction) {
      out.add(node.name.name);
      return false;
    }
    if (node instanceof AstStatFunction) return false;
    const scopes = alternatorScopesOf(node, ctx);
    if (scopes) {
      for (const scope of scopes) for (const part of scope.parts) walk(part, declares);
      return false;
    }
    for (const name of declarationNames(node)) out.add(name);
    for (const name of loopNames(node)) out.add(name);
    return true;
  };
  walk(body, declares);
  return out;
}

const STDLIB_NAMES_FOR_FREE_VAR_SCAN: ReadonlySet<string> = new Set([
  "math", "string", "table", "utf8", "bit32", "os", "vector",
  "coroutine", "debug", "task", "buffer",
  "count", "lang", "plural", "system",
  "_G", "_VERSION",
  "assert", "collectgarbage", "error", "gcinfo", "getfenv",
  "getmetatable", "ipairs", "loadstring", "newproxy", "next",
  "pairs", "pcall", "print", "rawequal", "rawget", "rawlen", "rawset",
  "require", "select", "setfenv", "setmetatable", "tonumber",
  "tostring", "type", "typeof", "unpack", "xpcall",
  "true", "false", "nil",
]);

export function freeVariables(
  params: readonly string[],
  body: AstStatBlock | null,
  ctx: LowerContext,
  {
    rootReads,
    node,
    defineReads,
    unscoped = false,
  }: {
    rootReads?: RootRead[];
    node?: SyntaxNode | null;
    defineReads?: string[];
    unscoped?: boolean;
  } = {},
): string[] {
  if (!body) return [];
  const bound = new Set<string>(params);
  const locals = new Set<AstLocal>();
  walk(body, (node) => {
    const stat =
      node instanceof AstStatSparkdownExplicit ? node.statement : node;
    if (stat instanceof AstStatSparkdownStore) {
      for (const v of stat.vars) bound.add(v.name);
    }
    for (const local of declaredLocals(node)) locals.add(local);
    return true;
  });
  const isGlobalCallable = (name: string) =>
    ctx.globalCallableNames?.has(name) ?? false;
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
  const rootSeen = new Set<string>();
  let into = free;
  const readAt = (name: string, at: number, readsLocal = false, declared?: string, blockLocal = false) => {
    if (bound.has(name) || seen.has(name)) return;
    if (!unscoped) {
      let takenByLocal = false;
      if (!readsLocal && !isShadowedLocal(name) && !rootSeen.has(name)) {
        rootSeen.add(name);
        const answer = declared ?? rootLocalAnswer(name, at, ctx);
        if (answer !== ROOT_IN_BLOCK) rootReads?.push({ name, answer });
        takenByLocal =
          !rootReads
            ? false
            : answer === ROOT_IN_BLOCK
            ? blockLocal ||
              (ctx.rootLocals?.blockLocal(name, at) ?? false) ||
              answersDeclaration(rootLocalAnswerIgnoringBlocks(name, at, ctx))
            : answersDeclaration(answer);
      }
      if (!isShadowedLocal(name) && !readsLocal && !takenByLocal) {
        if (isGlobalCallable(name)) return;
        if (STDLIB_NAMES_FOR_FREE_VAR_SCAN.has(name)) return;
      }
    }
    seen.add(name);
    into.push(name);
  };
  const read = (name: string, location: Location) =>
    readAt(name, offsetAt(location.begin, ctx));
  const readLocal = (local: AstLocal, location: Location) => {
    if (locals.has(local)) return;
    const at = offsetAt(location.begin, ctx);
    const declaredAt = offsetAt(local.location.begin, ctx);
    const index = rawContext(ctx).rootLocals;
    if (index?.answer(local.name, at) === ROOT_IN_BLOCK) {
      readAt(local.name, at, false, undefined, true);
    } else {
      const declared = index?.declared(local.name, declaredAt)
        ? rootDeclarationAnswer(local.name, declaredAt, ctx)
        : "";
      if (declared) readAt(local.name, at, false, declared);
      else readAt(local.name, at, true);
    }
  };
  const alternatorScopes: ReadonlyMap<string, AstLocal>[] = [];
  const localInAlternatorScope = (name: string): AstLocal | undefined => {
    for (let i = alternatorScopes.length - 1; i >= 0; i--) {
      const local = alternatorScopes[i]!.get(name);
      if (local) return local;
    }
    return undefined;
  };
  const readNames = (node: AstNode): boolean => {
    if (node instanceof AstExprGlobal) {
      const local = localInAlternatorScope(node.name);
      if (local) readLocal(local, node.location);
      else read(node.name, node.location);
    } else if (node instanceof AstExprSparkdownSequentialAlternator || node instanceof AstExprSparkdownConditionalAlternator) {
      const candidate = node.source.node as SyntaxNode | undefined;
      if (!candidate) return false;
      const groups = alternatorPartsAst(candidate, documentText(ctx)).map((scope) => scope.parts);
      for (const part of groups.flat()) {
        walk(part, (inner) => {
          for (const local of declaredLocals(inner)) locals.add(local);
          return true;
        });
      }
      alternatorScopes.push(node.visibleLocals);
      for (const group of groups) {
        const armScope = new Map<string, AstLocal>();
        alternatorScopes.push(armScope);
        for (const part of group) {
          walk(part, readNames);
          if (!(part instanceof AstStatBlock)) continue;
          for (const written of part.body) {
            const stat = written instanceof AstStatSparkdownExplicit ? written.statement : written;
            if (stat instanceof AstStatLocal) for (const local of stat.vars) armScope.set(local.name, local);
            else if (stat instanceof AstStatLocalFunction) armScope.set(stat.name.name, stat.name);
          }
        }
        alternatorScopes.pop();
      }
      alternatorScopes.pop();
      return false;
    } else if (node instanceof AstExprLocal) {
      readLocal(node.local, node.location);
    } else if (node instanceof AstStatFunction) {
      walk(node.name, readNames);
      walk(node.func, readNames);
      return false;
    } else if (node instanceof AstStatSparkdownStore) {
      for (const value of node.values) walk(value, readNames);
      return false;
    }
    return true;
  };
  walk(body, readNames);
  if (node) {
    const defines = outermostDefines(node);
    if (defines.length > 0) {
      const bindsAt = definesBindings(body, ctx);
      into = defineReads ?? free;
      for (const define of defines) {
        for (const name of defineMethodReads(define, ctx)) {
          if (!bindsAt(name, define.from)) readAt(name, define.from);
        }
      }
    }
  }
  return free;
}

function outermostDefines(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const cursor = node.cursor();
  let depth = 0;
  const next = (): boolean => {
    while (!cursor.nextSibling()) {
      if (depth === 0) return false;
      cursor.parent();
      depth -= 1;
      if (depth === 0) return false;
    }
    return true;
  };
  if (!cursor.firstChild()) return out;
  depth = 1;
  for (;;) {
    if (cursor.name === "LuauDefine") {
      out.push(cursor.node);
      if (!next()) break;
    } else if (cursor.firstChild()) {
      depth += 1;
    } else if (!next()) {
      break;
    }
  }
  return out;
}

function definesBindings(
  body: AstStatBlock,
  ctx: LowerContext,
): (name: string, at: number) => boolean {
  const scopes: {
    from: number;
    to: number;
    bindings: readonly FunctionBinding[];
    names: ReadonlySet<string>;
  }[] = [
    {
      from: -Infinity,
      to: Infinity,
      bindings: functionBindings([], body, ctx),
      names: new Set(),
    },
  ];
  walk(body, (node) => {
    if (node instanceof AstExprFunction) {
      scopes.push({
        from: offsetAt(node.location.begin, ctx),
        to: offsetAt(node.location.end, ctx),
        bindings: functionBindings([], node.body, ctx),
        names: new Set([...(node.self ? [node.self.name] : []), ...parameterNames(node)]),
      });
    }
    return true;
  });
  return (name, at) =>
    scopes.some(
      (scope) =>
        scope.from <= at &&
        at <= scope.to &&
        (scope.names.has(name) ||
          scope.bindings.some(
            (b) =>
              b.name === name &&
              b.from <= at &&
              at >= b.blockFrom &&
              at <= b.blockTo,
          )),
    );
}

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

export function buildClosureExpression(
  synthName: string,
  upvals: string[],
  userArity: number,
  rootCaptures?: ReadonlyMap<string, RootCapture>,
): Expression {
  const fnDivert = new DivertTarget(
    new Divert([new Identifier(synthName)]),
    true,
  );
  const upvalEntries: ObjectExpressionEntry[] = upvals.map(
    (name, i) =>
      new ObjectExpressionEntry(
        String(i),
        new VariablePointerExpression(name, rootCaptures?.get(name)),
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

export interface RootRead {
  name: string;
  answer: string;
}

export type RootCapture = { slot: string } | "global";

export function rootCaptureSlots(
  reads: readonly RootRead[],
  upvals: readonly string[],
  ctx: LowerContext,
): Map<string, RootCapture> | undefined {
  if (ctx.functionScopeStack && ctx.functionScopeStack.length > 0) return undefined;
  const captures = new Map<string, RootCapture>();
  const captured = new Set(upvals);
  for (const { name, answer } of reads) {
    if (!captured.has(name)) continue;
    const slot = rootSlotName(name, answer, ctx);
    if (slot) captures.set(name, { slot });
    else if (answer === ROOT_NONE) captures.set(name, "global");
  }
  return captures.size > 0 ? captures : undefined;
}

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
  const {
    result: { shape, body },
    hoisted,
    nested,
  } = inFunctionScopes(
    [...(func.self ? [func.self] : []), ...func.args],
    parameterNames(func),
    func.body,
    ctx,
    () => {
      const shape = openFunctionBody(ctx, node);
      const body = lowerStatements(content, ctx, skipNames, shape);
      reportErasedConstErrors(func, node, ctx);
      return { shape, body };
    },
  );
  return {
    hoisted,
    body,
    nested,
    close: (flow) => closeFunctionBody(ctx, shape, flow, node, hoisted),
  };
}

export function declaredLocalsFrame(
  declaredParams: readonly string[],
  body: AstStatBlock | null,
  bindings: readonly FunctionBinding[],
  ctx: LowerContext,
): Set<string> {
  const declared = immediateBodyDeclarations(declaredParams, body, ctx);
  if (body) {
    scopeDeclaredLocals(declared, bindings, bodyWideDeclarations(body));
  }
  return declared;
}

export function inFunctionScopes<T>(
  params: readonly { name: string }[],
  declaredParams: readonly string[],
  body: AstStatBlock | null,
  ctx: LowerContext,
  lower: () => T,
): { result: T; hoisted: ParsedObject[]; nested: ParsedObject[] } {
  const nested: ParsedObject[] = [];
  ctx.functionScopeStack?.push(nested);
  const bindings = functionBindings(params, body, ctx);
  ctx.functionBindingsStack?.push(bindings);
  ctx.declaredLocalsStack?.push(
    declaredLocalsFrame(declaredParams, body, bindings, ctx),
  );
  const hoisted: ParsedObject[] = [];
  const siblingSubFlows = new Map<string, SiblingSubFlowInfo>();
  ctx.siblingSubFlowNamesStack?.push(siblingSubFlows);
  const result = lower();
  ctx.siblingSubFlowNamesStack?.pop();
  ctx.declaredLocalsStack?.pop();
  ctx.functionBindingsStack?.pop();
  ctx.functionScopeStack?.pop();
  return { result, hoisted, nested };
}

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
    if (isExplicitRuleName(child.name, "LuauAccessPath")) return child;
  }
  return null;
}

function reportNamedFunctionValue(nameNode: SyntaxNode, ctx: LowerContext) {
  if (!ctx.diagnostics) return;
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  ctx.diagnostics.push({
    message: `Expected '(' when parsing function, got '${name}'`,
    severity: ErrorType.Error,
    source: statementSource(nameNode, ctx),
  });
}

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

export function lowerFunctionExpression(
  func: AstExprFunction,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  if (!ctx.hoistedKnots && !ctx.functionScopeStack) {
    return null;
  }
  const node = functionNode(func, source, ctx);
  if (!node) return null;
  const headerName = findHeaderName(node);
  if (headerName) {
    if (!followsLineEndingComma(node, ctx)) {
      reportNamedFunctionValue(headerName, ctx);
    }
    func = withArgsAfter(func, headerName.to, ctx);
  }

  const synthName = `__anon_fn_${syntheticId(node.from, ctx)}`;
  const rootReads: RootRead[] = [];
  const upvals = freeVariables(parameterNames(func), func.body, ctx, { node, rootReads });
  recordCaptureRead(ctx, upvals);
  const userArity = func.args.length;

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
  return buildClosureExpression(
    synthName,
    upvals,
    userArity,
    rootCaptureSlots(rootReads, upvals, ctx),
  );
}
