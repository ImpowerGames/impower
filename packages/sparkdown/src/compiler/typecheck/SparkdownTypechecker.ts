import type { SyntaxNode, Tree } from "@lezer/common";
import { registerBuiltinGlobals } from "./BuiltinDefinitions";
import { cloneTypeFun, TypeCloner } from "./Clone";
import { errorToString, UnknownSymbolContext } from "./Error";
import { equivalentExports } from "./EquivalentExports";
import { Frontend } from "./Frontend";
import { lintComments } from "./Linter";
import { Location } from "./Location";
import {
  checkLuauUnit,
  documentLine,
  documentPosition,
  isLuauFile,
  luauFileUnit,
  runFileUnit,
  sparkdownUnits,
  type LuauUnit,
  type LuauUnitCheck,
} from "./LuauDocumentChecker";
import { isCheckedLuauAt, luauReadingReportsAllAt, storyStoreOf } from "./LuauUnitNodes";
import { cutIslands } from "../utils/storyIslands";
import { isExplicitRuleName } from "../utils/explicitRuleNames";
import { withMessageLines } from "./messageLines";
import { syntaxErrorEnd } from "./syntaxErrorRange";
import { Mode } from "./Module";
import { Scope } from "./Scope";
import { follow, persist, TypeArena, TypeFun } from "./Type";

export interface TypecheckDiagnostic {
  start: { line: number; character: number };
  end: { line: number; character: number };
  code: string;
  message: string;
  unknownGlobal?: string;
  syntax?: boolean;
  ofString?: true;
}

const SPARKDOWN_SYNTAX = new Set(["LuauLabel", "LuauGotoStatement"]);

const MISSING_BLOCK_CLOSER = /^Expected '(?:end|until)' \(to close '(?:then|do|repeat|function|else|elseif)' at [^)]*\), got /;

function inDocumentLines(unit: LuauUnit, message: string): string {
  return withMessageLines(message, (line) => documentLine(unit, line - 1) + 1);
}

