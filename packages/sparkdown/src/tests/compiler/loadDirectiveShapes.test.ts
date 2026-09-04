// The `load` verb in every place the grammar accepts it: the `[[load …]]`
// directive passes validation, `load` on a nested arrow of a chain, on an
// alternator arm, and on a tunnel-onwards is seen by the lowerer (and warned
// about where it makes no sense), and `((load …))` names nothing.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: URI } });
  const messages: string[] = [];
  for (const list of Object.values(result.program.diagnostics ?? {})) {
    for (const d of list as any[]) {
      messages.push(typeof d.message === "string" ? d.message : d.message?.value ?? "");
    }
  }
  return { program: result.program, messages };
};

const SCENES = `
scene B
  In B.
end

scene C
  In C.
end
`;

describe("the load verb in every arrow and directive shape", () => {
  test("[[load …]] passes validation and records its targets", () => {
    const { program, messages } = compile(
      `scene A\n  [[load B C with fade]]\n  Hi.\nend\n${SCENES}`,
    );
    expect(messages.filter((m) => m.includes("Unrecognized command"))).toEqual([]);
    expect(program.sceneAssets?.["A"]?.loads).toEqual(["B", "C"]);
  });

  test("load on the second arrow of a chain is a diagnostic, and the chain keeps every successor", () => {
    const { program, messages } = compile(`scene A\n  -> B -> load C\nend\n${SCENES}`);
    expect(messages.some((m) => m.includes("`load` applies to a single target"))).toBe(true);
    expect(messages.filter((m) => m.includes("target not found"))).toEqual([]);
    expect(program.sceneAssets?.["A"]?.successors).toEqual(["B", "C"]);
  });

  test("load on a chain written as a choice or mid-line is the same diagnostic", () => {
    const choice = compile(`scene A\n  * Go -> load B -> C\n  * Stay\nend\n${SCENES}`);
    expect(choice.messages.some((m) => m.includes("`load` applies to a single target"))).toBe(true);
    const inline = compile(`scene A\n  Off we go. -> load B -> C\nend\n${SCENES}`);
    expect(inline.messages.some((m) => m.includes("`load` applies to a single target"))).toBe(true);
  });

  test("load inside an alternator arm lowers to a load beat", () => {
    const { program, messages } = compile(
      `scene A\n  cycle\n    | -> load B\n    | -> load C\n  end\nend\n${SCENES}`,
    );
    expect(messages.filter((m) => m.includes("target not found"))).toEqual([]);
    expect(program.sceneAssets?.["A"]?.loads).toEqual(expect.arrayContaining(["B", "C"]));
  });

  test("load on a tunnel-onwards is a diagnostic", () => {
    const { messages } = compile(
      `scene A\n  -> Helper ->\n  Back.\nend\n\nscene Helper\n  ->-> load B\nend\n${SCENES}`,
    );
    expect(messages.some((m) => m.includes("`load` needs a target"))).toBe(true);
  });

  test("((load …)) inside audio brackets names no load", () => {
    const { program } = compile(`scene A\n  ((load B))\n  Hi.\nend\n${SCENES}`);
    expect(program.sceneAssets?.["A"]?.loads ?? []).toEqual([]);
  });
});
