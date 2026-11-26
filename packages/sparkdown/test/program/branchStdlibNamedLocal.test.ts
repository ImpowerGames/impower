import { describe, expect, test } from "vitest";
import { compileScript } from "./programHarness";

const diagnosticsOf = (lines: string[]) => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    const { program } = compileScript([...lines, ""].join("\n"));
    return Object.values(program.diagnostics ?? {})
      .flat()
      .map((d: any) => [d.severity, d.message?.value ?? d.message]);
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const sceneWithBranch = (declaration: string[], read: string) => [
  "scene start",
  ...declaration.map((line) => `  ${line}`),
  "  -> b",
  "  branch b",
  `    ${read}`,
  "    done",
  "  end",
  "end",
];

const choiceDeclaresMath = [
  "choose",
  "  + [A]",
  "    local math = { answer = 4 }",
  "  + [B]",
  "    B.",
  "end",
];

describe("a branch reads its scene's local named like a library", () => {
  test("a direct dotted read of a choice's local does not warn", () => {
    expect(diagnosticsOf(sceneWithBranch(choiceDeclaresMath, "Got {math.answer}."))).toEqual([]);
  });

  test("a closure returning a choice's local does not warn", () => {
    expect(
      diagnosticsOf(
        sceneWithBranch(choiceDeclaresMath, "local g = function() return math end"),
      ),
    ).toEqual([]);
  });

  test("a direct dotted read of a scene body local does not warn", () => {
    expect(
      diagnosticsOf(sceneWithBranch(["local math = { answer = 4 }"], "Got {math.answer}.")),
    ).toEqual([]);
  });

  test("a read of a name nothing declares still warns", () => {
    expect(diagnosticsOf(sceneWithBranch([], "Got {nothing.answer}."))).toEqual([
      [2, "Cannot find item or path named `nothing.answer`"],
    ]);
  });
});
