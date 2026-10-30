import { describe, expect, it } from "vitest";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { testCompiler, testStory } from "../engineUnderTest";

const URI = "file:///main.sd";

function run(text: string) {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const result = compiler.compile({ textDocument: { uri: URI } } as never) as any;
  const errors = (result.program.diagnostics?.[URI] ?? [])
    .filter((d: any) => d.severity === DiagnosticSeverity.Error)
    .map((d: any) => (typeof d.message === "string" ? d.message : d.message.value));
  const story = testStory(result.program.chunks);
  const output = story.ContinueMaximally();
  return { total: story.variablesState.$("total"), output, errors };
}

const inScene = (line: string) =>
  [
    "store total = 0",
    "",
    "scene start",
    `  ${line}`,
    "  after",
    "end",
    "",
  ].join("\n");

const CASES: [string, number][] = [
  ["& for i = 1, 3 do total = total + i end", 6],
  ["& for i = 1, 3 do total += i end", 6],
  ["& for _, v in { 1, 2, 3 } do total += v end", 6],
  ["& while total < 20 do total = total + 1 end", 20],
  ["& while total < 20 do total += 1 end", 20],
  ["& repeat total += 1 until total >= 4", 4],
  ["& if true then total = 7 end", 7],
  ["& if false then total = 7 else total = 8 end", 8],
  ["& if false then total = 7 elseif true then total = 9 end", 9],
  ["& do total = 9 end", 9],
  ["& for i = 1, 2 do if i == 2 then total += 10 end end", 10],
  ["& for i = 1, 3 do while total < i do total += 1 end end", 3],
];

describe("a one-line marked control statement runs", () => {
  it.each(CASES)("in a scene: %s", (line, expected) => {
    const { total, output, errors } = run(inScene(line));
    expect(errors).toEqual([]);
    expect(total).toBe(expected);
    expect(output).toContain("after");
  });

  it("the multi-line form still runs", () => {
    const { total } = run(
      inScene(["for i = 1, 3 do", "    total += i", "  end"].join("\n")),
    );
    expect(total).toBe(6);
  });
});
