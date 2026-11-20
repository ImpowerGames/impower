import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";
import { resolveImageReference } from "../../compiler/utils/resolveImageReference";
import { sortFilteredName } from "../../compiler/utils/sortFilteredName";
import { resolveImageSrcs } from "../../../../spark-web-player/src/main/utils/resolveImageSrcs";

const URI = "file:///main.sd";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g data-name="face.happy default" id="happy"/><g data-name="face.sad" id="sad"/><g data-name="hat.on" id="hat"/></svg>`;
const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [
    { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
    { uri: "file:///mia.svg", type: "image", name: "mia", ext: "svg", data: SVG },
  ] });
  return compiler.compile({ textDocument: { uri: URI } }).program!;
};
const messages = (program: ReturnType<typeof compile>) =>
  (program.diagnostics?.[URI] ?? []).map((diagnostic) => ({
    line: diagnostic.range.start.line,
    message: typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value,
  }));
const shown = (program: ReturnType<typeof compile>, asset: string) => {
  const image = resolveImageReference(program.context, { $type: "", $name: sortFilteredName(asset) });
  return resolveImageLayers(program.context, image).map((layer) => layer.src);
};

describe("only the colon marks an option in a directive", () => {
  it("reads [[mia~hat]] as one unknown name that shows nothing", () => {
    const program = compile("[[mia~hat]]");
    const missing = messages(program).filter((entry) => entry.message.startsWith("Cannot find image"));
    expect(missing).toEqual([{ line: 0, message: expect.stringContaining("`mia~hat`") }]);
    expect(missing[0]!.message).not.toMatch(/:/);
    expect(Object.keys(program.context?.["filtered_image"] ?? {}).filter((name) => name.includes("hat"))).toEqual([]);
    expect(shown(program, "mia~hat")).toEqual([]);
    expect(resolveImageSrcs(program.context!, ["mia~hat"])).toEqual([]);
  });

  it("keeps [[mia~hat]] unknown when [[mia:hat]] appears elsewhere in the project", () => {
    const program = compile("[[mia:hat]]\n[[mia~hat]]");
    const missing = messages(program).filter((entry) => entry.message.startsWith("Cannot find image"));
    expect(missing).toEqual([{ line: 1, message: expect.stringContaining("`mia~hat`") }]);
    expect(shown(program, "mia:hat").length).toBeGreaterThan(0);
    expect(shown(program, "mia~hat")).toEqual([]);
    expect(resolveImageSrcs(program.context!, ["mia~hat"])).toEqual([]);
  });

  it("reads a tilde-joined name with dotted options as one unknown name", () => {
    const program = compile("scene start\n  [[mia~face.happy~hat]]\nend\n");
    const missing = messages(program).filter((entry) => entry.message.startsWith("Cannot find image"));
    expect(missing).toEqual([{ line: 1, message: expect.stringContaining("`mia~face.happy~hat`") }]);
    expect(shown(program, "mia~face.happy~hat")).toEqual([]);
  });

  it("reports a tilde after a colon option as invalid syntax at the tilde, on image and sound lines", () => {
    const program = compile("scene start\n  [[mia:happy~hat]]\n  ((bark:loud~soft))\nend\n");
    const invalid = (program.diagnostics?.[URI] ?? [])
      .filter((diagnostic) => (typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value) === "Invalid syntax")
      .map((diagnostic) => [diagnostic.range.start.line, diagnostic.range.start.character, diagnostic.range.end.character]);
    expect(invalid).toEqual([[1, 13, 14], [2, 13, 14]]);
  });

  it("still reads [[mia:happy:hat]] as the image mia with its options", () => {
    const program = compile("scene start\n  [[mia:happy:hat]]\nend\n");
    expect(messages(program)).toEqual([]);
    const look = resolveImageReference(program.context, { $type: "", $name: sortFilteredName("mia:happy:hat") });
    expect(look).toMatchObject({ $type: "filtered_image", image: { $name: "mia" }, attributes: ["happy", "hat"] });
    expect(shown(program, "mia:happy:hat").length).toBeGreaterThan(0);
  });
});
