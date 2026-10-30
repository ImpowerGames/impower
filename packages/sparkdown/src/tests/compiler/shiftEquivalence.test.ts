import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { SparkProgram, ScriptLocation } from "../../compiler/types/SparkProgram";
import { SHIFT_CASES, type Project } from "./fixtures/shiftCases";

const uriOf = (name: string) => `file://proj/${name}.sd`;

const MAIN_URI = uriOf("main");

const SHIFTS = [1, 3];

const file = (name: string, text: string): File => ({
  uri: uriOf(name),
  type: "script",
  name,
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function coldCompile(project: Project): SparkProgram {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: Object.entries(project).map(([name, text]) => file(name, text)) });
    return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

function stable(value: unknown): string {
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v as ArrayLike<unknown>, walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

function shiftLocation(location: ScriptLocation, script: number, lines: number): ScriptLocation {
  const [index, startLine, startColumn, endLine, endColumn] = location;
  return index === script ? [index, startLine + lines, startColumn, endLine + lines, endColumn] : location;
}

function shiftTable(
  table: Record<string, ScriptLocation> | undefined,
  script: number,
  lines: number,
): Record<string, ScriptLocation> | undefined {
  if (!table) return table;
  return Object.fromEntries(Object.entries(table).map(([name, at]) => [name, shiftLocation(at, script, lines)]));
}

function shiftRanges(value: unknown, lines: number): unknown {
  if (Array.isArray(value)) return value.map((v) => shiftRanges(v, lines));
  if (value && typeof value === "object") {
    const v = value as Record<string, any>;
    if (typeof v["line"] === "number" && typeof v["character"] === "number") {
      return { ...v, line: v["line"] + lines };
    }
    return Object.fromEntries(Object.entries(v).map(([k, child]) => [k, shiftRanges(child, lines)]));
  }
  return value;
}

function shiftMessageLines(diagnostic: unknown, lines: number): unknown {
  const d = diagnostic as { message?: string | { value: string } };
  const shift = (text: string) =>
    text.replace(/\bat line (\d+)(?! in ')/g, (_, line: string) => `at line ${Number(line) + lines}`);
  if (typeof d?.message === "string") return { ...d, message: shift(d.message) };
  if (d?.message && typeof d.message.value === "string") return { ...d, message: { ...d.message, value: shift(d.message.value) } };
  return diagnostic;
}

function shiftSparkle(sparkle: unknown, uri: string, lines: number): unknown {
  return JSON.parse(
    JSON.stringify(sparkle ?? null, function (this: any, key, value) {
      if (key === "span" && value && value.file === uri) {
        return { ...value, line: value.line + lines, from: value.from + lines, to: value.to + lines };
      }
      return value;
    }),
  );
}

function surface(program: SparkProgram, uri: string, lines: number) {
  const s = Object.keys(program.scripts).indexOf(uri);
  expect(s, `${uri} is a script of the program`).toBeGreaterThanOrEqual(0);
  const diagnostics = Object.fromEntries(
    Object.entries(program.diagnostics ?? {}).map(([at, list]) => [
      at,
      at === uri ? (shiftRanges(list, lines) as unknown[]).map((d) => shiftMessageLines(d, lines)) : list,
    ]),
  );
  return {
    context: stable(program.context),
    ui: stable({
      layouts: program.layouts,
      screens: program.screens,
      components: program.components,
      styles: program.styles,
    }),
    sparkle: stable(shiftSparkle(program.sparkle, uri, lines)),
    diagnostics: stable(diagnostics),
    functionLocations: stable(shiftTable(program.functionLocations, s, lines)),
    sceneLocations: stable(shiftTable(program.sceneLocations, s, lines)),
    knotLocations: stable(shiftTable(program.knotLocations, s, lines)),
    branchLocations: stable(shiftTable(program.branchLocations, s, lines)),
    labelLocations: stable(shiftTable(program.labelLocations, s, lines)),
  };
}

function expectShiftInvariant(project: Project, name: string, lines: number) {
  const plain = coldCompile(project);
  const shifted = coldCompile({ ...project, [name]: "\n".repeat(lines) + project[name]! });
  const uri = uriOf(name);
  const expected = surface(plain, uri, lines);
  const actual = surface(shifted, uri, 0);
  for (const field of Object.keys(expected) as (keyof typeof expected)[]) {
    expect(actual[field], `${field} after ${lines} blank lines above ${name}.sd`).toBe(expected[field]);
  }
}

describe("compiler shift equivalence", () => {
  for (const c of SHIFT_CASES) {
    for (const name of Object.keys(c.project)) {
      for (const n of SHIFTS) {
        it(`${c.name}: ${n} blank line${n === 1 ? "" : "s"} above ${name}.sd`, () =>
          expectShiftInvariant(c.project, name, n));
      }
    }
  }
});
