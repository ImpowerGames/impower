import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { filterImage } from "../../compiler/utils/filterImage";
import { getImageThing } from "../../compiler/utils/getImageThing";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file:///proj/main.sd";
const IMAGE_URI = "file:///proj/images/mia@night.svg";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g data-name="face.happy:default" id="happy"/><g data-name="face.sad" id="sad"/><g data-name="hat.on" id="hat"/></svg>`;

const fileName = (uri: string) => SparkdownWorkspace.prototype.getFileName.call(undefined, uri);

const compile = (text: string): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      { uri: IMAGE_URI, type: "image", name: fileName(IMAGE_URI), ext: "svg", data: SVG },
    ],
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
};

const messages = (program: SparkProgram) =>
  (program.diagnostics?.[MAIN] ?? []).map((d) => `${d.range.start.line}:${d.code ?? ""}: ${typeof d.message === "string" ? d.message : d.message.value}`);

const drawn = (program: SparkProgram, type: string, name: string) =>
  decodeURIComponent(filterImage(program.context!, program.context?.[type]?.[name]).src ?? "");

const LOOK = `define mia@party as filtered_image with
  image = image.mia@night
  attributes = { "sad", "hat" }
end
`;

describe("@ inside names (#2109)", () => {
  it("names a project file thing@alternate.ext the image thing@alternate, in the web editor's and VS Code's URIs", () => {
    expect(fileName(IMAGE_URI)).toBe("mia@night");
    expect(fileName("file:///c%3A/proj/images/mia%40night.svg")).toBe("mia@night");
    expect(compile("").context?.["image"]?.["mia@night"]).toMatchObject({ $type: "image", $name: "mia@night" });
  });

  it("shows the image from a directive with and without options", () => {
    const program = compile(`scene start
  [[mia@night]]
  [[mia@night:sad]]
  [[mia@night~hat]]
end
`);
    expect(messages(program)).toEqual([]);
    expect(program.context?.["filtered_image"]?.["mia@night~sad"]?.attributes).toEqual(["sad"]);
    expect(drawn(program, "filtered_image", "mia@night~sad")).toMatch(/id=['"]sad['"]/);
    expect(drawn(program, "filtered_image", "mia@night~sad")).not.toMatch(/id=['"]happy['"]/);
    expect(program.context?.["filtered_image"]?.["mia@night~hat"]?.attributes).toEqual(["hat"]);
  });

  it("resolves a named look built on the image, alone and in a composition", () => {
    const program = compile(`${LOOK}
scene start
  [[mia@party]]
  [[mia@party:happy]]
  [[mia@night + mia@party:hat]]
end
`);
    expect(messages(program)).toEqual([]);
    expect(program.context?.["filtered_image"]?.["mia@party"]?.image).toMatchObject({ $name: "mia@night" });
    const party = drawn(program, "filtered_image", "mia@party");
    expect(party).toMatch(/id=['"]sad['"]/);
    expect(party).toMatch(/id=['"]hat['"]/);
    expect(party).not.toMatch(/id=['"]happy['"]/);
  });

  it("reads image.thing@alternate in a struct body as a reference to the image", () => {
    const program = compile(`style card {
  background_image = image.mia@night
}

scene start
end
`);
    expect(messages(program)).toEqual([]);
    expect(program.context?.["style"]?.["card"]?.background_image).toEqual({ $type: "image", $name: "mia@night" });
  });

  it("records each image's thing, the part of its name before the first @", () => {
    const program = compile(`${LOOK}
define mia_plain as filtered_image with
  image = image.mia@night
end
`);
    expect(program.imageThings).toMatchObject({ "mia@night": "mia", "mia@party": "mia", mia_plain: "mia_plain" });
    expect(program.imageThings?.["mia@night~sad"]).toBeUndefined();
    expect(compile("[[mia@night:sad]]").imageThings?.["mia@night~sad"]).toBe("mia");
    expect(getImageThing("raffles@confident@left")).toBe("raffles");
    expect(getImageThing("raffles")).toBe("raffles");
  });

  it.each(["nonstrict", "strict"])("type checks Luau code that uses @ names without a diagnostic in %s mode", (mode) => {
    const program = compile(`---
title: At names
typecheck: ${mode}
---

${LOOK}
store word@count = 0

function count@all(text: string): number
  local seen@here = #text
  return seen@here + word@count
end

scene start
  & word@count = count@all("abc")
  & local look = image.mia@night
  & local party = filtered_image.mia@party
  [[mia@party]]
  The count is {word@count}.
end
`);
    expect(messages(program)).toEqual([]);
  });

  it.each([
    ["a doubled @", "define mia@@night as filtered_image with\n  image = image.mia@night\nend\n"],
    ["a trailing @", "define mia@ as filtered_image with\n  image = image.mia@night\nend\n"],
    ["a leading @", "define @mia as filtered_image with\n  image = image.mia@night\nend\n"],
    ["a doubled @ in an as parent", "define mia_look as mia@@night with\nend\n"],
    ["a doubled @ in a style header", "style card@@x {\n  opacity = 0.5\n}\n"],
  ])("explains the @ rule when a header holds %s", (_, header) => {
    const program = compile(`${header}\nscene start\nend\n`);
    const explained = messages(program).filter((message) => message.includes("may hold an `@` between two of those characters"));
    expect(explained, messages(program).join("\n")).toHaveLength(1);
  });

  it("type checks an @ name as the value it holds", () => {
    const program = compile(`---
title: At names
typecheck: strict
---

store word@count = 0

scene start
  & local label@text: string = word@count
end
`);
    expect(messages(program)).toEqual(["8:TypeMismatch: Expected this to be 'string', but got 'number'"]);
  });
});
