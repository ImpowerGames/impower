// Shift oracle: a cold compile of a script and a cold compile of the same
// script with blank lines above it must produce the same program apart from
// source positions.
//
// The compiled program carries no source lines, so a leading blank line
// changes nothing in it but a name minted from a source offset. That finds an
// offset-derived name family with no incremental compile involved: the
// incremental oracles see one only when an edit leaves the chunk holding the
// name outside the reparse window, while a shift moves every chunk of the file
// at once.
//
// Compared: `program.compiled` byte for byte; `context`, the engine UI
// channels and `sparkle` equal, with the `span` of each Sparkle binding in the
// shifted file moved down; the diagnostics equal with the shifted file's
// ranges moved down; and every location table equal with the shifted file's
// rows moved down. A leading blank line moves no column, so columns are
// compared as they are.
import "../../inkjs/engine/Container";
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

// A copy of `location` with its lines moved down by `lines` when it lies in
// the script `script`.
function shiftLocation(location: ScriptLocation, script: number, lines: number): ScriptLocation {
  const [index, startLine, startColumn, endLine, endColumn] = location;
  return index === script ? [index, startLine + lines, startColumn, endLine + lines, endColumn] : location;
}

// A copy of a name-to-location table with the rows of `script` moved down.
function shiftTable(
  table: Record<string, ScriptLocation> | undefined,
  script: number,
  lines: number,
): Record<string, ScriptLocation> | undefined {
  if (!table) return table;
  return Object.fromEntries(Object.entries(table).map(([name, at]) => [name, shiftLocation(at, script, lines)]));
}

// A copy of the path-location table with the rows and function spans of
// `script` moved down.
function shiftPathLocations(table: SparkProgram["pathLocations"], script: number, lines: number) {
  if (!table) return table;
  const values = Array.from(table.values);
  for (let i = 0; i < values.length; i += 5) {
    if (values[i] === script) {
      values[i + 1]! += lines;
      values[i + 3]! += lines;
    }
  }
  return {
    ...table,
    values,
    functions: table.functions?.map((span) =>
      span.lines?.[0] === script
        ? { ...span, lines: [script, span.lines[1] + lines, span.lines[2] + lines] }
        : span,
    ),
  };
}

// A copy of `value` with every `{ start, end }` position range moved down.
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

// A copy of the Sparkle trees with the binding spans of `uri` moved down. A
// span holds a line and two offsets, and each blank line above it adds one
// character before it.
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

// The fields of a program the oracle compares, with the positions in `uri`
// moved down by `lines`.
function surface(program: SparkProgram, uri: string, lines: number) {
  // `scripts` maps each script to its version; a location's script index is
  // the script's position among its keys.
  const s = Object.keys(program.scripts).indexOf(uri);
  expect(s, `${uri} is a script of the program`).toBeGreaterThanOrEqual(0);
  const diagnostics = Object.fromEntries(
    Object.entries(program.diagnostics ?? {}).map(([at, list]) => [at, at === uri ? shiftRanges(list, lines) : list]),
  );
  return {
    compiled: JSON.stringify(program.compiled),
    context: stable(program.context),
    ui: stable({
      layouts: program.layouts,
      screens: program.screens,
      components: program.components,
      styles: program.styles,
    }),
    sparkle: stable(shiftSparkle(program.sparkle, uri, lines)),
    diagnostics: stable(diagnostics),
    pathLocations: stable(shiftPathLocations(program.pathLocations, s, lines)),
    pathLocationsOrder: JSON.stringify(program.pathLocations?.paths ?? []),
    dataLocations: stable(shiftTable(program.dataLocations, s, lines)),
    dataLocationsOrder: JSON.stringify(Object.keys(program.dataLocations ?? {})),
    functionLocations: stable(shiftTable(program.functionLocations, s, lines)),
    sceneLocations: stable(shiftTable(program.sceneLocations, s, lines)),
    knotLocations: stable(shiftTable(program.knotLocations, s, lines)),
    stitchLocations: stable(shiftTable(program.stitchLocations, s, lines)),
    branchLocations: stable(shiftTable(program.branchLocations, s, lines)),
    labelLocations: stable(shiftTable(program.labelLocations, s, lines)),
  };
}

// Compiles `project` cold, and cold again with `lines` blank lines above the
// file `name`, and requires the same program apart from that file's positions.
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
