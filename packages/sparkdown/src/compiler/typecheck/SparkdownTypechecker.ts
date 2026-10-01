// Type checking a program's documents for the compiler.
//
// Each document's Luau is checked in units (see `LuauDocumentChecker.ts`),
// with Luau's builtin globals and, typed `any`, every name the program
// declares in Sparkdown (scenes, defines, stores, functions in other files)
// and the namespaces Sparkdown's runtime adds to Luau's, each as a value and
// as a type. A flow also sees its file's prelude: the prelude's names and
// type aliases, with the types the prelude's check gave them.
//
// A unit's result is cached under its document, its text, its mode and what
// it can see: the program's names, and for a flow the check of its file's
// prelude. An edit checks again only the units whose text changes, and every
// flow of a file whose prelude's text changes, since a flow sees the prelude
// only through that check. So a check that reuses results always gives what a
// check from scratch gives.

import type { SyntaxNode, Tree } from "@lezer/common";
import { RESERVED } from "../lint/luauNames";
import { registerBuiltinGlobals } from "./BuiltinDefinitions";
import { cloneTypeFun, TypeCloner } from "./Clone";
import { describeTokenBefore, parseLuau } from "./DefinitionParser";
import { errorToString, LuauTypeError, UnknownSymbolContext } from "./Error";
import { Frontend } from "./Frontend";
import { lintComments } from "./Linter";
import { Location, type Position } from "./Location";
import {
  checkLuauUnit,
  documentPosition,
  isLuauFile,
  luauFileUnit,
  runFileUnit,
  sparkdownUnits,
  type LuauUnit,
  type LuauUnitCheck,
} from "./LuauDocumentChecker";
import { isCheckedLuau, NEUTRAL } from "./LuauUnitNodes";
import { Mode } from "./Module";
import { Scope } from "./Scope";
import { follow, persist, TypeArena, TypeFun } from "./Type";

/** A type warning, or a type Luau's parser cannot read, in document lines and characters. */
export interface TypecheckDiagnostic {
  start: { line: number; character: number };
  end: { line: number; character: number };
  /** The Luau error kind, such as `TypeMismatch`, or `CommentDirective` for Luau's comment directive lint. */
  code: string;
  message: string;
  /** For an `UnknownSymbol` that is not a type, the name. */
  unknownGlobal?: string;
  /** Whether this is a syntax error, which is an error rather than a warning. */
  syntax?: boolean;
  /** Whether the syntax error is an expression's (see `EXPRESSION_ERROR`). */
  expression?: boolean;
}

// The syntax errors of Luau's parser that the checker reports: a type that
// is missing, or that cannot start with the token where one must stand
// (`Expected type, got '='`), an annotation written with `::`
// (`local x :: number`, `for i :: number`), which Luau words by where it
// stands, and an annotation with no name before it (`local : number`,
// `function f(:: number)`, `{ a: number, : string }`).
// Sparkdown's grammar reads a type only far enough to find where it ends, so
// it has no point at which it expected one; Luau's parser has one wherever a
// type can stand, and names the token it found there.
// So are an expression that is missing, or that cannot start with the token
// where one must stand, wherever an expression can (`local y = 1 +` before
// `local`, `f(1,)`, `local a, g = 1, function named() end`), a member access
// with no name after its `.` or `:` (`t.a.`, `get():`, `function t.()`), and a statement that
// is a value but not a call (`x + 1`, `function() end`), for the same reason:
// the grammar reads
// an expression only far enough to find where it ends (#1175).
// Every other syntax error is Sparkdown's own validator's to report.
const REPORTED_SYNTAX_ERROR = /^Expected type, got |, got '::'$|^Expected identifier when parsing (?:variable name|table field), got ':'$/;
const EXPRESSION_ERROR =
  /^Expected identifier(?: when parsing (?:expression|method name|field name))?, got |^Incomplete statement: expected assignment or a function call$|^Expected '\(' when parsing function, got |^Expected identifier when parsing function name, got '\('$|^Expected expression after ',' but got '\)' instead$|^Expected '\(', '\{' or <string> when parsing function call, got /;