interface CachedUnit {
  check: LuauUnitCheck;
  exports?: { scope: Scope; id: number };
}

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
  private previousPreludes = new Map<string, { environmentKey: string; mode: Mode; exports: { scope: Scope; id: number } }>();
  stats: TypecheckStats = { checked: 0, reused: 0 };

  get frontend(): Frontend {
    if (!this._frontend) {
      const frontend = new Frontend();
      registerBuiltinGlobals(frontend, frontend.globals);
      this._frontend = frontend;
    }
    return this._frontend;
  }

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

  checksOf(uri: string): readonly LuauUnitCheck[] {
    return this.documentChecks.get(uri) ?? [];
  }

  endCompile(): void {
    for (const key of [...this.cache.keys()]) if (!this.used.has(key)) this.cache.delete(key);
    for (const uri of [...this.previousPreludes.keys()]) if (!this.documentChecks.has(uri)) this.previousPreludes.delete(uri);
  }

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
    const isSparkdownSyntax = (position: { line: number; character: number }) => {
      const offset = offsetOf(position) - 1;
      for (let node: SyntaxNode | null = tree.resolveInner(Math.max(offset, 0), 1); node; node = node.parent) {
        if (SPARKDOWN_SYNTAX.has(node.name)) return true;
      }
      return false;
    };
    const read = (from: number, to: number) => text.slice(from, to);
    const topLevelAt = (position: { line: number; character: number }) => {
      let node = tree.resolveInner(offsetOf(position), 1);
      while (node.parent?.parent) node = node.parent;
      return node.from;
    };
    const inFunction = (position: { line: number; character: number }) =>
      luauReadingReportsAllAt(tree.resolveInner(offsetOf(position), -1), read);
    let cutIslandRanges: readonly { from: number; to: number }[] | undefined;
    const inCutIsland = (position: { line: number; character: number }) => {
      const at = offsetOf(position);
      return (cutIslandRanges ??= cutIslands(tree, text)).some((island) => at >= island.from && at <= island.to);
    };
    const inBacktickString = (position: { line: number; character: number }) => {
      for (let n: SyntaxNode | null = tree.resolveInner(offsetOf(position), 1); n; n = n.parent) {
        if (isExplicitRuleName(n.name, "LuauInterpolatedString")) return true;
      }
      return false;
    };
    const inStoryStore = (position: { line: number; character: number }) => {
      const offset = offsetOf(position);
      if (storyStoreOf(tree.resolveInner(offset, 1), read)) return true;
      const atLineEnd = offset >= text.length || text[offset] === "\n" || text[offset] === "\r";
      return atLineEnd && !!storyStoreOf(tree.resolveInner(offset, -1), read);
    };
    const reported = new Set<string>();
    const report = (entry: CachedUnit, unit: LuauUnit, pureLuau: boolean) => {
      checks.push(entry.check);
      const parseErrors = entry.check.sourceModule.parseErrors;
      for (const error of entry.check.errors) {
        const parseError = parseErrors.indexOf(error);
        if (parseError >= 0) {
          const syntaxError = entry.check.unit.errors[parseError];
          if (syntaxError?.sparkdown) continue;
          const message = error.data.kind === "SyntaxError" ? error.data.message : "";
          const start = documentPosition(unit, error.location.begin);
          const end = syntaxErrorEnd(start, documentPosition(unit, error.location.end), message, () => lineStartsOf().length);
          if (isSparkdownSyntax(end)) continue;
          const inPureLuau = pureLuau || inFunction(start) || (inCutIsland(start) && !inStoryStore(start));
          const stoppedAt = syntaxError?.pastChunkEnd;
          if (stoppedAt && (pureLuau || topLevelAt(start) === topLevelAt(documentPosition(unit, stoppedAt.begin)))) continue;
          if (!inPureLuau) {
            if (inStoryStore(start)) continue;
            if (!syntaxError?.malformed && MISSING_BLOCK_CLOSER.test(message)) continue;
            const owned = syntaxError?.malformed || syntaxError?.unread || syntaxError?.ofString || inBacktickString(start);
            if (!owned && !isCheckedLuauAt(tree.topNode, offsetOf(start), read)) continue;
          }
          const key = `${start.line}:${start.character}-${end.line}:${end.character} ${message}`;
          if (reported.has(key)) continue;
          reported.add(key);
          diagnostics.push({ start, end, code: "SyntaxError", message: inDocumentLines(unit, message), syntax: true, ...(syntaxError?.ofString ? { ofString: true as const } : {}) });
          continue;
        }
        const diagnostic: TypecheckDiagnostic = {
          start: documentPosition(unit, error.location.begin),
          end: documentPosition(unit, error.location.end),
          code: error.data.kind,
          message: inDocumentLines(unit, errorToString(error)),
        };
        const key = `${diagnostic.start.line}:${diagnostic.start.character}-${diagnostic.end.line}:${diagnostic.end.character} ${diagnostic.message}`;
        if (reported.has(key)) continue;
        reported.add(key);
        if (error.data.kind === "UnknownSymbol" && error.data.context === UnknownSymbolContext.Binding) {
          diagnostic.unknownGlobal = error.data.name;
        }
        diagnostics.push(diagnostic);
      }
    };

    const fileUnit = isLuauFile(uri) ? luauFileUnit(text, tree) : runFileUnit(uri, text, tree);
    if (fileUnit) {
      const entry = this.checkUnit(uri, fileUnit, mode, program.scope, program.key, false);
      report(entry, fileUnit, true);
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
    report(prelude, units.prelude, false);
    const exports = prelude.exports!;
    for (const flow of units.flows) {
      report(this.checkUnit(uri, flow, mode, exports.scope, `prelude ${exports.id}`, false), flow, false);
    }
    return diagnostics;
  }

  private checkUnit(uri: string, unit: LuauUnit, mode: Mode, environment: Scope, environmentKey: string, isPrelude: boolean): CachedUnit {
    const key = `${uri}\u0000${unit.kind}\u0000${mode}\u0000${environmentKey}\u0000${unit.key}`;
    this.used.add(key);
    const cached = this.cache.get(key);
    if (cached) {
      if (isPrelude) this.previousPreludes.set(uri, { environmentKey, mode, exports: cached.exports! });
      this.stats.reused++;
      return cached;
    }
    this.stats.checked++;
    const check = checkLuauUnit(this.frontend, uri, unit, mode, environment);
    const entry: CachedUnit = { check };
    if (isPrelude) {
      const scope = this.preludeScope(check, environment);
      const previous = this.previousPreludes.get(uri);
      const unchanged = previous?.environmentKey === environmentKey && previous.mode === mode && equivalentExports(previous.exports.scope, scope);
      entry.exports = { scope, id: unchanged ? previous.exports.id : this.nextPreludeId++ };
      this.previousPreludes.set(uri, { environmentKey, mode, exports: entry.exports });
    }
    this.cache.set(key, entry);
    return entry;
  }

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
