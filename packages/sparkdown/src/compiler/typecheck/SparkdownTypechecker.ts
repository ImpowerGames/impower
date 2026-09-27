// Type checking a program's documents for the compiler.
//
// Each document's Luau is checked in units (see `LuauDocumentChecker.ts`),
// with Luau's builtin globals and, typed `any`, every name the program
// declares in Sparkdown (scenes, defines, stores, functions in other files)
// and the namespaces Sparkdown's runtime adds to Luau's, each as a value and
// as a type. A flow also sees its file's prelude: the prelude's names and
// type aliases, with the types the prelude's check gave them.
//
// A unit's result is cached under its document, its text, its mode and the
// names and types it can see. An edit changes only the units whose text
// changes, unless it changes a prelude name's type (a signature) or a prelude
// type alias, which checks every flow of that file again. So a check that
// reuses results always gives what a check from scratch gives.

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
import { toString, toStringPack } from "./ToString";
import { follow, persist, TypeArena, TypeFun, type TypeId } from "./Type";

// How a cache key prints a type: in full, a named table as its fields, and
// never cut short, so that the key holds the whole of every type.
const KEY_PRINTING = { exhaustive: true, maxTypeLength: 0, maxTableLength: 0 };

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
  /** For a prelude: its names and their types, and a key naming them. */
  exports?: { scope: Scope; key: string };
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
      report(this.checkUnit(uri, flow, mode, exports.scope, `${program.key}\u0000${exports.key}`, false), flow);
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
    if (isPrelude) entry.exports = this.preludeExports(check, environment);
    this.cache.set(key, entry);
    return entry;
  }

  /**
   * The scope a file's flows see: the prelude's names and type aliases, with
   * the types its check gave them, copied out of the prelude's module so that
   * checking a flow cannot change them.
   */
  private preludeExports(check: LuauUnitCheck, environment: Scope): { scope: Scope; key: string } {
    const arena = new TypeArena();
    const cloner = new TypeCloner(arena, this.frontend.builtinTypes);
    const moduleScope = check.module.getModuleScope();
    const values = new Map<string, TypeId>();
    for (const [symbol, binding] of moduleScope.bindings) {
      const name = typeof symbol === "string" ? symbol : symbol.name;
      values.set(name, cloner.clone(follow(binding.typeId)));
    }
    const aliases = new Map<string, TypeFun>();
    for (const [name, typeFun] of [...moduleScope.exportedTypeBindings, ...moduleScope.privateTypeBindings]) {
      aliases.set(name, cloneTypeFun(typeFun, cloner));
    }
    const scope = Scope.child(environment);
    const key: string[] = [];
    for (const name of [...values.keys()].sort()) {
      const ty = values.get(name)!;
      persist(ty);
      scope.bindings.set(name, { typeId: ty, location: new Location() });
      key.push(`${name}: ${toString(ty, KEY_PRINTING)}`);
    }
    for (const name of [...aliases.keys()].sort()) {
      const typeFun = aliases.get(name)!;
      persist(typeFun.type);
      scope.privateTypeBindings.set(name, typeFun);
      // A parameter's default is part of the alias: `A` alone means `A<number>` under `type A<T = number>`.
      const parameters = [
        ...typeFun.typeParams.map((p) => toString(p.ty, KEY_PRINTING) + (p.defaultValue ? ` = ${toString(p.defaultValue, KEY_PRINTING)}` : "")),
        ...typeFun.typePackParams.map((p) => toStringPack(p.tp, KEY_PRINTING) + (p.defaultValue ? ` = ${toStringPack(p.defaultValue, KEY_PRINTING)}` : "")),
      ];
      key.push(`type ${name}<${parameters.join(", ")}> = ${toString(typeFun.type, KEY_PRINTING)}`);
    }
    return { scope, key: key.join("\n") };
  }
}