// An unfinished block comment is its own error wherever it stands, which the
// validator reports.
const UNFINISHED_COMMENT = /got unfinished comment$/;
// A function value with a name (`function named() end` where a value stands).
const FUNCTION_VALUE_NAME = /^Expected '\(' when parsing function, got /;
// Sparkdown's own syntax where an expression stands, which a `.luau` file's
// unit keeps as written: a statement's `&` mark and a divert's `->`.
const SPARKDOWN_EXPRESSION_TOKEN = /got '(?:&|->)'$/;
const MISSING_TYPE = /^Expected type, got /;
// Luau's error for an annotation with no name before it, where a name must
// stand.
const MISSING_NAME = /^Expected identifier when parsing (?:variable name|table field), got /;

// A `::` stands where an annotation's `:` does after a name that is not a
// keyword, after a scope modifier with no name (`local :: number`), or after
// the `)` of a function's parameters (`function f() :: number`), where Luau
// reports no cast, with any comments between (`local x --[[c]] ::`). After
// anything else it is an expression's error, such as an if expression's
// `then` with no value before a cast, which is Sparkdown's own validator's to
// report. Luau's lexer reads the token before it, as Luau's parser does.
const NAME_TOKEN = /^'([A-Za-z_]\w*)'$/;
const SCOPE_MODIFIERS = new Set(["local", "const", "store"]);

// Syntax Sparkdown adds to Luau's, which Luau's parser rejects, is not
// reported: the divert-target type (`function f(target: ->)`), which stands
// where a type must begin, so Luau's error for it is this one, and a label
// (`::name::`), which the grammar names.
const DIVERT_TARGET_TYPE = "Expected type, got '->'";
const SPARKDOWN_SYNTAX = new Set(["LuauLabel"]);

/**
 * The expression errors among a unit's parse errors, in the order Luau's
 * parser reports them, that do not follow from an earlier error. Luau's parser
 * recovers from an error by reading each token after it as a new statement
 * (`x + 1` is `Incomplete statement` at `x`, then an error at `+` and at `1`),
 * so an expression error that begins on or before the line the error before it
 * ended on is one of those, and only the first is reported. After an error
 * the checker does not report (`Expected '}' (to close '{' at line 2)`), the
 * parser's recovery reaches the next line too. A `;` from where the error
 * before it begins ends the statement that error is in, so an error after
 * the `;` is a mistake of its own (`local a = 1 +; local b = 2 +;`).
 */
function reportedExpressionErrors(parseErrors: readonly LuauTypeError[], text: string): Set<LuauTypeError> {
  const reported = new Set<LuauTypeError>();
  const lines = text.split("\n");
  let lastErrorLine = -1;
  let lastBegin: Position | undefined;
  // Whether the last error that did not follow another is one the checker reports.
  let lastFirstReported = true;
  for (const error of parseErrors) {
    if (error.data.kind !== "SyntaxError") continue;
    const message = error.data.message;
    const begin = error.location.begin.line;
    const separated = lastBegin !== undefined && textBetween(lines, lastBegin, error.location.begin).includes(";");
    lastBegin = error.location.begin;
    const follows = !separated && (begin <= lastErrorLine || (!lastFirstReported && begin === lastErrorLine + 1));
    lastErrorLine = Math.max(lastErrorLine, error.location.end.line);
    if (follows) continue;
    const isExpressionError = EXPRESSION_ERROR.test(message) && !UNFINISHED_COMMENT.test(message);
    const atSparkdownSyntax = SPARKDOWN_EXPRESSION_TOKEN.test(message);
    lastFirstReported = isExpressionError || atSparkdownSyntax || REPORTED_SYNTAX_ERROR.test(message);
    if (isExpressionError && !atSparkdownSyntax) reported.add(error);
  }
  return reported;
}

