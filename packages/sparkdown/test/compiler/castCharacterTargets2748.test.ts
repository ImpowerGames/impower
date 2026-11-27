import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
import { guideExamples } from "./guideExamples";

const URI = "file:///main.sd";

const PICTURES = ["mia@happy", "sam@calm"].map((name) => ({
  uri: `file:///${name}.png`,
  type: "image",
  name,
  ext: "png",
  src: `https://example.com/${name}.png`,
}));

const HEADER = `define mia as character with
  name = "MIA"
end

define sam as character with
  name = "SAM"
end

define nobody as character with
  name = "NOBODY"
end

layout main {
  stage {
    cast {
      actor {
        portrait { image }
      }
    }
  }
}
`;

function diagnostics(story: string): { message: string; line: string }[] {
  const text = `${HEADER}\n${story}`;
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      ...PICTURES,
    ] as never,
  });
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? [])
    .toSorted((a, b) => a.range.start.line - b.range.start.line)
    .map((d) => ({
      message: typeof d.message === "string" ? d.message : (d.message as { value: string }).value,
      line: lines[d.range.start.line]!.trim(),
    }));
}

describe("hide and animate take a character's name (#2748)", () => {
  test("a character with pictures is accepted after hide and animate", () => {
    expect(
      diagnostics(`scene start
  [[mia@happy at left]]
  MIA: You came.
  [[animate mia to center over 1s]]
  [[animate mia with shake]]
  [[hide mia]]
  Gone.
end
`),
    ).toEqual([]);
  });

  test("a name that is neither a layer nor a character with pictures is still unknown", () => {
    const found = diagnostics(`scene start
  [[hide nmae]]
  [[animate nobody with shake]]
  Gone.
end
`);
    expect(found.map((d) => d.line)).toEqual(["[[hide nmae]]", "[[animate nobody with shake]]"]);
    expect(found.every((d) => d.message.startsWith("Cannot find layer named"))).toBe(true);
  });

  test("a name that is both a layer and a character warns that the layer is used", () => {
    const found = diagnostics(`layout extra {
  mia { image }
}

scene start
  [[hide mia]]
  [[animate mia with shake]]
  [[show mia mia@happy]]
  Gone.
end
`);
    const warning = "`mia` names a layer and a character. `hide` and `animate` use the layer.";
    expect(found).toEqual([
      { message: warning, line: "[[hide mia]]" },
      { message: warning, line: "[[animate mia with shake]]" },
    ]);
  });

  test("the guide's example of hiding and animating one character compiles with no diagnostics", () => {
    const [example, ...rest] = guideExamples("Streams.md").filter((e) => e.code.includes("[[hide mia]]"));
    expect(rest).toEqual([]);
    expect(diagnostics(example!.code)).toEqual([]);
  });
});
