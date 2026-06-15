// Regression coverage for two coupled grammar/lowering fixes driven by the
// real production screenplay port:
//
// 1. Luau comments (`--`, `---`) are recognized ONLY in Luau-code contexts
//    (function/closure/define bodies, expressions) — never in display/prose.
//    Display uses `--` for em-dashes and `---` for the title-page fence, so
//    the old `Annotation → #LuauComment` include wrongly (a) ate the opening
//    `---` as a `---` doc comment, making the title page parse as dialogue
//    (`title:` → character cue "title"), and (b) turned every prose em-dash
//    into a line comment. Fixed by dropping `#LuauComment` from `Annotation`.
//
// 2. A typed OOP define (`define X as character`) now registers its scalar
//    properties into the compile-time struct registry (program.context +
//    contextPropertyRegistry), so the engine's reference resolver can match
//    a dialogue cue (`RAFFLES:`) to its character by `name`. Previously the
//    OOP-define StructDefinition serialized empty, so every cue warned and
//    no portrait rendered.

import { describe, expect, test } from "vitest";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compile(src: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "file:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: src,
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "file:///main.sd" },
  });
  const docs: any = (compiler as any).documents;
  const tree = String(
    printTree(docs.tree("file:///main.sd"), docs.get("file:///main.sd")),
  );
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) {
      const m = typeof d?.message === "string" ? d.message : d?.message?.value;
      if (d?.severity === 1 || d?.severity == null) errors.push(m);
      else if (d?.severity === 2) warnings.push(m);
    }
  }
  return { tree, errors, warnings, program: result.program };
}

describe("front matter vs luau comment context", () => {
  test("`---` opens front matter, not a `---` doc comment", () => {
    const { tree, warnings } = compile(
      `---\ntitle: My Title\ncredit: Written by\nauthor: Someone\n---\n\n-> main\n\nscene main\n  Hi.\n  done\nend\n`,
    );
    expect(tree).toContain("FrontMatter");
    expect(tree).toContain("FrontMatterFieldKeyword");
    expect(tree).not.toContain("LuauDocLineComment");
    // No "Cannot find character named `title`" etc.
    expect(warnings.filter((w) => /Cannot find character/.test(w))).toEqual([]);
  });

  test("`--` in prose / dialogue is an em-dash, not a comment", () => {
    const { tree } = compile(
      `-> main\n\nscene main\n  He turned -- slowly -- and left.\n  BUNNY:\n    Wait --\n  done\nend\n`,
    );
    expect(tree).not.toContain("LuauLineComment");
    expect(tree).not.toContain("LuauCommentMark");
  });

  test("`--` comment still works inside a function body", () => {
    const { tree } = compile(
      `function greet()\n  local x = 5 -- a real comment\n  return x\nend\n`,
    );
    expect(tree).toContain("LuauLineComment");
  });
});

describe("typed OOP define registers in the struct registry", () => {
  test("`define X as character` resolves a dialogue cue by name", () => {
    const { warnings, program } = compile(
      `define raffles as character with\n  name = "RAFFLES"\nend\n\n-> main\n\nscene main\n  RAFFLES:\n    Hello.\n  done\nend\n`,
    );
    expect(warnings.filter((w) => /Cannot find character/.test(w))).toEqual([]);
    expect(program.context?.["character"]?.["raffles"]).toMatchObject({
      $type: "character",
      $name: "raffles",
      name: "RAFFLES",
    });
  });
});
