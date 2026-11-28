import { describe, expect, test } from "vitest";
import { compileScript } from "../program/programHarness";
import { guideExamples } from "./guideExamples";

const NO_END = "Scene is missing its closing";

function compiled(text: string) {
  const { program } = compileScript(text);
  const lines = text.split("\n");
  const found = Object.values(program.diagnostics ?? {})
    .flat()
    .map((d) => {
      const { start, end } = d.range;
      return {
        severity: d.severity,
        line: start.line,
        word: start.line === end.line ? lines[start.line]!.slice(start.character, end.character) : "",
        message: typeof d.message === "string" ? d.message : d.message.value,
      };
    })
    .filter((d) => !d.message.startsWith(NO_END));
  return { program, found };
}

const PHONE = `define RAFFLES as character with
  name = "RAFFLES"
end

layout phone {
  thread {
    stream {
      dialogue.bubble { text }
    }
  }
}
`;

const SCENE = "\nscene start\n  [[open phone]]\n  RAFFLES: slight problem\nend\n";

const block = (lines: string) => `${PHONE}\nstream phone {\n${lines}\n}\n${SCENE}`;

describe("the `clear` and `carry` stream settings (I-2745)", () => {
  test("a stream block accepts both settings and compiles them as written", () => {
    const { program, found } = compiled(block("  advance = auto\n  clear = run\n  carry = 1"));
    expect(found).toEqual([]);
    expect(program.context?.["stream"]?.["phone"]).toMatchObject({
      advance: "auto",
      clear: "run",
      carry: 1,
    });
  });

  test("the built-in values are `never` and `0`", () => {
    const { program, found } = compiled(block("  clear = never"));
    expect(found).toEqual([]);
    expect(program.context?.["stream"]?.["phone"]).toMatchObject({ clear: "never", carry: 0 });
    expect(program.context?.["stream"]?.["$default"]).toMatchObject({ clear: "never", carry: 0 });
  });

  test("a value outside the table is reported at the value", () => {
    for (const [setting, value] of [
      ["clear", "always"],
      ["clear", "2"],
      ["carry", "-1"],
      ["carry", "1.5"],
      ["carry", "all"],
    ]) {
      const source = block(`  ${setting} = ${value}`);
      const line = source.split("\n").findIndex((text) => text.trim().startsWith(setting!));
      const found = compiled(source).found;
      expect(
        found.map(({ line, word, severity }) => [line, word, severity]),
        `${setting} = ${value}`,
      ).toEqual([[line, value, 1]]);
      expect(found[0]!.message.startsWith(`\`${setting}\` should be`)).toBe(true);
    }
  });

  test("the guide's clearing example compiles with no diagnostics", () => {
    const examples = guideExamples("Streams.md")
      .map((example) => example.code)
      .filter((code) => code.includes("carry = 1"));
    expect(examples).toHaveLength(1);
    const { program, found } = compiled(examples[0]!);
    expect(found.filter((d) => !d.message.startsWith("Cannot find character named"))).toEqual([]);
    expect(program.context?.["stream"]?.["phone"]).toMatchObject({ clear: "run", carry: 1 });
  });

  test("an unknown setting names all four settings", () => {
    const { found } = compiled(block("  clearing = run"));
    expect(found.map(({ word, message }) => [word, message.split("\n")[0]])).toEqual([
      [
        "clearing",
        "`clearing` is not a stream setting. A stream sets `advance`, `pause`, `clear` and `carry`.",
      ],
    ]);
  });
});
