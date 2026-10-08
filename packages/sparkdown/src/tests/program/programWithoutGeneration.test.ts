// A compile resolves its program without generating the current engine's
// runtime objects (#705): the resolver prepares each statement
// (`ParsedObject.prepare`), which does what generating it did besides
// building runtime objects, and no parsed object's `runtimeObject` is read
// and no runtime container is filled. Held for every fixture of the
// differential run, cold and after an edit, a fixture holding a construct
// the program cannot compile included: its compile reports the error and
// generates nothing either.
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

describe("a compile", () => {
  it("generates nothing for any fixture of the differential run", () => {
    const generating: string[] = [];
    // A compile that threw answers with neither chunks nor an error, and
    // generated nothing only because it stopped: each must have built its
    // chunks or reported why it could not.
    const unbuilt: string[] = [];
    let compiled = 0;
    for (const [name, text] of fixtures()) {
      const compiler = programCompiler({ [MAIN_URI]: text });
      const { result: program, generated } = generationDuring(() =>
        quietly(() => compiler.compile().program),
      );
      const reportsError = Object.values(program.diagnostics ?? {})
        .flat()
        .some((d) => d.severity === 1);
      if (!program.chunks && !reportsError) {
        unbuilt.push(name);
        continue;
      }
      compiled += 1;
      if (generated > 0) {
        generating.push(`${name}: ${generated}`);
      }
    }
    expect(unbuilt).toEqual([]);
    expect(generating).toEqual([]);
    expect(compiled).toBeGreaterThan(200);
  }, 600_000);

  it("generates nothing when an edit compiles it again", () => {
    const [, text] = fixtures().find(([name]) => name === "beats")!;
    const compiler = programCompiler({ [MAIN_URI]: text });
    const cold = quietly(() => compiler.compile().program);
    expect(cold.chunks).toBeDefined();
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
    expect(program.chunks).toBeDefined();
    expect(generated).toBe(0);
  });
});

// No compile generates any more, so the spies are shown to hear a read of a
// runtime object and a filled container directly.
describe("the spies", () => {
  it("hear a parsed object's runtime object read and a runtime container filled", () => {
    class Generated extends ParsedObject {
      public override readonly GenerateRuntimeObject = () => new RuntimeContainer();
    }
    const { generated } = generationDuring(() => {
      const container = new RuntimeContainer();
      container.AddContent(new Generated().runtimeObject);
    });
    expect(generated).toBe(2);
  });
});