/** A unit's text from one position to another, which Luau gives in UTF-8 columns. */
function textBetween(lines: readonly string[], from: Position, to: Position): string {
  const index = (position: Position) =>
    utf8Decoder.decode(utf8Encoder.encode(lines[position.line] ?? "").slice(0, position.column)).length;
  if (to.line < from.line || (to.line === from.line && to.column <= from.column)) return "";
  if (from.line === to.line) return (lines[from.line] ?? "").slice(index(from), index(to));
  return [(lines[from.line] ?? "").slice(index(from)), ...lines.slice(from.line + 1, to.line), (lines[to.line] ?? "").slice(0, index(to))].join("\n");
}

// A statement Luau reads wherever one can stand, which the checker writes at
// the end of a unit's line that a story line follows (see `expressionErrors`).
const STORY_LINE_BARRIER = " do end";
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

interface CachedUnit {
  check: LuauUnitCheck;
  /** For a prelude: the scope its file's flows see, and a number no other prelude check has. */
  exports?: { scope: Scope; id: number };
}

/** Counts of the units the last compile checked and reused. */
export interface TypecheckStats {
  checked: number;
  reused: number;
}

export class SparkdownTypechecker {
  private _frontend: Frontend | undefined;
  private programScope: { key: string; scope: Scope } | undefined;
  private cache = new Map<string, CachedUnit>();
  private used = new Set<string>();
  private documentChecks = new Map<string, LuauUnitCheck[]>();
  // The parse errors of units read with story line barriers, by their text.
  private barrierParses = new Map<string, LuauTypeError[]>();
  private usedBarrierParses = new Set<string>();
  private nextPreludeId = 0;
  stats: TypecheckStats = { checked: 0, reused: 0 };

  /** Luau's builtin globals, loaded on first use. */
  get frontend(): Frontend {
    if (!this._frontend) {
      const frontend = new Frontend();
      registerBuiltinGlobals(frontend, frontend.globals);
      this._frontend = frontend;
    }
    return this._frontend;
  }

  /**
   * Starts a compile's checks. `programNames` are the names the program
   * declares in Sparkdown, which Luau code may use as globals and, since a
   * define declares a type, as types.
   */
  beginCompile(programNames: Iterable<string>): void {
    this.used = new Set();
    this.usedBarrierParses = new Set();
    this.documentChecks = new Map();
    this.stats = { checked: 0, reused: 0 };
    const globals = this.frontend.globals.globalScope;
    const names = [...new Set(programNames)].sort();
    const key = names.join("\n");
    if (this.programScope?.key !== key) {
      const any = this.frontend.builtinTypes.anyType;
      const scope = Scope.child(globals);
      for (const name of names) {
        if (!globals.bindings.has(name)) scope.bindings.set(name, { typeId: any, location: new Location() });
        if (!globals.lookupType(name)) scope.privateTypeBindings.set(name, new TypeFun(any));
      }
      this.programScope = { key, scope };
    }
  }

  /** The checks of a document's units in the last compile, in document order. */
  checksOf(uri: string): readonly LuauUnitCheck[] {
    return this.documentChecks.get(uri) ?? [];
  }

  /** Ends a compile's checks, dropping the results no document used. */
  endCompile(): void {
    for (const key of [...this.cache.keys()]) if (!this.used.has(key)) this.cache.delete(key);
    for (const key of [...this.barrierParses.keys()]) if (!this.usedBarrierParses.has(key)) this.barrierParses.delete(key);
  }

