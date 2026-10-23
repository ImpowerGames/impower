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
// program's names, and for a flow its file's prelude exports. A changed
// prelude is checked again; its flows are reused only when a conservative
// graph comparison proves the exported types and aliases unchanged. When
// equivalence cannot be proved, every flow is checked again.

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
  /** Whether it is one of a backtick string's own errors (`LuauSyntaxError.ofString`), which no other reporter reports. */
  ofString?: true;
}

// Syntax Sparkdown adds to Luau's, which the reading does not know: a label
// (`::name::`) and a `goto` statement, which the grammar names.
const SPARKDOWN_SYNTAX = new Set(["LuauLabel", "LuauGotoStatement"]);

// Luau's error for a block whose closer its reading did not meet, named by
// its header's keyword: in a story statement, a block the story holds,
// whose missing closer Sparkdown names (`validateBlockEnds`), at the end of
// the reading's input or at a closer of a block around it (`repeat … if
// true then … until true`), or the function a flow's lines are read in. A
// closer Luau's recovery leaves missing after a malformed header (`while (1
// 2) do`'s, `to close number`) names no keyword.
const MISSING_BLOCK_CLOSER = /^Expected '(?:end|until)' \(to close '(?:then|do|repeat|function|else|elseif)' at [^)]*\), got /;

/** A message with each line it names (`withMessageLines`) named as the document's line it stands on. */
function inDocumentLines(unit: LuauUnit, message: string): string {
  return withMessageLines(message, (line) => documentLine(unit, line - 1) + 1);
}

interface CachedUnit {
  check: LuauUnitCheck;
  /** For a prelude: the scope its flows see, and its proven export-equivalence generation. */
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
  private previousPreludes = new Map<string, { environmentKey: string; mode: Mode; exports: { scope: Scope; id: number } }>();
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
    for (const uri of [...this.previousPreludes.keys()]) if (!this.documentChecks.has(uri)) this.previousPreludes.delete(uri);
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
    // Whether a document position is in a function's own Luau, its header or
    // its body, that the checker reads (`luauReadingReportsAllAt`; not a
    // function value in a `store`'s, whose errors are Sparkdown's own), read
    // from the character before it (an error at the end of the unit begins
    // right after the function's `end`).
    const read = (from: number, to: number) => text.slice(from, to);
    // Where the top-level statement a document position is in begins.
    const topLevelAt = (position: { line: number; character: number }) => {
      let node = tree.resolveInner(offsetOf(position), 1);
      while (node.parent?.parent) node = node.parent;
      return node.from;
    };
    const inFunction = (position: { line: number; character: number }) =>
      luauReadingReportsAllAt(tree.resolveInner(offsetOf(position), -1), read);
    // A story statement cut at its unclosed bracket's line is Luau its
    // reading reports every error of, as a function's own Luau is: the
    // tree's reading of the line runs on past the cut (I-1532).
    let cutIslandRanges: readonly { from: number; to: number }[] | undefined;
    const inCutIsland = (position: { line: number; character: number }) => {
      const at = offsetOf(position);
      return (cutIslandRanges ??= cutIslands(tree, text)).some((island) => at >= island.from && at <= island.to);
    };
    // Whether a position is inside a backtick string the tree holds, whose
    // text no tree check reads (I-1435).
    const inBacktickString = (position: { line: number; character: number }) => {
      for (let n: SyntaxNode | null = tree.resolveInner(offsetOf(position), 1); n; n = n.parent) {
        if (isExplicitRuleName(n.name, "LuauInterpolatedString")) return true;
      }
      return false;
    };
    // Whether an error at a document position is in a story `store`
    // declaration (`storyStoreOf`), one at its line's end (`got <eof>` after
    // its last token) included.
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
          // An error at a token that is Sparkdown's own is Sparkdown's own
          // syntax's to report.
          if (syntaxError?.sparkdown) continue;
          const message = error.data.kind === "SyntaxError" ? error.data.message : "";
          const start = documentPosition(unit, error.location.begin);
          const end = syntaxErrorEnd(start, documentPosition(unit, error.location.end), message, () => lineStartsOf().length);
          if (isSparkdownSyntax(end)) continue;
          // In a pure-Luau body (a `.luau` or `run` file, a function's own
          // Luau) every error of Luau's reading is reported, in Luau's words
          // at Luau's range, its recovery's included (I-1322). Elsewhere the
          // Luau is a story statement's, bounded by its line, and its
          // reading is the one owner of the errors it finds in the Luau it
          // reads (I-1515, as I-1435 and I-1445 rule for a backtick string
          // and a story brace), but three: a story `store`'s, which its
          // reading of the declaration alone reports (`validateStores`); a
          // story block's missing closer (`MISSING_BLOCK_CLOSER`), which
          // Sparkdown's block checks name (I-1322, `validateBlockEnds`), but
          // in a construct only the reading finds malformed; and one at a
          // token the checker does not read as Luau (a line of story an open
          // bracket carried the reading on into), which Sparkdown's own
          // syntax reports, but for a construct
          // only the reading finds malformed (`LuauSyntaxError.malformed`), a
          // statement that holds a token the grammar left unread
          // (`LuauSyntaxError.unread`), a backtick string's own errors
          // (`LuauSyntaxError.ofString`) and a token inside a backtick string,
          // where Luau gave up on the string and no tree check names a token
          // (I-1463).
          const inPureLuau = pureLuau || inFunction(start) || inCutIsland(start);
          // Luau's parser stops at the end of the chunk, and what the reading
          // reads on after it is none of Luau's: in a `.luau` or `run` file
          // all of it, in a `.sd` document the rest of the top-level
          // statement it stopped in. The document's statements after that
          // one (a later function) are compiled on their own, and their
          // errors are theirs.
          const stoppedAt = syntaxError?.pastChunkEnd;
          if (stoppedAt && (pureLuau || topLevelAt(start) === topLevelAt(documentPosition(unit, stoppedAt.begin)))) continue;
          if (!inPureLuau) {
            if (inStoryStore(start)) continue;
            if (!syntaxError?.malformed && MISSING_BLOCK_CLOSER.test(message)) continue;
            const owned = syntaxError?.malformed || syntaxError?.unread || syntaxError?.ofString || inBacktickString(start);
            if (!owned && !isCheckedLuauAt(tree.topNode, offsetOf(start), read)) continue;
          }
          // Each error once, told apart by its range and words, not by its
          // token alone: Luau may report two errors at one token (I-1492).
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
