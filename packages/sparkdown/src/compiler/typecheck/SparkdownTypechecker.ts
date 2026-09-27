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

import type { Tree } from "@lezer/common";
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

/** A type warning, in document lines and characters. */
export interface TypecheckDiagnostic {
  start: { line: number; character: number };
  end: { line: number; character: number };
  /** The Luau error kind, such as `TypeMismatch`, or `CommentDirective` for Luau's comment directive lint. */
  code: string;
  message: string;
  /** For an `UnknownSymbol` that is not a type, the name. */
  unknownGlobal?: string;
}

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
  }

  /** Checks one document's Luau and returns its type warnings. */
  checkDocument(uri: string, text: string, tree: Tree, mode: Mode): TypecheckDiagnostic[] {
    if (!this.programScope) this.beginCompile([]);
    const program = this.programScope!;
    const diagnostics: TypecheckDiagnostic[] = [];
    const checks: LuauUnitCheck[] = [];
    this.documentChecks.set(uri, checks);
    const report = (entry: CachedUnit, unit: LuauUnit) => {
      checks.push(entry.check);
      for (const error of entry.check.errors) {
        // Syntax is Sparkdown's own validator's to report.
        if (error.data.kind === "SyntaxError") continue;
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
    const prelude = this.checkUnit(uri, units.prelude, mode, program.scope, program.key, true);
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
