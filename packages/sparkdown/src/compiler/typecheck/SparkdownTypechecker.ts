// Type checking a program's documents for the compiler.
//
// Each document's Luau is checked in units (see `LuauDocumentChecker.ts`),
// with Luau's builtin globals and, typed `any`, every name the program
// declares in Sparkdown (scenes, defines, stores, functions in other files)
// and the namespaces Sparkdown's runtime adds to Luau's, each as a value and
// as a type. A flow also sees its file's prelude: the prelude's names and
// type aliases, with the types the prelude's check gave them.
//
// A unit's result is cached under its document, its key (its tokens in its
// own lines, see `LuauAstUnit.key`), its mode and what it can see: the
// program's names, and for a flow the check of its file's prelude. An edit
// checks again only the units whose key changes, and every flow of a file
// whose prelude's key changes, since a flow sees the prelude only through
// that check. So a check that reuses results always gives what a check from
// scratch gives.

import type { SyntaxNode, Tree } from "@lezer/common";
import { registerBuiltinGlobals } from "./BuiltinDefinitions";
import { cloneTypeFun, TypeCloner } from "./Clone";
import { errorToString, UnknownSymbolContext } from "./Error";
import { Frontend } from "./Frontend";
import { lintComments } from "./Linter";
import { Location } from "./Location";
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
import { Mode } from "./Module";
import { Scope } from "./Scope";
import { follow, persist, TypeArena, TypeFun } from "./Type";

/** A type warning, or a syntax error in Luau the grammar cannot see, in document lines and characters. */
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
}

// Syntax Sparkdown adds to Luau's, which the reading does not know: a label
// (`::name::`), which the grammar names.
const SPARKDOWN_SYNTAX = new Set(["LuauLabel"]);

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
  private nextPreludeId = 0;
  // Each `.luau` file's last text and the tree of its `run` wrapping (`luauFileUnit`).
  private luauFileTrees = new Map<string, { text: string; tree: Tree }>();
  stats: TypecheckStats = { checked: 0, reused: 0 };

  /** `parse` reads a document's text with Sparkdown's grammar, for a `.luau` file's text. */
  constructor(private readonly parse?: (text: string) => Tree) {}

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
    for (const uri of [...this.luauFileTrees.keys()]) if (!this.documentChecks.has(uri)) this.luauFileTrees.delete(uri);
  }

  /** Checks one document's Luau and returns its type warnings and the syntax errors it reports. */
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
    // A range that ends at the end of a unit, whose trailing line break is
    // not in its text, ends at the start of the next line, where Luau's
    // end-of-file range ends when the source ends with a line break.
    const rangeEnd = (
      start: { line: number; character: number },
      end: { line: number; character: number },
      atEnd: boolean,
      missingType: boolean,
    ) => {
      // A missing type's range from where the type should stand to the token
      // found on a later line (`local w:` before a line `local z = 1`) ends
      // with the line the type is missing from, not at the token Luau's
      // parser recovers with. Other errors keep their range.
      if (missingType && (end.line > start.line + 1 || (end.line === start.line + 1 && end.character > 0))) {
        return start.line + 1 < lineStartsOf().length ? { line: start.line + 1, character: 0 } : end;
      }
      const after = end.line > start.line || (end.line === start.line && end.character > start.character);
      if (after && (!atEnd || end.character === 0)) return end;
      const line = after ? end.line : start.line;
      return line + 1 < lineStartsOf().length ? { line: line + 1, character: 0 } : after ? end : start;
    };
    const report = (entry: CachedUnit, unit: LuauUnit) => {
      checks.push(entry.check);
      // The tokens a syntax error has been reported at, each once.
      const reportedTokens = new Set<string>();
      const parseErrors = entry.check.sourceModule.parseErrors;
      for (const error of entry.check.errors) {
        const parseError = parseErrors.indexOf(error);
        if (parseError >= 0) {
          // Syntax is the grammar's to report, but for a construct only
          // Luau's reading finds malformed (`LuauSyntaxError.malformed`).
          if (!entry.check.unit.errors[parseError]?.malformed) continue;
          const message = error.data.kind === "SyntaxError" ? error.data.message : "";
          const start = documentPosition(unit, error.location.begin);
          const end = rangeEnd(start, documentPosition(unit, error.location.end), message.endsWith("got <eof>"), message.startsWith("Expected type"));
          // The error's range ends with the token the reading found.
          const token = `${end.line}:${end.character}`;
          if (reportedTokens.has(token) || isSparkdownSyntax(end)) continue;
          reportedTokens.add(token);
          diagnostics.push({ start, end, code: "SyntaxError", message, syntax: true });
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

    const fileUnit = isLuauFile(uri) ? this.luauFile(uri, text) : runFileUnit(uri, text, tree);
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
    const prelude = this.checkUnit(uri, units.prelude, mode, program.scope, program.key, true);
    report(prelude, units.prelude);
    const exports = prelude.exports!;
    for (const flow of units.flows) {
      report(this.checkUnit(uri, flow, mode, exports.scope, `prelude ${exports.id}`, false), flow);
    }
    return diagnostics;
  }

  /** A `.luau` file's unit, reading its text again only when it changed. */
  private luauFile(uri: string, text: string): LuauUnit | undefined {
    const parse = this.parse;
    if (!parse) return undefined;
    let cached = this.luauFileTrees.get(uri);
    return luauFileUnit(text, (wrapped) => {
      if (cached?.text !== wrapped) this.luauFileTrees.set(uri, (cached = { text: wrapped, tree: parse(wrapped) }));
      return cached.tree;
    });
  }

  private checkUnit(uri: string, unit: LuauUnit, mode: Mode, environment: Scope, environmentKey: string, isPrelude: boolean): CachedUnit {
    const key = `${uri}\u0000${unit.kind}\u0000${mode}\u0000${environmentKey}\u0000${unit.key}`;
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
