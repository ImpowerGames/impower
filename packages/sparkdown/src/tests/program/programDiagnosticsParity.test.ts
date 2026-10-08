// The diagnostics of the program path's resolver (#1607) against those the
// current engine's `ExportRuntime` reported. Each fixture of the differential
// run (every script under `src/tests/runtime/fixtures`, the beats fixture and
// the screenplays) is compiled with the language server's configuration,
// which runs the validation the player's compiler skips, with statement
// chunks on, and its diagnostics, in the order they were reported, with
// their ranges, must be the ones `fixtures/resolver-diagnostics.json`
// records. The file was recorded at 99397ed89, the commit before the
// resolver, where `ExportRuntime` resolved every program:
//   SPARKDOWN_RECORD_DIAGNOSTICS=1 node scripts/test-suite.mjs run packages/sparkdown src/tests/program/programDiagnosticsParity.test.ts --wait 900
// A fixture main added since is recorded by the same command once its
// diagnostics on main's `ExportRuntime` are checked to be the resolver's
// (`diverts/dotted-divert-targets-with-arguments.sd`, at bbc912833).
// A record's `fallback` names the construct the program fell back for. Since
// #705 such a compile builds no chunks and reports the construct as an error
// at its statement, unless the statement's line already holds an error;
// those errors are not the resolver's and are left out of the comparison.
import "../../inkjs/engine/Container";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { unsupportedConstructMessage } from "../../compiler/utils/unsupportedConstructMessage";
import { fixtures } from "./differentialFixtures";
import { MAIN_URI, programCompiler } from "./programHarness";

const HERE = dirname(fileURLToPath(import.meta.url));
const RECORD = join(HERE, "fixtures", "resolver-diagnostics.json");

function stable(value: unknown): string {
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

interface Recorded {
  /** The construct the compile reports it cannot compile, or none. */
  fallback: string | null;
  /** Each diagnostic as it was reported, by script. */
  diagnostics: string[];
}

/** The construct an unsupported construct's error names, or null for any
 *  other diagnostic. */
const unsupportedConstructOf = (message: string): string | null => {
  for (const construct of ["external", "list"]) {
    if (message === unsupportedConstructMessage(construct)) {
      return construct;
    }
  }
  return /^This statement cannot be compiled: (.*)\.$/.exec(message)?.[1] ?? null;
};

const recorded = (program: SparkProgram): Recorded => {
  let fallback: string | null = null;
  const diagnostics = Object.keys(program.diagnostics ?? {})
    .sort()
    .flatMap((uri) =>
      (program.diagnostics![uri] ?? []).flatMap((d) => {
        const message = typeof d.message === "string" ? d.message : d.message.value;
        const construct = unsupportedConstructOf(message);
        if (construct !== null) {
          fallback ??= construct;
          return [];
        }
        return [`${uri} ${stable(d)}`];
      }),
    );
  return { fallback, diagnostics };
};

/** A cold compile of `text` with the language server's configuration: its
 *  record, whether it built its chunks, and whether it finished, building
 *  them or reporting an error (a compile that threw answers with neither, and
 *  with the diagnostics it reached before it stopped). */
const compiled = (text: string): { record: Recorded; chunks: boolean; finished: boolean } => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    const program = programCompiler({ [MAIN_URI]: text }).compile().program;
    const record = recorded(program);
    const reportsError = Object.values(program.diagnostics ?? {})
      .flat()
      .some((d) => d.severity === 1);
    return { record, chunks: !!program.chunks, finished: !!program.chunks || reportsError };
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

describe("the resolver's diagnostics", () => {
  it("are the ones ExportRuntime reported for every fixture of the differential run", () => {
    const actual: Record<string, Recorded> = {};
    const unfinished: string[] = [];
    const withoutChunks: string[] = [];
    for (const [name, text] of fixtures()) {
      const { record, chunks, finished } = compiled(text);
      actual[name] = record;
      if (!finished) {
        unfinished.push(name);
      }
      if (!chunks) {
        withoutChunks.push(name);
      }
    }
    expect(unfinished).toEqual([]);
    if (process.env["SPARKDOWN_RECORD_DIAGNOSTICS"] === "1") {
      writeFileSync(RECORD, `${JSON.stringify(actual, null, 1)}\n`);
      return;
    }
    expect(existsSync(RECORD), "the recorded diagnostics").toBe(true);
    const expected = JSON.parse(readFileSync(RECORD, "utf8")) as Record<string, Recorded>;
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    // The fixtures that fell back are the ones that build no chunks, and a
    // construct an error names is the one each fell back for.
    expect(withoutChunks).toEqual(
      Object.keys(expected).filter((name) => expected[name]!.fallback !== null),
    );
    const differing: string[] = [];
    for (const [name, want] of Object.entries(expected)) {
      const got = actual[name]!;
      if (
        stable(got.diagnostics) !== stable(want.diagnostics) ||
        (got.fallback !== null && got.fallback !== want.fallback)
      ) {
        differing.push(name);
      }
    }
    for (const name of differing) {
      expect({ ...actual[name], fallback: actual[name]!.fallback ?? expected[name]!.fallback }, name).toEqual(
        expected[name],
      );
    }
    // Some fixtures report diagnostics, so the comparison covers some.
    expect(Object.values(expected).filter((r) => r.diagnostics.length > 0).length).toBeGreaterThan(0);
  }, 600_000);
});