  /**
   * The expression errors of a unit that the checker reports (see
   * `reportedExpressionErrors`). In a narrative body a statement ends at its
   * line, and the story lines after it are not in the unit, so Luau would
   * read a statement left unfinished there on into the next Luau statement
   * (`store a, b = 1,` before a line of story). The unit is then read again
   * with a statement at the end of each of its `linesBeforeStory`: one
   * written where a statement ends is no error, and one written where a
   * statement is unfinished is an error there, which is Sparkdown's own
   * validator's to report, so errors whose range reaches it are left out
   * (`local x = t:m` before story is `got 'do'` from the receiver on).
   */
  private expressionErrors(unit: LuauUnit, linesBeforeStory: readonly number[], entry: CachedUnit): LuauTypeError[] {
    if (!linesBeforeStory.length) return [...reportedExpressionErrors(entry.check.sourceModule.parseErrors, unit.text)];
    const lines = unit.text.split("\n");
    // Where each barrier begins, in Luau's UTF-8 columns.
    const barriers = new Map<number, number>();
    for (const index of linesBeforeStory) {
      barriers.set(index, utf8Encoder.encode(lines[index]!).length);
      lines[index] += STORY_LINE_BARRIER;
    }
    const text = lines.join("\n");
    this.usedBarrierParses.add(text);
    let errors = this.barrierParses.get(text);
    if (!errors) {
      const name = entry.check.sourceModule.name;
      errors = parseLuau(text).errors.map((e) => new LuauTypeError(e.location, { kind: "SyntaxError", message: e.message }, name));
      this.barrierParses.set(text, errors);
    }
    // Whether an error's range reaches a barrier: ends past one's start, or
    // spans a line that holds one.
    const reachesBarrier = (error: LuauTypeError) => {
      const { begin, end } = error.location;
      for (const [line, column] of barriers) {
        if (line < begin.line || line > end.line) continue;
        if (line < end.line || end.column > column || (begin.line === line && begin.column >= column)) return true;
      }
      return false;
    };
    return [...reportedExpressionErrors(errors, text)].filter((error) => !reachesBarrier(error));
  }

