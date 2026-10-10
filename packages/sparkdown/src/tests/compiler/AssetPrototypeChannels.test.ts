import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { ProgramTransportDecoder, ProgramTransportEncoder } from "../../workspace/utils/programTransport";
import { resolveImageReference } from "../../compiler/utils/resolveImageReference";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";

const names = ["ordinary", "toString", "constructor", "hasOwnProperty", "__proto__"];
const extensions = { image: "png", audio: "mp3", font: "ttf", video: "mp4" } as const;

const compileAsset = (type: keyof typeof extensions, name: string, svg = false) => {
  const uri = "file:///project/main.sd";
  const ext = svg ? "svg" : extensions[type];
  const src = `file:///project/assets/${name}.${ext}`;
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [
    { uri, type: "script", name: "main", ext: "sd", text: "-> START\nscene START\n  Hello.\nend\n", version: 1, languageId: "sparkdown" },
    { uri: src, type, name, ext, src, ...(svg ? { text: '<svg xmlns="http://www.w3.org/2000/svg"><rect id="prototype-card" width="10" height="10"/></svg>' } : {}) },
  ] });
  const { program } = compiler.compile({ textDocument: { uri } });
  return { program, src };
};

const transfer = (program: ReturnType<typeof compileAsset>["program"]) =>
  new ProgramTransportDecoder().decode(
    structuredClone(new ProgramTransportEncoder().encode(program)),
  ).assets!;

describe("prototype-named assets across the player boundary (#1762)", () => {
  it.each(Object.keys(extensions).flatMap(type =>
    names.map(name => ({ type: type as keyof typeof extensions, name })),
  ))("retains $type/$name as a transported player asset", ({ type, name }) => {
    const { program, src } = compileAsset(type, name);
    expect(Object.hasOwn(program.context![type]!, name)).toBe(true);
    const assets = transfer(program);
    expect(Object.hasOwn(assets[type]!, name), `player transfer omitted ${type}/${name}`).toBe(true);
    expect(assets[type]![name].src).toBe(src);
    expect(Object.getPrototypeOf(assets[type])).toBe(Object.prototype);
  });

  it.each(names)("resolves bare and typed backdrop references to %s.png", name => {
    const { program, src } = compileAsset("image", name);
    const assets = transfer(program);
    for (const type of ["", "image"]) {
      const image = resolveImageReference(assets, { $type: type, $name: name });
      expect(resolveImageLayers(assets, image).map(layer => layer.src)).toEqual([src]);
    }
  });

  it.each(names)("resolves a filtered look whose bare root is %s.png", name => {
    const { program, src } = compileAsset("image", name);
    const assets = transfer(program);
    const look = { $type: "filtered_image", $name: "look", image: { $type: "", $name: name }, attributes: [] };
    expect(resolveImageLayers(assets, look).map(layer => layer.src)).toEqual([src]);
    expect(look).toHaveProperty("filtered_src", src);
  });

  it.each(names)("transports and resolves an implicit SVG look named %s", name => {
    const { program } = compileAsset("image", name, true);
    const assets = transfer(program);
    const image = resolveImageReference(assets, { $type: "", $name: name });
    const layers = resolveImageLayers(assets, image);
    expect(layers).toHaveLength(1);
    expect(decodeURIComponent(layers[0]!.src)).toContain("prototype-card");
  });

  it.each(names.slice(1))("does not resolve an absent asset called %s from a prototype", name => {
    const assets = { image: {}, filtered_image: {}, layered_image: {} };
    expect(resolveImageReference(assets, { $type: "", $name: name })).toBeUndefined();
    expect(resolveImageReference(assets, { $type: "image", $name: name })).toBeUndefined();
  });
});
