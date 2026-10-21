import { isExplicitRuleName } from "../../utils/explicitRuleNames";
// Luau functions as values: a function expression lowers to a function of
// its own (a `Function` flow nested in the enclosing function, or hoisted
// when there is none) and a closure value that names it with the enclosing
// variables it captures. The named function statements in
// `lowerLuauFunctionDefinition.ts` build theirs with the same helpers.
//
// A function's parameters and body come from the converter's AST
// (`AstExprFunction`); its body is lowered through `lowerStatements`, which
// walks the body's syntax nodes for the Sparkdown lines among its Luau and
// takes each Luau statement from the AST.

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
import { RootBinding } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/RootBinding";
import { Function } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Flow/Function";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { ErrorType } from "../../../runtime/Error";
import {
  AstExprCall,
  AstExprFunction,
  AstExprGlobal,
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
  resolveFunctionBinding,
  type FunctionBinding,
} from "../utils/functionBindings";
import { reportErasedConstErrors } from "../utils/publishesConst";
import { Location, Position } from "../../typecheck/Location";
import { lineCountOf, syntaxErrorEnd } from "../../typecheck/syntaxErrorRange";
import type { LowerContext, SiblingSubFlowInfo } from "../context";
import { lowerStatements } from "../lower";
import { rawContext } from "../recordingContext";
import { defineMethodReads } from "../lowerers/lowerLuauDefine";
import { getFunctionBodyContent } from "../utils/getFunctionBodyContent";
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
  rootSlotName,
} from "../utils/rootLocalReads";
import { ROOT_NONE } from "../../utils/rootLocals";
import { followsLineEndingComma } from "../utils/lineContinuation";
import { statementSource } from "../utils/statementSource";
import {
  closeFunctionBody,
  openFunctionBody,
} from "../utils/statementShape";
import {
  localInScope,
  recordCaptureRead,
  scopeDeclaredLocals,
} from "./bindings";

// The nodes of a function definition's content that are its header, not
// statements of its body.
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

/** The syntax node of a function expression or statement the AST read. */
export function functionNode(
  func: AstExprFunction,
  source: LuauSource,
  ctx: LowerContext,
): SyntaxNode | null {
  const attributed = nodeAfterAttributes(func, source, FUNCTION_NODES, ctx);
  if (attributed !== undefined) return attributed;
  return enclosingNode(source, offsetAt(func.location.begin, ctx), FUNCTION_NODES);
}

/** A function's named parameters, in order: those it is written with, not `self`. */
export function parameterNames(func: AstExprFunction): string[] {
  return func.args.map((arg) => arg.name);
}

/**
 * A function body's statements, read from the body's syntax nodes as one
 * block, for a function whose header Luau has no syntax for (a `define`'s
 * `name(args) ... end` method), so that only its body is read.
 */
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

/**
 * Reports, for a body the type checker does not read (a `define`'s method,
 * a sparkle handler's closure), every syntax error of Luau's reading of the
 * body alone, in Luau's words at Luau's range, as the type checker reports
 * them in a function's body (I-1322, I-1368); the validator leaves them all
 * to this reading (`loweredLuauBodyOf`). An error at a token that is
 * Sparkdown's own (`LuauSyntaxError.sparkdown`) is Sparkdown's syntax's to
 * report, and one past the end of the chunk (`pastChunkEnd`) is none of
 * Luau's. Only errors from `bodyFrom` on are reported (a define's method
 * passes its own start, so its header's are too, I-1401). Called once the body is lowered, it leaves out an error
 * the lowering already reported at the same place.
 */
export function reportBodySyntaxErrors(
  errors: readonly LuauSyntaxError[],
  ctx: LowerContext,
  bodyFrom = 0,
): void {
  reportSyntaxErrors(errors.filter((error) => !error.sparkdown && !error.pastChunkEnd), ctx, bodyFrom);
}

/**
 * Reports syntax errors of a reading no other reader reports, those from
 * `from` on, each once, leaving out an error already reported at the same
 * place, each ranged as the type checker ranges one (`syntaxErrorEnd`). A
 * line a message names (`at line N`, of the document the reading
 * read) is counted from the chunk's first line, as the error's range is,
 * and the compile names the document's line again where it emits the
 * chunk (`messageLinesInChunk`), so a chunk carried to another line names
 * the lines it stands on.
 */
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
    // Ranged as the type checker ranges an error of its reading
    // (`syntaxErrorEnd`).
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
    // The document's line the chunk begins on.
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

