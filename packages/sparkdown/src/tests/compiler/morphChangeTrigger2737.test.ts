import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///main.sd";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="mouth.smile default"><path data-name="lip" d="M0,50 C30,75 70,75 100,50Z"/></g>
<g data-name="mouth.frown"><path data-name="lip" d="M0,50 C30,25 70,25 100,50Z"/></g>
</svg>`;

const SCENE = `scene start
  [[mia:mouth.smile]]
  Mia smiles.
  [[mia:mouth.frown]]
  Then she does not.
end
`;

function diagnosticsOf(text: string) {
  const source = `${text}\n${SCENE}`;
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" },
      { uri: "file:///mia.svg", type: "image", name: "mia", ext: "svg", data: FACE },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const lines = source.split("\n");
  return {
    program,
    diagnostics: (program.diagnostics?.[URI] ?? []).map((d) => {
      const { start, end } = d.range;
      return {
        message: typeof d.message === "string" ? d.message : d.message.value,
        severity: d.severity,
        text: start.line === end.line ? lines[start.line]!.slice(start.character, end.character) : lines[start.line]!.slice(start.character),
      };
    }),
  };
}

const bend = (body = "", timing = "") => `morph bend {
  method = match
${body}  timing {
    trigger = change
    duration = 0.08
${timing}  }
}
`;

describe("a morph with `trigger = change`", () => {
  test("is accepted with no keyframes, and the program marks it as a change morph", () => {
    const { program, diagnostics } = diagnosticsOf(bend());
    expect(diagnostics).toEqual([]);
    expect(program.morphs?.change).toEqual({ bend: {} });
    expect(program.morphs?.variants ?? {}).toEqual({});
  });

  test("warns that keyframes written in it are not used", () => {
    const keyframes = `  keyframes {
    from { mouth { state = smile } }
    to { mouth { state = frown } }
  }
`;
    const { diagnostics } = diagnosticsOf(bend(keyframes));
    expect(diagnostics).toEqual([
      {
        message:
          "`keyframes` is not used by a change morph: it plays from the drawing on screen to the drawing the new options choose. Remove it, or use `trigger = appear`.",
        severity: 2,
        text: "keyframes",
      },
    ]);
  });

  test("refuses the timing fields that only a morph with its own plays takes", () => {
    const { diagnostics } = diagnosticsOf(bend("", "    iterations = 2\n    direction = reverse\n"));
    expect(diagnostics.filter((d) => d.severity === 1).map((d) => [d.text, d.message])).toEqual([
      ["iterations", "`iterations` does not apply to a change morph: it plays once each time the options change. Remove it, or use `trigger = appear`."],
      ["direction", "`direction` does not apply to a change morph: it always plays from the old drawing to the new one. Remove it, or use `trigger = appear`."],
    ]);
  });

  test("the Portrait Morphs guide's change example compiles with no diagnostics, and its rules are the compiler's", () => {
    const chapter = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/guide/PortraitMorphs.md"), "utf8");
    const section = chapter.slice(chapter.indexOf("### Playing on a change"), chapter.indexOf("### Replaying part of a play"));
    const example = [...section.matchAll(/^```sparkdown\n([\s\S]*?)^```$/gm)].map((m) => m[1]!)[0]!;
    expect(example).toContain("trigger = change");
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        { uri: URI, type: "script", name: "main", ext: "sd", text: `${example}\nscene start\nend\n`, version: 1, languageId: "sparkdown" },
        { uri: "file:///mia.svg", type: "image", name: "mia", ext: "svg", data: FACE.replaceAll("smile", "open").replaceAll("frown", "closed") },
      ],
    } as any);
    const program = compiler.compile({ textDocument: { uri: URI } }).program;
    expect(program.diagnostics?.[URI] ?? []).toEqual([]);
    expect(program.morphs?.change).toEqual({ bend: {} });
    expect(section).toContain("Keyframes written in it are not used, and get a warning.");
    expect(section).toContain("It takes no `iterations`, `direction`, `iteration_delay_min`, `iteration_delay_max` or `replay`.");
    expect(chapter).toContain("`change` when the options of a portrait already on screen change ([Playing on a change](#playing-on-a-change))");
  });

  test("refuses `replay`", () => {
    const { diagnostics } = diagnosticsOf(bend("  replay {\n    chance = 50%\n  }\n"));
    expect(diagnostics.filter((d) => d.severity === 1).map((d) => d.message)).toEqual([
      "`replay` does not apply to a change morph: it plays once, from the old drawing to the new one. Remove it, or use `trigger = appear`.",
    ]);
  });

  test("names `change` among the triggers when the value is unknown", () => {
    const { diagnostics } = diagnosticsOf(bend().replace("trigger = change", "trigger = swap"));
    expect(diagnostics.map((d) => d.message)).toContain("`swap` is not a `trigger`. Use `appear`, `speech` or `change`.");
  });
});
