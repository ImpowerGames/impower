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
import "../../inkjs/engine/Container";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildBeatsFixture } from "../../../../../scripts/bench/preview-fixture.mjs";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { autoGlobalScreenplay } from "./autoGlobalScreenplay";
import { chooseScreenplay } from "./chooseScreenplay";
import { displayScreenplay } from "./displayScreenplay";
import { flowScreenplay } from "./flowScreenplay";
import { captureScreenplay, functionScreenplay } from "./functionScreenplay";
import { logicScreenplay } from "./logicScreenplay";
import { MAIN_URI, programCompiler } from "./programHarness";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "runtime", "fixtures");
const RECORD = join(HERE, "fixtures", "resolver-diagnostics.json");

const fixtureFiles = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      fixtureFiles(full, out);
    } else if (name.endsWith(".sd")) {
      out.push(full);
    }
  }
  return out;
};

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

/** The fixtures of the differential run, by name. */
const fixtures = (): [string, string][] => {
  const { files } = buildBeatsFixture({ lines: 300 });
  const beats = files.get("main.sd")!.replace("include scripts/characters\n", "");
  return [
    ...fixtureFiles(FIXTURES).map(
      (file): [string, string] => [relative(FIXTURES, file).split(sep).join("/"), readFileSync(file, "utf8")],
    ),
    ["beats", beats],
    ["display screenplay", displayScreenplay()],
    ["logic screenplay", logicScreenplay(3)],
    ["function screenplay", functionScreenplay(3)],
    ["capture screenplay", captureScreenplay(3)],
    ["flow screenplay", flowScreenplay(3)],
    ["choose screenplay", chooseScreenplay(3)],
    ["auto-global screenplay", autoGlobalScreenplay(4)],
  ];
};

interface Recorded {
  /** The construct the program falls back for, or none. */
  fallback: string | null;
  /** Each diagnostic as it was reported, by script. */
  diagnostics: string[];
}

const recorded = (program: SparkProgram): Recorded => ({
  fallback: program.fallback?.construct ?? null,
  diagnostics: Object.keys(program.diagnostics ?? {})
    .sort()
    .flatMap((uri) => (program.diagnostics![uri] ?? []).map((d) => `${uri} ${stable(d)}`)),
});

/** A cold compile of `text` with the language server's configuration and
 *  statement chunks on. */
const compiled = (text: string): Recorded => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return recorded(programCompiler({ [MAIN_URI]: text }, { programChunks: true }).compile().program);
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

describe("the resolver's diagnostics", () => {
  it("are the ones ExportRuntime reported for every fixture of the differential run", () => {
    const actual: Record<string, Recorded> = {};
    for (const [name, text] of fixtures()) {
      actual[name] = compiled(text);
    }
    if (process.env["SPARKDOWN_RECORD_DIAGNOSTICS"] === "1") {
      writeFileSync(RECORD, `${JSON.stringify(actual, null, 1)}\n`);
      return;
    }
    expect(existsSync(RECORD), "the recorded diagnostics").toBe(true);
    const expected = JSON.parse(readFileSync(RECORD, "utf8")) as Record<string, Recorded>;
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    const differing: string[] = [];
    for (const [name, want] of Object.entries(expected)) {
      if (stable(actual[name]) !== stable(want)) {
        differing.push(name);
      }
    }
    for (const name of differing) {
      expect(actual[name], name).toEqual(expected[name]);
    }
    // Some fixtures report diagnostics, so the comparison covers some.
    expect(Object.values(expected).filter((r) => r.diagnostics.length > 0).length).toBeGreaterThan(0);
  }, 600_000);
});
