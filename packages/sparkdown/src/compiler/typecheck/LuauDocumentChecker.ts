import type { Tree } from "@lezer/common";
import type { AstStatBlock } from "./Ast";
import { LuauTypeError } from "./Error";
import { accumulateErrors, parseMode, type Frontend } from "./Frontend";
import type { Position } from "./Location";
import { isLuauFile } from "./LuauUnitNodes";
import { Mode, type HotComment, type Module, type SourceModule } from "./Module";
import { readLuauFile, readLuauRunFile, readLuauUnits, type LuauAstUnit, type LuauAstUnits, type LuauSyntaxError } from "./readLuauAst";
import type { Scope } from "./Scope";
import { readSparkdownStatements } from "./SparkdownReading";
import { runWrapperName } from "../utils/runWrapper";

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

export interface LuauUnit {
  kind: "file" | "prelude" | "flow";
  root: AstStatBlock;
  errors: LuauSyntaxError[];
  hotcomments: HotComment[];
  lines: number[];
  key: string;
}

export function documentPosition(unit: LuauUnit, position: Position): { line: number; character: number } {
  return { line: documentLine(unit, position.line), character: position.column };
}

export function documentLine(unit: LuauUnit, line: number): number {
  const index = Math.min(Math.max(line, 0), unit.lines.length - 1);
  return unit.lines[index] ?? 0;
}

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
  return { kind: read.kind, root: read.root, errors: read.errors, hotcomments: read.hotcomments, lines: read.lines ?? [], key: read.key ?? "" };
}

export interface SparkdownUnits {
  prelude: LuauUnit;
  flows: LuauUnit[];
}

const documentUnits = new WeakMap<Tree, LuauAstUnits>();

export function readDocumentUnits(tree: Tree, documentText: string, luauFile = false): LuauAstUnits {
  let read = documentUnits.get(tree);
  if (!read) {
    read = luauFile ? { prelude: readLuauFile(tree, documentText, { unitLines: true }), flows: [] } : readLuauUnits(tree, documentText, { unitLines: true });
    for (const unit of [read.prelude, ...read.flows]) readSparkdownStatements(unit.root);
    documentUnits.set(tree, read);
  }
  return read;
}

export function sparkdownUnits(tree: Tree, documentText: string): SparkdownUnits {
  const read = readDocumentUnits(tree, documentText);
  return { prelude: checkedUnit(read.prelude), flows: read.flows.map(checkedUnit) };
}

export function runFileUnit(uri: string, documentText: string, tree: Tree): LuauUnit | undefined {
  if (runWrapperName(uri) === undefined) return undefined;
  const read = readLuauRunFile(tree, documentText, { unitLines: true });
  return read && checkedUnit(read);
}

export function luauFileUnit(documentText: string, tree: Tree): LuauUnit {
  return checkedUnit(readDocumentUnits(tree, documentText, true).prelude);
}

export interface LuauUnitCheck {
  unit: LuauUnit;
  sourceModule: SourceModule;
  module: Module;
  errors: LuauTypeError[];
  mode: Mode;
}

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
  const errors = accumulateErrors([...sourceModule.parseErrors, ...result.module.errors]);
  return { unit, sourceModule, module: result.module, errors, mode };
}
