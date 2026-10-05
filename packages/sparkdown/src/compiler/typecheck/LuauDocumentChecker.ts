// Type checking the Luau in a Sparkdown document.
//
// The checker reads the Luau that Sparkdown's syntax tree marks as Luau: all
// of a `.luau` file loaded with `run`, and the Luau statements of a `.sd`
// file. It checks the AST `readLuauAst.ts` reads from the tree, the same tree
// the editor highlights, with the port of Luau's type checker.
//
// A document's Luau is checked in units. A `run` file is one unit. A `.sd`
// file is its prelude (the Luau outside any flow, and its functions) and one
// unit per scene, with the branches inside it, and per branch outside any
// scene, each checked as the body of a function whose parameters are the
// flow's, with the prelude's names in scope. A unit is read in its own lines
// (`ReadOptions.unitLines`): its locations count only the document lines
// that hold its Luau, and the unit keeps the document line of each, so a
// unit's AST, and the result of checking it, do not change when lines move
// around it.

import type { Tree } from "@lezer/common";
import type { AstStatBlock } from "./Ast";
import { LuauTypeError } from "./Error";
import { accumulateErrors, parseMode, type Frontend } from "./Frontend";
import type { Position } from "./Location";
import { isLuauFile } from "./LuauUnitNodes";
import { Mode, type HotComment, type Module, type SourceModule } from "./Module";
import { readLuauRunFile, readLuauUnits, type LuauAstUnit, type LuauAstUnits, type LuauSyntaxError } from "./readLuauAst";
import type { Scope } from "./Scope";
import { readSparkdownStatements } from "./SparkdownReading";
import { runWrapperName, runWrapperPrefix, runWrapperText } from "../utils/runWrapper";

/** A mode's name, as a `.sd` file's `typecheck:` field and `config.typecheck.mode` write it. */
export type TypecheckModeName = "strict" | "nonstrict" | "nocheck";

export const TYPECHECK_MODE_NAMES: readonly TypecheckModeName[] = ["nonstrict", "strict", "nocheck"];

export function modeFromName(name: string): Mode | undefined {
  switch (name) {
    case "strict":
      return Mode.Strict;
    case "nonstrict":
      return Mode.Nonstrict;
    case "nocheck":
      return Mode.NoCheck;
    default:
      return undefined;
  }
}

/** Some of a document's Luau, checked as one module. */
export interface LuauUnit {
  /** A `run` file, a `.sd` file's prelude, or one of its flows. */
  kind: "file" | "prelude" | "flow";
  /** The unit's statements, as one block, located in the unit's lines. */
  root: AstStatBlock;
  /** The syntax errors the reading found, located in the unit's lines. */
  errors: LuauSyntaxError[];
  /** The unit's `--!` comments, which select a `run` file's mode. */
  hotcomments: HotComment[];
  /** Lexical query metadata; legacy manually constructed checker units may omit it. */
  commentLocations?: import("./readLuauAst").LuauComment[];
  /** Authoritative consumed token ranges; separate from broad synthetic wrapper ranges. */
  queryLocations?: import("./Location").Location[];
  /** The document line of each of the unit's lines. */
  lines: number[];
  /** What the unit's check depends on of the document (`LuauAstUnit.key`): units with the same key check alike. */
  key: string;
}

/**
 * The document position of a position in a unit's lines. The reading counts
 * a column in UTF-16 code units, as the document does.
 */
export function documentPosition(unit: LuauUnit, position: Position): { line: number; character: number } {
  const index = Math.min(Math.max(position.line, 0), unit.lines.length - 1);
  return { line: unit.lines[index] ?? 0, character: position.column };
}

/** The UTF-16 column of the character a UTF-8 byte column points at. */
export function utf16Column(text: string, byteColumn: number): number {
  let bytes = 0;
  let column = 0;
  while (column < text.length && bytes < byteColumn) {
    const code = text.codePointAt(column)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    column += code > 0xffff ? 2 : 1;
  }
  return column + Math.max(0, byteColumn - bytes);
}

export { isLuauFile };

function checkedUnit(read: LuauAstUnit): LuauUnit {
  if (read.kind === "block") throw new Error("A lowering block is not a document checking unit");
  return { kind: read.kind, root: read.root, errors: read.errors, hotcomments: read.hotcomments, commentLocations: read.commentLocations, queryLocations: read.queryLocations, lines: read.lines ?? [], key: read.key ?? "" };
}

