import { describe, expect, test } from "vitest";
import { compileScript } from "../program/programHarness";

interface Found {
  severity: number | undefined;
  line: number;
  word: string;
  message: string;
}

const NO_END = "Scene is missing its closing";

function compiled(text: string) {
  const { program } = compileScript(text);
  const lines = text.split("\n");
  const found: Found[] = Object.values(program.diagnostics ?? {})
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

describe("the stream block (I-2743)", () => {
  test("a stream block compiles into the program with its settings as written", () => {
    const { program, found } = compiled(`${PHONE}\nstream phone {\n  advance = auto\n  pause = 0.6s\n}\n${SCENE}`);
    expect(program.context?.["stream"]?.["phone"]).toMatchObject({
      $type: "stream",
      $name: "phone",
      advance: "auto",
      pause: "0.6s",
    });
    expect(found).toEqual([]);
    expect(program.sparkle?.layouts?.["phone"]).toBeDefined();
  });

  test("a stream block carries the built-in values for the settings it leaves out", () => {
    const { program, found } = compiled(`${PHONE}\nstream phone {\n  pause = 250ms\n}\n${SCENE}`);
    expect(program.context?.["stream"]?.["phone"]).toMatchObject({ advance: "click", pause: "250ms" });
    expect(program.context?.["stream"]?.["$default"]).toMatchObject({ advance: "click", pause: "0.4s" });
    expect(found).toEqual([]);
  });

  test("`define NAME as stream` is refused with the keyword form, as the other struct keywords are", () => {
    const source = `${PHONE}\ndefine phone as stream with\n  advance = "auto"\nend\n${SCENE}`;
    const line = source.split("\n").findIndex((text) => text.startsWith("define phone"));
    expect(compiled(source).found).toEqual([
      {
        severity: 1,
        line,
        word: "stream",
        message:
          "A stream is declared with its own keyword: `stream NAME { … }`. `define` bodies are Luau and cannot hold style values.",
      },
    ]);
  });

  test("a stream block that names no layout is warned at its name", () => {
    const source = `${PHONE}\nstream phnoe {\n  advance = auto\n}\n${SCENE}`;
    const line = source.split("\n").findIndex((text) => text.startsWith("stream phnoe"));
    expect(compiled(source).found).toEqual([
      { severity: 2, line, word: "phnoe", message: "No layout is named `phnoe`." },
    ]);
  });

  test("an unknown setting and wrong values are reported at their words", () => {
    const source = `${PHONE}\nstream phone {\n  advance = sometimes\n  pause = soon\n  clearing = run\n}\n${SCENE}`;
    const lines = source.split("\n");
    const at = (text: string) => lines.findIndex((line) => line.trim().startsWith(text));
    expect(compiled(source).found.map(({ line, word, severity }) => [line, word, severity])).toEqual([
      [at("advance"), "sometimes", 1],
      [at("pause"), "soon", 1],
      [at("clearing"), "clearing", 1],
    ]);
  });

  test("a pause written as a number of seconds or in milliseconds compiles", () => {
    for (const pause of ["1", "600ms", ".5s", "2.5s"]) {
      expect(compiled(`${PHONE}\nstream phone {\n  pause = ${pause}\n}\n${SCENE}`).found, pause).toEqual([]);
    }
  });

  test("a pause the game could not read as a time is reported at its value", () => {
    for (const pause of ["1.s", "-1s", "-1"]) {
      const source = `${PHONE}\nstream phone {\n  pause = ${pause}\n}\n${SCENE}`;
      const line = source.split("\n").findIndex((text) => text.trim().startsWith("pause"));
      expect(
        compiled(source).found.map(({ line, word, severity }) => [line, word, severity]),
        pause,
      ).toEqual([[line, pause, 1]]);
    }
  });
});