/**
 * A function's parameters as the runtime binds them: each named parameter,
 * then the synthetic local that holds `...`'s values when it takes them.
 */
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

// Visits the statements and expressions under `root` in document order,
// leaving out types; `enter` returns false to skip a node's children.
function walk(root: AstNode, enter: (node: AstNode) => boolean): void {
  visitAst(root, {
    visit: (node) =>
      node instanceof AstType || node instanceof AstTypePack
        ? false
        : enter(node),
  });
}

// The name a function statement declares: a `local function`'s, or a plain
// `function NAME`'s that no local binds where it is written. A name the
// converter binds to a local, of the same function (#415) or of an
// enclosing one (#1349), or that a function lowering around the statement
// binds there (`resolveFunctionBinding`), is that local, which the
// definition assigns (`lowerLuauFunctionDefinition`'s `assignsLocal`); a
// field (`function a.f`) or method (`function a:m`) declares nothing.
function declaredFunctionName(
  stat: AstStatFunction | AstStatLocalFunction,
  ctx: LowerContext,
): string | null {
  if (stat instanceof AstStatLocalFunction) return stat.name.name;
  if (!(stat.name instanceof AstExprGlobal)) return null;
  const name = stat.name.name;
  const at = offsetAt(stat.name.location.begin, ctx);
  return resolveFunctionBinding(name, at, ctx) === undefined ? name : null;
}

// The names the function statements (`function f`, not `local function f`)
// of a function's body declare (`declaredFunctionName`), in the blocks
// inside it too but not in the functions nested in it. The lowerer makes
// each a local of that function, hoisted to its body
// (`lowerNestedNamedFunction`); so the name refers to that function's own
// function in every read inside it.
function functionStatementNames(body: AstStatBlock, ctx: LowerContext): Set<string> {
  const names = new Set<string>();
  walk(body, (node) => {
    if (node instanceof AstExprFunction) return false;
    if (node instanceof AstStatFunction) {
      const name = declaredFunctionName(node, ctx);
      if (name) names.add(name);
    }
    return true;
  });
  return names;
}