/** The Luau a `.sd` file holds, as units. */
export interface SparkdownUnits {
  prelude: LuauUnit;
  /** One unit per scene or branch that holds Luau statements. */
  flows: LuauUnit[];
}

// Each tree's units, read once for the checker and the lints.
const documentUnits = new WeakMap<Tree, LuauAstUnits>();

/**
 * A `.sd` file's Luau units as `readLuauUnits` reads them, each in its own
 * lines, read once per syntax tree: the checker and the lints
 * (`collectLuauLints.ts`) read the same units. A unit's Sparkdown statements
 * are read as the Luau they hold (`readSparkdownStatements`), as the checker
 * reads them.
 */
export function readDocumentUnits(tree: Tree, documentText: string): LuauAstUnits {
  let read = documentUnits.get(tree);
  if (!read) {
    read = readLuauUnits(tree, documentText, { unitLines: true });
    for (const unit of [read.prelude, ...read.flows]) readSparkdownStatements(unit.root);
    documentUnits.set(tree, read);
  }
  return read;
}

/**
 * A `.sd` file's Luau as units: its prelude, with the Luau statements
 * outside any flow and every function definition, and a unit per scene (its
 * branches included) or branch outside any scene that holds Luau statements.
 */
export function sparkdownUnits(tree: Tree, documentText: string): SparkdownUnits {
  const read = readDocumentUnits(tree, documentText);
  return { prelude: checkedUnit(read.prelude), flows: read.flows.map(checkedUnit) };
}

/**
 * A `run` file's Luau, from the document the compiler loads it as: the
 * file's text wrapped in a function (`& W()`, `function W()`, the text,
 * `end`). The wrapper's body is the unit, and its lines are the file's.
 */
export function runFileUnit(uri: string, documentText: string, tree: Tree): LuauUnit | undefined {
  if (runWrapperName(uri) === undefined) return undefined;
  const read = readLuauRunFile(tree, documentText, { unitLines: true });
  return read && checkedUnit(read);
}

/**
 * A `.luau` file's Luau, read from its text as a `run` reads it: the grammar
 * reads a `.luau` document on its own as narrative, so the file's text is
 * wrapped as a `run` wraps it, parsed with `parse`, and its wrapper's body
 * read, with the unit's lines the file's own.
 */
export function luauFileUnit(documentText: string, parse: (text: string) => Tree): LuauUnit | undefined {
  const wrapper = "__luau_file";
  const wrapped = runWrapperText(wrapper, documentText);
  const read = readLuauRunFile(parse(wrapped), wrapped, { unitLines: true });
  if (!read) return undefined;
  const offset = runWrapperPrefix(wrapper).split("\n").length - 1;
  return { ...checkedUnit(read), lines: (read.lines ?? []).map((line) => line - offset) };
}

/** The result of checking one unit. */
export interface LuauUnitCheck {
  unit: LuauUnit;
  sourceModule: SourceModule;
  module: Module;
  /**
   * The unit's syntax errors, then the checker's errors, in source order as
   * Luau's `CheckResult` lists them, located in the unit's lines.
   */
  errors: LuauTypeError[];
  mode: Mode;
}

/**
 * Checks a unit. A `run` file's `--!` header comment selects its mode;
 * otherwise `defaultMode` does. `environmentScope`, below the global scope,
 * holds the names the unit sees beyond Luau's globals.
 */
export function checkLuauUnit(frontend: Frontend, name: string, unit: LuauUnit, defaultMode: Mode, environmentScope?: Scope): LuauUnitCheck {
  readSparkdownStatements(unit.root);
  const hotcomments = unit.kind === "file" ? unit.hotcomments : [];
  const sourceModule: SourceModule = {
    name,
    humanReadableName: name,
    root: unit.root,
    mode: parseMode(hotcomments),
    hotcomments,
    parseErrors: unit.errors.map((e) => new LuauTypeError(e.location, { kind: "SyntaxError", message: e.message }, name)),
  };
  const result = frontend.checkSourceModule(sourceModule, defaultMode, environmentScope);
  const mode = sourceModule.mode ?? defaultMode;
  // Luau's frontend puts a module's parse errors first, even in no-check
  // mode, then sorts them with the rest by where they begin.
  const errors = accumulateErrors([...sourceModule.parseErrors, ...result.module.errors]);
  return { unit, sourceModule, module: result.module, errors, mode };
}
