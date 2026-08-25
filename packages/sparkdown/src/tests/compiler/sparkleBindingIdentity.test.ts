// Binding evaluator names, and the loop-variable list handed to them.
//
// Both produced severity-1 errors in the Problems panel for source that is
// legal, and one of them also produced WRONG OUTPUT — two layouts resolving to
// a single evaluator, so one rendered the other's value.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const mk = (name: string, text: string) => ({
  uri: `inmemory:///${name}.sd`,
  type: "script" as const,
  name,
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

function compileFiles(files: Record<string, string>) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: Object.entries(files).map(([n, t]) => mk(n, t)),
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const diagnostics: string[] = [];
  for (const list of Object.values(result.program.diagnostics ?? {})) {
    for (const d of list as any[]) {
      diagnostics.push(
        typeof d.message === "string" ? d.message : d.message?.value ?? "",
      );
    }
  }
  return { program: result.program, diagnostics };
}

const bindingIds = (program: unknown): string[] => [
  ...new Set(JSON.stringify(program).match(/__binding_[A-Za-z0-9_]+/g) ?? []),
];

describe("binding ids are unique across files", () => {
  // The id was the node's byte offset within its OWN file, but every hoisted
  // evaluator lands in one flow namespace. Two files whose bindings start at
  // the same offset — near-inevitable for a copy-and-adapt pair of layouts —
  // both minted `__binding_35`.
  const FILES = {
    main: `include fa.sd\ninclude fb.sd\n-> END\n`,
    fa: `store a = 1\nlayout la with\n  text "{a}"\nend\n`,
    fb: `store b = 2\nlayout lb with\n  text "{b}"\nend\n`,
  };

  test("two files colliding on byte offset get distinct evaluators", () => {
    const { program, diagnostics } = compileFiles(FILES);
    // Both layouts compiled…
    expect(Object.keys(program.sparkle?.layouts ?? {})).toEqual(
      expect.arrayContaining(["la", "lb"]),
    );
    // …with one evaluator each, not one shared between them.
    expect(bindingIds(program).length).toBe(2);
    expect(
      diagnostics.filter((m) => m.includes("Duplicate identifier")),
    ).toEqual([]);
  });
});

describe("a shadowed loop variable is not a compile error", () => {
  // The loop-var stack is push/restore, so an inner loop re-binding an outer
  // name put BOTH on it; handing both to the evaluator produced
  // `params: ["i","i"]` and "Multiple arguments with the same name" on every
  // keystroke — for a construct that is legal Luau in this same language.
  test("nested loops binding the same name compile clean", () => {
    const { diagnostics } = compileFiles({
      main: `store rows = { 1 }
store cols = { 2 }
layout main with
  for i in rows do
    for i in cols do
      text "{i}"
    end
  end
end
`,
    });
    expect(
      diagnostics.filter((m) => m.includes("same name")),
    ).toEqual([]);
  });

  test("a loop re-binding a component param compiles clean", () => {
    const { diagnostics } = compileFiles({
      main: `store items = { 1 }
component card(item) with
  for item in items do
    text "{item}"
  end
end
layout main with
  card(1)
end
`,
    });
    expect(
      diagnostics.filter((m) => m.includes("same name")),
    ).toEqual([]);
  });
});