// The names a function's body declares for the whole body rather than from
// a point in a block: its function statements' (`functionStatementNames`)
// and its `store`s'.
function bodyWideDeclarations(body: AstStatBlock, ctx: LowerContext): Set<string> {
  const names = functionStatementNames(body, ctx);
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

// The names a declaration statement declares: a `local` or `const`, or a
// `store`, bare or after `&`.
function declarationNames(node: AstNode): string[] {
  const stat =
    node instanceof AstStatSparkdownExplicit ? node.statement : node;
  if (stat instanceof AstStatLocal) return stat.vars.map((v) => v.name);
  if (stat instanceof AstStatSparkdownStore) return stat.vars.map((v) => v.name);
  return [];
}

// The locals a node declares: a `local` or `const`'s names, a local
// function's name, a loop's variables, and a function's parameters.
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

// The variables a loop declares.
function loopNames(node: AstNode): string[] {
  if (node instanceof AstStatFor) return [node.variable.name];
  if (node instanceof AstStatForIn) return node.vars.map((v) => v.name);
  return [];
}

/**
 * The names a function's own scope declares, for `declaredLocalsStack`, so
 * a function nested in it can tell a local of this one from a global: its
 * parameters, and the locals, `store` and `const` declarations, loop
 * variables and named nested functions of its body, in the blocks inside
 * the body too but not inside the functions nested in it, variadic or not.
 * A function statement that assigns a local already in scope declares
 * nothing (`declaredFunctionName`).
 */
export function immediateBodyDeclarations(
  params: readonly string[],
  body: AstStatBlock | null,
  ctx: LowerContext,
): Set<string> {
  const out = new Set<string>(params);
  if (!body) return out;
  walk(body, (node) => {
    if (node instanceof AstExprFunction) return false;
    if (node instanceof AstStatFunction || node instanceof AstStatLocalFunction) {
      const name = declaredFunctionName(node, ctx);
      if (name) out.add(name);
      return false;
    }
    for (const name of declarationNames(node)) out.add(name);
    for (const name of loopNames(node)) out.add(name);
    return true;
  });
  return out;
}

// Heuristic: names matching common stdlib namespaces / globals don't
// need to be captured. False positives (a user-defined `math` would not
// be captured) are acceptable since Luau warns against shadowing stdlib
// names anyway — and a name an enclosing function declares as a local is
// captured whatever it matches (`isShadowedLocal`).
const STDLIB_NAMES_FOR_FREE_VAR_SCAN: ReadonlySet<string> = new Set([
  // Namespaces
  "math", "string", "table", "utf8", "bit32", "os", "vector",
  "coroutine", "debug", "task", "buffer",
  "count", "lang", "plural", "system",
  // Globals
  "_G", "_VERSION",
  // Functions
  "assert", "collectgarbage", "error", "gcinfo", "getfenv",
  "getmetatable", "ipairs", "loadstring", "newproxy", "next",
  "pairs", "pcall", "print", "rawequal", "rawget", "rawlen", "rawset",
  "require", "select", "setfenv", "setmetatable", "tonumber",
  "tostring", "type", "typeof", "unpack", "xpcall",
  // Keywords / control (shouldn't be referenced as values but just in case)
  "true", "false", "nil",
  // NOTE: `self` is NOT in this set. It's an implicit method receiver
  // parameter (for colon-form methods) or an ordinary user parameter
  // — never a stdlib-resolved global. When a nested closure inside a
  // method body references `self`, it must be captured as an upval
  // pointing at the outer frame's parameter slot. Treating it as a
  // stdlib name would block that capture and the inner closure would
  // see nil at runtime.
]);

/**
 * The names a function's body reads from the scopes around it, in the order
 * it first reads them: the function's upvalues, which its closure captures
 * when it is built. A name read in a function nested in the body counts as
 * read by this one, which must capture it for the nested function to
 * capture in turn. A read is bound inside the function, and not captured,
 * when it reads a parameter, a local the body declares at any depth (the
 * converter binds each read to the local it reads, so a same-named local of
 * a nested function or a later block does not bind it), a `store` the body
 * declares, or a name a function statement declares in the function or in a
 * function between it and the read (`functionStatementNames`). A function
 * statement whose name is a local of an enclosing function assigns that
 * local, which the function captures as it captures a read. A name that
 * is a variadic function of an enclosing scope is reached by path and not
 * captured, but the locals it captures are, since a call to it passes them.
 * Any other name is captured, unless no enclosing function
 * declares it and it is a stdlib name or a global callable (a top-level
 * function, `external`, `store` or `const`): a read of a global the program
 * never declares is captured too.
 *
 * A read the converter binds to a local declared outside the function (a
 * local of a block around it, written in the same statement) reads that
 * local, whatever its name; when that local is a declaration of the root
 * frame's own scope (one written on the function's line, `& local a = 1;
 * function g() ... end`), it is that declaration's root read.
 *
 * `rootReads`, when given, collects each name read that no function around
 * the function declares and the converter does not bind to a local, with the
 * `local` of the root frame's own scope that takes it where the function is
 * written (`rootLocalAnswer`), in the order they are first read, whether
 * captured or not: a function's entry binds such a name to that local
 * (`RootBinding`), and a closure built in the root frame captures a captured
 * one through the local's slot when it has one (`rootSlotName`), and at the
 * global when the scope declares the name but none of its declarations is in
 * scope there (`ROOT_NONE`). The answer of every such read is
 * recorded, so the function is lowered again when a `local` above it
 * changes it.
 *
 * `node`, the syntax node the function is written at, adds what the methods
 * of each `define` written in the function read from around the define
 * (`defineMethodReads`), which the converter's reading of the body leaves
 * out (I-1373), after the body's own reads: each is read at the define, and
 * is bound there by a local in scope of this function or of a function
 * nested in it around the define (`definesBindings`). A define inside
 * another's method is read with that method, so each is read once.
 * `defineReads`, when given, takes the names only those methods read
 * instead of the list returned, for a function whose captured parameters
 * must stay what its own body reads (a top-level define's method, whose
 * closure a save can hold). `unscoped` leaves out what the scopes around
 * the function decide (their locals, variadic functions, global callables
 * and stdlib names), for a scan read in another function's scopes than
 * its own (`defineMethodReads`).
 */
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
  // Names bound inside the function: its parameters, and the `store`s its
  // body declares, which a read reaches by name.
  const bound = new Set<string>(params);
  // The names the function statements of the function, and of each function
  // nested in it that encloses the read being scanned, declare.
  const functionScopes: ReadonlySet<string>[] = [functionStatementNames(body, ctx)];
  const declaredByFunctionStatement = (name: string) =>
    functionScopes.some((names) => names.has(name));
  // The locals the body declares (`local`, `const`, `local function`, loop
  // variables, parameters), nested functions included.
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
  // Rebound entries (`f = <expr>` over a global/former subflow) are
  // dispatch metadata only — they must NOT suppress upval capture
  // decisions; the name resolves like any other reference here. A local
  // of a function between the sibling's and the read, in scope where the
  // name is read, hides the sibling (`resolveCallableBinding`).
  const siblingSubFlowAt = (
    name: string,
    at: number,
  ): SiblingSubFlowInfo | null => {
    const stack = ctx.siblingSubFlowNamesStack;
    if (!stack) return null;
    let sibling = stack.length - 1;
    while (sibling >= 0) {
      const entry = stack[sibling]!.get(name);
      if (entry !== undefined && !entry.rebound) break;
      sibling -= 1;
    }
    if (sibling < 0) return null;
    const locals = ctx.declaredLocalsStack ?? [];
    for (let i = stack.length - 1; i > sibling; i--) {
      const frame = locals[i];
      if (
        stack[i]!.get(name) === undefined &&
        frame?.has(name) &&
        localInScope(frame, name, at)
      ) {
        return null;
      }
    }
    return stack[sibling]!.get(name)!;
  };
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
  // Where a read lands: the list returned, or `defineReads` for the reads
  // only a define's methods make.
  let into = free;
  // `declared`, for a read the converter binds to a declaration of the root
  // frame's own scope, is that declaration's answer (`rootDeclarationAnswer`).
  const readAt = (name: string, at: number, readsLocal = false, declared?: string) => {
    if (bound.has(name) || seen.has(name)) return;
    if (declaredByFunctionStatement(name)) return;
    if (!unscoped) {
      // A variadic sibling is the innermost binding and wins over a
      // same-named local of an outer scope (`resolveCallableBinding`). A
      // call to it, or its value, passes a pointer to each local it
      // captures (`withSiblingSubFlowUpvalArgs`), which this function
      // captures in turn so the pointer reaches the enclosing scope's cell.
      const sibling = siblingSubFlowAt(name, at);
      if (sibling) {
        for (const upval of sibling.upvals) readAt(upval, at);
        return;
      }
      // A read the converter binds to a local of a block around the
      // function reads that local, never a local of the root frame's own
      // scope of its name.
      if (!readsLocal && !isShadowedLocal(name) && !rootSeen.has(name)) {
        rootSeen.add(name);
        rootReads?.push({ name, answer: declared ?? rootLocalAnswer(name, at, ctx) });
      }
      if (!isShadowedLocal(name) && !readsLocal) {
        if (isGlobalCallable(name)) return;
        if (STDLIB_NAMES_FOR_FREE_VAR_SCAN.has(name)) return;
      }
    }
    seen.add(name);
    into.push(name);
  };
  const read = (name: string, location: Location) =>
    readAt(name, offsetAt(location.begin, ctx));
  const readNames = (node: AstNode): boolean => {
    if (node instanceof AstExprGlobal) read(node.name, node.location);
    else if (node instanceof AstExprLocal) {
      if (!locals.has(node.local)) {
        const at = offsetAt(node.location.begin, ctx);
        // The local is written in the statement being read, so whether it
        // is a declaration of the root frame's own scope changes only with
        // that statement; its ordinal among the declarations of its name is
        // recorded when it is one.
        const declaredAt = offsetAt(node.local.location.begin, ctx);
        const declared = rawContext(ctx).rootLocals?.declared(node.local.name, declaredAt)
          ? rootDeclarationAnswer(node.local.name, declaredAt, ctx)
          : "";
        if (declared) readAt(node.local.name, at, false, declared);
        else readAt(node.local.name, at, true);
      }
    } else if (node instanceof AstExprFunction) {
      // A nested function's function statements bind its own reads.
      functionScopes.push(functionStatementNames(node.body, ctx));
      walk(node.body, readNames);
      functionScopes.pop();
      return false;
    } else if (node instanceof AstStatFunction) {
      // A function statement's declared name is not read; a name it
      // assigns is, as `function a.f` reads `a`.
      if (!declaredFunctionName(node, ctx)) walk(node.name, readNames);
      walk(node.func, readNames);
      return false;
    } else if (node instanceof AstStatSparkdownStore) {
      // A `store` declares its names and reads its values.
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

/**
 * The `define`s written under a syntax node, each define inside another
 * left out, since the other's methods read it (`defineMethodReads`).
 */
function outermostDefines(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const cursor = node.cursor();
  let depth = 0;
  // Steps past the node at the cursor: to its next sibling, or the next
  // sibling of the nearest node above it, never leaving `node`.
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

/**
 * Whether a name is bound, at an offset in a function's body, by something
 * the body declares there: a local of the function, or a parameter, local
 * or function statement of a function nested in the body around the offset,
 * each from where it is declared to the end of its block (`functionBindings`).
 * A method of a `define` reads its body on its own, so the scopes it is
 * written in are asked by position (`freeVariables`' `node`). The
 * function's parameters, `store`s and function statements are the scan's
 * own.
 */
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
        names: new Set([
          ...(node.self ? [node.self.name] : []),
          ...parameterNames(node),
          ...functionStatementNames(node.body, ctx),
        ]),
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

/**
 * Whether a function's body calls `name` by name anywhere, nested functions
 * included: `local function f() ... f() ... end` refers to itself, so the
 * closure captures a live pointer to the local it is assigned to.
 */
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

/**
 * The names the statements of `block` declare as locals themselves
 * (`local x`, `local function f`, and a `const` unless the story publishes
 * it, `publishesConst`), not those declared inside the blocks within it:
 * what a `repeat` loop's `until` condition sees of its body.
 */
export function blockLocalNames(block: AstStatBlock, constsAreLocal: boolean): string[] {
  const names: string[] = [];
  for (const stat of block.body) {
    if (stat instanceof AstStatLocal && (constsAreLocal || !stat.isConst)) {
      names.push(...stat.vars.map((v) => v.name));
    } else if (stat instanceof AstStatLocalFunction && (constsAreLocal || !stat.isConst)) {
      names.push(stat.name.name);
    }
  }
  return names;
}

// Build the closure-value `ObjectExpression`. The shape is recognized
// by `CallValueAsFunction`'s closure-aware dispatch in Story.ts:
//   {
//     __closure_fn: -> __anon_fn_<syntheticId>,
//     __closure_upvals: { "0": <upval0>, "1": <upval1>, ... },
//     __closure_user_arity: <K>,
//   }
//
// Each upval value is a `VariablePointerExpression` — at runtime that
// emits a `VariablePointerValue` referencing the outer-scope variable.
// The runtime auto-resolves the pointer's `contextIndex` to the
// current frame at push time and registers it as an "open upvalue".
// When the outer frame later pops, `CallStack.Pop` snapshots the
// current value into `pointer.closedValue`, so the closure keeps
// working after its lexical parent is gone (Lua semantics).
//
// Multiple closures capturing the same outer variable share a single
// `VariablePointerValue` (dedup happens at auto-resolve time), so
// mutations made by one closure are visible to the others — both
// while the parent is alive and after it has closed.
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

/** A name a function reads from a `local` of the root frame's own scope,
 *  with the answer that names the declaration (`rootLocalAnswer`). */
export interface RootRead {
  name: string;
  answer: string;
}

/** The binding at a function's entry of each of `reads` (`RootBinding`):
 *  through the slot of its declaration when it has one (`rootSlotName`),
 *  and otherwise by name. */
export function rootBindingsOf(reads: readonly RootRead[], ctx: LowerContext): RootBinding[] {
  return reads
    .filter(({ answer }) => answersDeclaration(answer))
    .map(({ name, answer }) => new RootBinding(name, rootSlotName(name, answer, ctx)));
}

/**
 * The bindings a function's entry makes to the `local`s of the root frame's
 * own scope it reads (`freeVariables`' `rootReads`), each the one in scope
 * where the function is written (I-1374), as Luau's upvalue is: every such
 * name for a function built before its line runs (`captured` null: a
 * function or a define's method written at the top level), and for a closure
 * the names it does not capture (`captured`), which a store, a `const`, a
 * top-level function or a stdlib entry of the name would otherwise answer
 * (`local count = 0` above a closure that counts, I-1365). A closure keeps
 * the parameters it captured, which a save of it passes. A name no such
 * `local` takes where the function is written reads the global, or the
 * builtin of a stdlib name. The names the methods of the defines written in
 * the function read count, as `node`, the function's syntax node, gives them
 * (`freeVariables`, I-1373).
 */
export function rootBindings(
  params: readonly string[],
  body: AstStatBlock | null,
  ctx: LowerContext,
  captured: readonly string[] | null,
  node: SyntaxNode,
): RootBinding[] {
  const reads: RootRead[] = [];
  freeVariables(params, body, ctx, { rootReads: reads, node });
  const capturedNames = new Set(captured ?? []);
  return rootBindingsOf(
    reads.filter(({ name }) => !capturedNames.has(name)),
    ctx,
  );
}

/** How a closure built in the root frame captures one of its upvalues in
 *  place of by name (`VariablePointerExpression`): through the slot of the
 *  declaration it reads, or at the global. */
export type RootCapture = { slot: string } | "global";

/** How each of `upvals` a closure built in the root frame captures, where
 *  not by name: through the slot of the declaration of the root frame's own
 *  scope it reads, for a name the document declares there more than once
 *  (`rootSlotName`), and at the global for a name it reads as
 *  a global that the scope declares where no such declaration is in scope
 *  (`ROOT_NONE`), so that a scene's `local` of the name, which the scope may
 *  bind as the closure is built, is not captured (I-1374). A name the scope
 *  declares nowhere in the document is captured by name, as before. A
 *  closure built in a function captures the
 *  function's own binding of the name, which the function's entry bound
 *  (`rootBindings`). */
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

/**
 * Lowers the body of the function `func` (written at the syntax node `node`)
 * inside the scopes a function opens: a buffer for the functions nested in
 * it, its own locals on the declared-locals stack, a buffer for the
 * `local NAME = nil` declarations its bare nested `function NAME`s hoist,
 * and a frame for its variadic nested functions. Returns the body's objects
 * with the hoisted declarations first and the nested functions last, and
 * passes the shape of the body to `close` once the function is built. The
 * hoisted objects begin with the function's `rootBindings`, for the names
 * it does not capture (`captured`, null for a function that captures none).
 */
export function lowerFunctionBody(
  func: AstExprFunction,
  node: SyntaxNode,
  ctx: LowerContext,
  captured: readonly string[] | null,
  skipNames: ReadonlySet<string> = FUNCTION_BODY_SKIP,
): {
  hoisted: ParsedObject[];
  body: ParsedObject[];
  nested: ParsedObject[];
  close: (flow: ParsedObject) => void;
} {
  const content = getFunctionBodyContent(node);
  // Read in the scopes around the function, before its own are pushed.
  const rootReads = rootBindings(parameterNames(func), func.body, ctx, captured, node);
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
      // The function bodies its types hold lower no code; check them here.
      reportErasedConstErrors(func, node, ctx);
      return { shape, body };
    },
  );
  hoisted.unshift(...rootReads);
  return {
    hoisted,
    body,
    nested,
    close: (flow) => closeFunctionBody(ctx, shape, flow, node, hoisted),
  };
}

/**
 * A function's frame on the declared-locals stack: `declaredParams` and the
 * names its body declares (`immediateBodyDeclarations`), scoped by the
 * function's `bindings` (`scopeDeclaredLocals`). Its `bindings` frame must be
 * on `functionBindingsStack` already, since a function statement that assigns
 * one of its locals declares nothing (`declaredFunctionName`).
 */
export function declaredLocalsFrame(
  declaredParams: readonly string[],
  body: AstStatBlock | null,
  bindings: readonly FunctionBinding[],
  ctx: LowerContext,
): Set<string> {
  const declared = immediateBodyDeclarations(declaredParams, body, ctx);
  if (body) {
    scopeDeclaredLocals(declared, bindings, bodyWideDeclarations(body, ctx));
  }
  return declared;
}

/**
 * Runs `lower`, which lowers a function's body, inside the scopes the body
 * opens: a buffer for the functions nested in it, its bindings (`params`
 * and the locals `body` declares), its own locals on the declared-locals
 * stack (`declaredParams` and the body's declarations), a buffer for the
 * `local NAME = nil` declarations its bare nested `function NAME`s hoist,
 * and a frame for its variadic nested functions. Returns what `lower`
 * returned with the hoisted declarations and the nested functions the body
 * collected. The stacks are read together (`freeVariables`,
 * `resolveCallableBinding`), so a body that is a function opens them here.
 */
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
  ctx.hoistedNestedFnDeclsStack?.push(hoisted);
  const siblingSubFlows = new Map<string, SiblingSubFlowInfo>();
  ctx.siblingSubFlowNamesStack?.push(siblingSubFlows);
  const result = lower();
  ctx.siblingSubFlowNamesStack?.pop();
  ctx.hoistedNestedFnDeclsStack?.pop();
  ctx.declaredLocalsStack?.pop();
  ctx.functionBindingsStack?.pop();
  ctx.functionScopeStack?.pop();
  return { result, hoisted, nested };
}

// A function written as a value, as a `Function` flow of its own named
// `name`, whose parameters are the captured `upvals` followed by its own:
// the closure-dispatch path in `CallValueAsFunction` pushes the upvals as
// the first arguments, so the body's reads of captured names resolve as
// parameter reads. Functions nested in its body attach to it as subflows.
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
  const { hoisted, body, nested, close } = lowerFunctionBody(func, node, ctx, upvals);
  const fn = new Function(
    new Identifier(name),
    [...hoisted, ...body, ...nested],
    args,
  );
  close(fn);
  return fn;
}

