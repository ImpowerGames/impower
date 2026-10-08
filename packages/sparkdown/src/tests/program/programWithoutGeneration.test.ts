// A compile with statement chunks resolves its program without generating
// the current engine's runtime objects (#705): the resolver prepares each
// statement (`ParsedObject.prepare`), which does what generating it did
// besides building runtime objects, and no parsed object's `runtimeObject`
// is read and no runtime container is filled. Held for every fixture of the
// differential run that does not fall back, cold and after an edit; a
// program that falls back is exported by the current engine, which
// generates. A compile without chunks generates, which shows the spies hear
// generation.
import "../../inkjs/engine/Container";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Container as RuntimeContainer } from "../../inkjs/engine/Container";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { fixtures } from "./differentialFixtures";
import { MAIN_URI, programCompiler } from "./programHarness";

const quietly = <T,>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

/** Counts every read of a parsed object's runtime object and every object
 *  added to a runtime container while `run` runs. */
const generationDuring = <T,>(run: () => T): { result: T; generated: number } => {
  const read = vi.spyOn(ParsedObject.prototype, "runtimeObject", "get");
  const added = vi.spyOn(RuntimeContainer.prototype, "AddContent");
  try {
    const result = run();
    return { result, generated: read.mock.calls.length + added.mock.calls.length };
  } finally {
    read.mockRestore();
    added.mockRestore();
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a compile with statement chunks", () => {
  it("generates nothing for any fixture of the differential run that does not fall back", () => {
    const generating: string[] = [];
    let compiled = 0;
    for (const [name, text] of fixtures()) {
      const compiler = programCompiler({ [MAIN_URI]: text }, { programChunks: true });
      const { result: program, generated } = generationDuring(() =>
        quietly(() => compiler.compile().program),
      );
      if (program.fallback) {
        continue;
      }
      compiled += 1;
      if (generated > 0) {
        generating.push(`${name}: ${generated}`);
      }
    }
    expect(generating).toEqual([]);
    // Most fixtures compile without falling back, so the check covers them.
    expect(compiled).toBeGreaterThan(100);
  }, 600_000);

  it("generates nothing when an edit compiles it again", () => {
    const [, text] = fixtures().find(([name]) => name === "beats")!;
    const compiler = programCompiler({ [MAIN_URI]: text }, { programChunks: true });
    const cold = quietly(() => compiler.compile().program);
    expect(cold.fallback).toBeUndefined();
    const lines = text.split("\n");
    const at = lines.findIndex((line) => line.trim().length > 0 && !line.trim().startsWith("-"));
    compiler.compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [
        {
          range: { start: { line: at, character: 0 }, end: { line: at, character: 0 } },
          text: "Edited. ",
        },
      ],
    } as never);
    const { result: program, generated } = generationDuring(() =>
      quietly(() => compiler.compile().program),
    );
    expect(program.fallback).toBeUndefined();
    expect(program.chunks).toBeTruthy();
    expect(generated).toBe(0);
  });
});

describe("the spies", () => {
  it("hear a compile without chunks generate", () => {
    const [, text] = fixtures().find(([name]) => name === "beats")!;
    const { generated } = generationDuring(() =>
      quietly(() => programCompiler({ [MAIN_URI]: text }, { programChunks: false }).compile()),
    );
    expect(generated).toBeGreaterThan(1000);
  });
});
