import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { FUNCTION_DIVERT, unsupportedConstructMessage } from "../../compiler/utils/unsupportedConstructMessage";
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
  fallback: string | null;
  diagnostics: string[];
}

const unsupportedConstructOf = (message: string): string | null => {
  if (message === unsupportedConstructMessage(FUNCTION_DIVERT)) {
    return "Divert";
  }
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
    expect(Object.values(expected).filter((r) => r.diagnostics.length > 0).length).toBeGreaterThan(0);
  }, 600_000);
});
