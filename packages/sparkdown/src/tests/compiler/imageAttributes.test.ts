import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { filterImage } from "../../compiler/utils/filterImage";
import { sortFilteredName } from "../../compiler/utils/sortFilteredName";

const URI = "file:///main.sd";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g data-name="face.happy:default" id="happy"/><g data-name="face.sad" id="sad"/><g data-name="hat.on" id="hat"/><g data-name="look.far-left:default" id="left"/></svg>`;
const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [
    { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
    { uri: "file:///mia.svg", type: "image", name: "mia", ext: "svg", data: SVG },
  ] });
  return compiler.compile({ textDocument: { uri: URI } }).program;
};

describe("image attributes in scripts", () => {
  it("keeps plain image references working", () => {
    expect(compile("[[mia]]").context?.["image"]?.["mia"]).toBeDefined();
  });
  it.each([":", "~"])("preserves ordered attributes with %s and clauses", (separator) => {
    const program = compile(`[[mia${separator}happy${separator}hat${separator}look.far-left with dissolve]]`);
    expect(program.context?.["filtered_image"]?.["mia~happy~hat~look.far-left"]?.attributes).toEqual(["happy", "hat", "look.far-left"]);
  });
  it("canonicalizes separators without sorting competing choices", () => {
    expect(sortFilteredName("mia:sad:happy")).toBe("mia~sad~happy");
    expect(sortFilteredName("mia~sad~happy")).toBe("mia~sad~happy");
    expect(sortFilteredName("mia:happy:sad")).not.toBe(sortFilteredName("mia:sad:happy"));
  });
  it("applies a named look before the directive override", () => {
    const program = compile(`define mia_party as filtered_image with
  image = mia
  attributes = { "happy" }
end
[[mia_party:sad]]`);
    const look = program.context?.["filtered_image"]?.["mia_party~sad"];
    filterImage(program.context!, look);
    const src = decodeURIComponent(look?.filtered_src ?? "");
    expect(src).toMatch(/id=['"]sad['"]/);
    expect(src).not.toMatch(/id=['"]happy['"]/);
  });
  it("warns about an unavailable attribute on its directive", () => {
    const program = compile("[[mia:look.nowhere]]");
    const diagnostic = program.diagnostics?.[URI]?.find((diagnostic) => String(typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value).includes('no attribute "look.nowhere"'));
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.range.start.line).toBe(0);
  });
  it("resolves dotted attribute names without hiding missing image warnings", () => {
    const program = compile("[[mia:look.far-left]]\n[[missing:look.far-left]]");
    const missing = program.diagnostics?.[URI]?.map((diagnostic) =>
      typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value,
    ).filter((message) => message.startsWith("Cannot find image")) ?? [];
    expect(missing.some((message) => message.includes("mia~look.far-left"))).toBe(false);
    expect(missing.some((message) => message.includes("`missing`"))).toBe(true);
  });
  it("recomputes a look after its ordered attributes change", () => {
    const program = compile("[[mia:happy]]");
    const look = program.context?.["filtered_image"]?.["mia~happy"];
    filterImage(program.context!, look);
    look.attributes = ["sad"];
    filterImage(program.context!, look);
    expect(look.filtered_src).toMatch(/id=['"]sad['"]/);
    expect(look.filtered_src).not.toMatch(/id=['"]happy['"]/);
  });
});
