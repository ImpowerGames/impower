import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";
import { buildSVGAttributeVocabulary } from "../../attributes";
import { resolveImageSrcs } from "../../../../spark-web-player/src/main/utils/resolveImageSrcs";

const uri = "file:///portrait-review/main.sd";
const asset = (path: string): File => ({
  uri: `file:///portrait-review/assets/${path}`, type: "image",
  name: path.split("/").at(-1)!.split(".")[0]!, ext: path.split(".").at(-1)!,
  src: `/file:/local/assets/${path}?v=1`,
});
const compile = (assets: File[], text = "") => {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [
    { uri, name: "main", type: "script", ext: "sd", text, version: 1, languageId: "sparkdown" },
    ...assets,
  ] });
  return compiler.compile({ textDocument: { uri } }).program!;
};
const collisions = (program: any) => Object.values(program.diagnostics ?? {}).flat()
  .filter((d: any) => String(d.message?.value ?? d.message).includes("Asset name collision"));

describe("portrait asset review regressions", () => {
  it("keeps a numbered scene available by its existing image name", () => {
    const program = compile([asset("scenes/01_intro.png")]);
    expect(program.context?.["image"]?.["01_intro"]?.src).toContain("01_intro.png");
  });

  it("does not collide shared private layer filenames across distinct portraits", () => {
    const program = compile([asset("mia/90_body.png"), asset("max/90_body.png")]);
    expect(collisions(program)).toEqual([]);
    for (const name of ["mia", "max"]) {
      expect(resolveImageLayers(program.context, program.context?.["layered_image"]?.[name])[0]?.src)
        .toContain(`/${name}/90_body.png`);
    }
  });

  it("diagnoses same-named portrait folders independent of input ordering", () => {
    const assets = [asset("heroes/mia/90_body.png"), asset("npcs/mia/90_body.png")];
    const first = compile(assets);
    const reverse = compile([...assets].reverse());
    expect(collisions(first).length).toBeGreaterThanOrEqual(2);
    expect(collisions(reverse).length).toBeGreaterThanOrEqual(2);
    expect(first.context?.["layered_image"]?.["mia"]?.uri)
      .toBe(reverse.context?.["layered_image"]?.["mia"]?.uri);
  });

  it("diagnoses an ordinary image sharing a generated portrait name", () => {
    expect(collisions(compile([asset("mia.png"), asset("mia/90_body.png")])).length)
      .toBeGreaterThanOrEqual(2);
  });

  it("an authored layered image remains an intentional override", () => {
    const program = compile([asset("plain.png"), asset("mia/90_body.png")],
      "define mia as layered_image with\n  assets = { plain }\nend\n");
    expect(collisions(program)).toEqual([]);
    expect(resolveImageLayers(program.context, program.context?.["layered_image"]?.["mia"])[0]?.src)
      .toContain("plain.png");
  });

  it("preloads colon attributes using the same ordered selection as tilde syntax", () => {
    const vocabulary = buildSVGAttributeVocabulary('<svg><g data-name="hat.on"/></svg>');
    const context = { image: { mia: { $type: "image", $name: "mia", ext: "svg",
      src: "/file:/local/assets/mia.svg?v=1", attribute_vocabulary: vocabulary } },
      filtered_image: { "mia~hat": { $type: "filtered_image", $name: "mia~hat",
        image: { $type: "image", $name: "mia" }, attributes: ["hat"] } } };
    const tilde = resolveImageSrcs(context, ["mia~hat"]);
    expect(tilde).toHaveLength(1);
    expect(resolveImageSrcs(context, ["mia:hat"])).toEqual(tilde);
  });
});