  /** Checks one document's Luau and returns its type warnings. */
  checkDocument(uri: string, text: string, tree: Tree, mode: Mode): TypecheckDiagnostic[] {
    if (!this.programScope) this.beginCompile([]);
    const program = this.programScope!;
    const diagnostics: TypecheckDiagnostic[] = [];
    const checks: LuauUnitCheck[] = [];
    this.documentChecks.set(uri, checks);
    let lineStarts: number[] | undefined;
    const lineStartsOf = () => {
      if (!lineStarts) {
        lineStarts = [0];
        for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) lineStarts.push(i + 1);
      }
      return lineStarts;
    };
    const offsetOf = (position: { line: number; character: number }) =>
      (lineStartsOf()[position.line] ?? text.length) + position.character;
    // Whether the grammar reads the character before a document position as syntax Sparkdown adds to Luau's.
    const isSparkdownSyntax = (position: { line: number; character: number }) => {
      const offset = offsetOf(position) - 1;
      for (let node: SyntaxNode | null = tree.resolveInner(Math.max(offset, 0), 1); node; node = node.parent) {
        if (SPARKDOWN_SYNTAX.has(node.name)) return true;
      }
      return false;
    };
    // Whether a `::` Luau reports at a position of a unit stands where an
    // annotation's `:` does, from the token Luau's lexer reads before it.
    const isAnnotationColon = (unit: LuauUnit, position: Position) => {
      const before = describeTokenBefore(unit.text, position);
      if (before === "')'") return true;
      const word = before === undefined ? undefined : NAME_TOKEN.exec(before)?.[1];
      return word !== undefined && (!RESERVED.has(word) || SCOPE_MODIFIERS.has(word));
    };
    // A range that ends at the end of a unit, whose trailing line break is
    // not in its text, ends at the start of the next line, where Luau's
    // end-of-file range ends when the source ends with a line break.
    const rangeEnd = (
      start: { line: number; character: number },
      end: { line: number; character: number },
      atEnd: boolean,
    ) => {
      const after = end.line > start.line || (end.line === start.line && end.character > start.character);
      if (after && (!atEnd || end.character === 0)) return end;
      const line = after ? end.line : start.line;
      return line + 1 < lineStartsOf().length ? { line: line + 1, character: 0 } : after ? end : start;
    };
    // Whether the grammar reads a document line as story rather than Luau: a
    // unit leaves out Sparkdown's own constructs inside a Luau statement too
    // (an alternator in a `return (…)`), which do not end it.
    const isStoryLine = (line: number) => {
      const start = lineStartsOf()[line] ?? text.length;
      const lineText = text.slice(start, lineStartsOf()[line + 1] ?? text.length);
      const indent = lineText.length - lineText.trimStart().length;
      if (!lineText.trim()) return false;
      for (let node: SyntaxNode | null = tree.resolveInner(start + indent, 1); node; node = node.parent) {
        if (NEUTRAL.test(node.name)) continue;
        return !node.name.startsWith("Luau");
      }
      return false;
    };
    // Whether the text before an error's token, where its expression is
    // missing, stands in Luau that Sparkdown's validator reports errors in
    // itself (`isCheckedLuau`), such as a `store` declaration, whose value
    // the checker reads too.
    const read = (from: number, to: number) => text.slice(from, to);
    const followsUncheckedLuau = (position: { line: number; character: number }) => {
      let offset = offsetOf(position);
      while (offset > 0 && /\s/.test(text[offset - 1]!)) offset--;
      return !isCheckedLuau(tree.resolveInner(offset, -1), read);
    };
    // The lines of a unit that a story line follows before its next line.
    const linesBeforeStory = (unit: LuauUnit) => {
      const kept = new Set(unit.lines);
      const found: number[] = [];
      for (let i = 0; i < unit.lines.length; i++) {
        const from = unit.lines[i]!;
        // After a prelude's last line comes the rest of the document; a
        // flow's last line is its own `end`.
        const to = i + 1 < unit.lines.length ? unit.lines[i + 1]! : unit.kind === "prelude" ? lineStartsOf().length : from;
        for (let line = from + 1; line < to; line++) {
          if (!kept.has(line) && isStoryLine(line)) {
            found.push(i);
            break;
          }
        }
      }
      return found;
    };
    const report = (entry: CachedUnit, unit: LuauUnit) => {
      checks.push(entry.check);
      // The tokens a syntax error has been reported at. Luau's parser can
      // report a token again as it recovers (`Expected type, got '::'`, then
      // `Expected ')' (to close '(' at column 11), got '::'`); each is
      // reported once, with the first error, which begins first.
      const reportedTokens = new Set<string>();
      // The syntax errors reported are the type errors among the unit's
      // errors and its expression errors, in the order of where they begin.
      const expressionErrors = this.expressionErrors(unit, linesBeforeStory(unit), entry);
      const errors = [
        ...entry.check.errors.filter((error) => error.data.kind !== "SyntaxError" || REPORTED_SYNTAX_ERROR.test(error.data.message)),
        ...expressionErrors,
      ].sort((a, b) => a.location.begin.line - b.location.begin.line || a.location.begin.column - b.location.begin.column);
      for (const error of errors) {
        if (error.data.kind === "SyntaxError") {
          const message = error.data.message;
          if (message === DIVERT_TARGET_TYPE) continue;
          const start = documentPosition(unit, error.location.begin);
          // A Luau file is Luau throughout.
          if (unit.kind !== "file" && expressionErrors.includes(error) && followsUncheckedLuau(start)) continue;
          // A function value's name comes right after `function`; after any
          // other token the `(` is missing from a declaration's header, which
          // Sparkdown allows (`function greet` with its body on the next
          // line), when the unit could not write it in.
          if (FUNCTION_VALUE_NAME.test(message) && describeTokenBefore(unit.text, error.location.begin) !== "'function'") continue;
          const end = rangeEnd(start, documentPosition(unit, error.location.end), message.endsWith("got <eof>"));
          // Every other reported error's range is the `::` alone.
          if (message.endsWith("got '::'") && !MISSING_TYPE.test(message) && !MISSING_NAME.test(message) && !isAnnotationColon(unit, error.location.begin)) continue;
          // The error's range ends with the token Luau found.
          const token = `${end.line}:${end.character}`;
          if (reportedTokens.has(token) || isSparkdownSyntax(end)) continue;
          reportedTokens.add(token);
          diagnostics.push({ start, end, code: "SyntaxError", message, syntax: true, expression: expressionErrors.includes(error) });
          continue;
        }
        const diagnostic: TypecheckDiagnostic = {
          start: documentPosition(unit, error.location.begin),
          end: documentPosition(unit, error.location.end),
          code: error.data.kind,
          message: errorToString(error),
        };
        if (error.data.kind === "UnknownSymbol" && error.data.context === UnknownSymbolContext.Binding) {
          diagnostic.unknownGlobal = error.data.name;
        }
        diagnostics.push(diagnostic);
      }
    };