// The name in a function's own header: a plain name
// (`LuauFunctionDeclarationName`) or a dotted or method name, which
// parses as a `LuauAccessPath`. Only nodes before the parameter list
// count, since an inline body's statements sit beside it.
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

// Luau's parser reads a function expression's `(` where the name sits,
// so it reports `Expected '(' when parsing function, got 'NAME'`. The
// squiggle covers the name.
function reportNamedFunctionValue(nameNode: SyntaxNode, ctx: LowerContext) {
  if (!ctx.diagnostics) return;
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  ctx.diagnostics.push({
    message: `Expected '(' when parsing function, got '${name}'`,
    severity: ErrorType.Error,
    source: statementSource(nameNode, ctx),
  });
}

// The function, taking only the parameters written after `offset`.
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

/**
 * Lowers a function expression (`function(x) return x * 2 end`): builds its
 * function, attached to the enclosing function's buffer as a nested
 * subflow, or hoisted to the chunk's top level when no function encloses
 * it, and returns the closure value that names it with the variables it
 * captures. The closure-shaped value is built even with no upvalues, so the
 * runtime's value-call dispatch has `__closure_user_arity` to pad
 * under-supplied arguments with nil.
 *
 * A named function in a value position (`g = function named() ... end`) is
 * a Luau parse error: it is reported at the name and then lowered as if
 * anonymous, so the rest of the story compiles.
 */