    const fileUnit = isLuauFile(uri) ? luauFileUnit(text) : runFileUnit(uri, text);
    if (fileUnit) {
      const entry = this.checkUnit(uri, fileUnit, mode, program.scope, program.key, false);
      report(entry, fileUnit);
      // A `--!` directive Luau does not know, or would not read, is warned about as Luau's linter warns.
      for (const warning of lintComments(entry.check.sourceModule.hotcomments)) {
        diagnostics.push({
          start: documentPosition(fileUnit, warning.location.begin),
          end: documentPosition(fileUnit, warning.location.end),
          code: "CommentDirective",
          message: warning.text,
        });
      }
      return diagnostics;
    }

    const units = sparkdownUnits(tree, text);
    // A document that writes `_G` itself gets another name for the checker's
    // `any` values (see `sparkdownUnits`), bound for its units alone.
    let environment = program.scope;
    let environmentKey = program.key;
    if (units.anyName !== "_G") {
      environment = Scope.child(program.scope);
      environment.bindings.set(units.anyName, { typeId: this.frontend.builtinTypes.anyType, location: new Location() });
      environmentKey = `${program.key}\u0000${units.anyName}`;
    }
    const prelude = this.checkUnit(uri, units.prelude, mode, environment, environmentKey, true);
    report(prelude, units.prelude);
    const exports = prelude.exports!;
    for (const flow of units.flows) {
      report(this.checkUnit(uri, flow, mode, exports.scope, `prelude ${exports.id}`, false), flow);
    }
    return diagnostics;
  }

  private checkUnit(uri: string, unit: LuauUnit, mode: Mode, environment: Scope, environmentKey: string, isPrelude: boolean): CachedUnit {
    const key = `${uri}\u0000${unit.kind}\u0000${mode}\u0000${environmentKey}\u0000${unit.text}`;
    this.used.add(key);
    const cached = this.cache.get(key);
    if (cached) {
      this.stats.reused++;
      return cached;
    }
    this.stats.checked++;
    const check = checkLuauUnit(this.frontend, uri, unit, mode, environment);
    const entry: CachedUnit = { check };
    if (isPrelude) entry.exports = { scope: this.preludeScope(check, environment), id: this.nextPreludeId++ };
    this.cache.set(key, entry);
    return entry;
  }

  /**
   * The scope a file's flows see: the prelude's names and type aliases, with
   * the types its check gave them, copied out of the prelude's module so that
   * checking a flow cannot change them.
   */
  private preludeScope(check: LuauUnitCheck, environment: Scope): Scope {
    const cloner = new TypeCloner(new TypeArena(), this.frontend.builtinTypes);
    const moduleScope = check.module.getModuleScope();
    const scope = Scope.child(environment);
    for (const [symbol, binding] of moduleScope.bindings) {
      const ty = cloner.clone(follow(binding.typeId));
      persist(ty);
      scope.bindings.set(typeof symbol === "string" ? symbol : symbol.name, { typeId: ty, location: new Location() });
    }
    for (const [name, typeFun] of [...moduleScope.exportedTypeBindings, ...moduleScope.privateTypeBindings]) {
      const copy = cloneTypeFun(typeFun, cloner);
      persist(copy.type);
      scope.privateTypeBindings.set(name, copy);
    }
    return scope;
  }
}