export function lowerFunctionExpression(
  func: AstExprFunction,
  source: LuauSource,
  ctx: LowerContext,
): Expression | null {
  if (!ctx.hoistedKnots && !ctx.functionScopeStack) {
    // Snapshot-only callers that don't wire up either hoist target
    // can't support function values at runtime.
    return null;
  }
  const node = functionNode(func, source, ctx);
  if (!node) return null;
  const headerName = findHeaderName(node);
  if (headerName) {
    // A named function on the line after a list's comma is a statement to
    // Sparkdown's grammar, and the comma is reported as missing its value
    // (`commaBeforeStatement`).
    if (!followsLineEndingComma(node, ctx)) {
      reportNamedFunctionValue(headerName, ctx);
    }
    // Luau's parser, recovering, reads the name as the parameter list
    // (`function a.f()` takes `a`); the function takes the parameters it
    // is written with.
    func = withArgsAfter(func, headerName.to, ctx);
  }

  const synthName = `__anon_fn_${syntheticId(node.from, ctx)}`;
  const rootReads: RootRead[] = [];
  const upvals = freeVariables(parameterNames(func), func.body, ctx, { node, rootReads });
  recordCaptureRead(ctx, upvals);
  const userArity = func.args.length;

  // Compound-assignment lowering (`obj[fn()] += 1`) lowers the target's
  // expressions twice, once to read and once to write, which builds the
  // same function twice under the same name; a duplicate sibling would be
  // a "duplicate flow" error, so the first one built is kept.
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
