import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";
import { resolveImageReference } from "../../compiler/utils/resolveImageReference";

const uri = "file:///project/main.sd";
const names = ["ordinary", "toString", "constructor", "hasOwnProperty", "__proto__"];
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g data-name="face.happy:default" id="happy"/><g data-name="face.sad" id="sad"/></svg>';
const asset = (path: string, data?: string): File => ({
  uri: `file:///project/assets/${path}`,
  type: "image",
  name: path.split("/").at(-1)!.replace(/\.[^.]+$/, ""),
  ext: path.split(".").at(-1)!,
  src: `/file:/local/assets/${path}`,
  ...(data ? { data } : {}),
});
const compile = (text: string, files: File[] = []) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [
    { uri, name: "main", type: "script", ext: "sd", text, version: 1, languageId: "sparkdown" },
    ...files,
  ] });
  return compiler.compile({ textDocument: { uri } }).program;
};
const messages = (program: ReturnType<typeof compile>, target = uri) =>
  (program.diagnostics?.[target] ?? []).map(d => typeof d.message === "string" ? d.message : d.message.value);

describe("prototype asset names at author reference boundaries (#1762)", () => {
  it.each(names)("warns when the referenced image %s is missing", name => {
    const program = compile(`[[show backdrop ${name}]]\nMissing image.\n`);
    const diagnostic = program.diagnostics?.[uri]?.find(d =>
      (typeof d.message === "string" ? d.message : d.message.value) === `Cannot find image named \`${name}\``,
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.range).toEqual({ start: { line: 0, character: 16 }, end: { line: 0, character: 16 + name.length } });
  });

  it.each(names)("finds the existing image %s without a missing-reference warning", name => {
    const program = compile(`[[show backdrop ${name}]]`, [asset(`${name}.png`)]);
    expect(messages(program).filter(m => m.startsWith("Cannot find"))).toEqual([]);
    const image = resolveImageReference(program.assets, { $name: name });
    expect(resolveImageLayers(program.assets, image).map(layer => layer.src)).toEqual([`/file:/local/assets/${name}.png`]);
  });

  it.each(names)("creates the default filtered SVG look for %s", name => {
    const program = compile(`[[${name}]]`, [asset(`${name}.svg`, svg)]);
    expect(Object.hasOwn(program.context!["filtered_image"]!, name)).toBe(true);
    const image = resolveImageReference(program.assets, { $name: name });
    const source = decodeURIComponent(resolveImageLayers(program.assets, image)[0]?.src ?? "");
    expect(source).toMatch(/id=['"]happy['"]/);
    expect(source).not.toMatch(/id=['"]sad['"]/);
  });

  it.each(names)("warns about an unavailable attribute on %s", name => {
    const program = compile(`[[${name}:face.nowhere]]`, [asset(`${name}.svg`, svg)]);
    expect(messages(program).some(m => m.includes('no attribute "face.nowhere"'))).toBe(true);
  });

  it.each(names)("constructs the raster portrait folder %s", name => {
    const program = compile(`[[${name}]]`, [asset(`${name}/90_body.png`), asset(`${name}/30_face.happy~default.png`)]);
    expect(Object.hasOwn(program.context!["layered_image"]!, name)).toBe(true);
    expect(Object.hasOwn(program.context!["filtered_image"]!, name)).toBe(true);
    const image = resolveImageReference(program.assets, { $name: name });
    expect(resolveImageLayers(program.assets, image).map(layer => layer.src)).toEqual([
      `/file:/local/assets/${name}/90_body.png`, `/file:/local/assets/${name}/30_face.happy~default.png`,
    ]);
    expect(Object.values(program.diagnostics ?? {}).flat().map(d => String(typeof d.message === "string" ? d.message : d.message.value)).filter(m => m.includes("Asset name collision"))).toEqual([]);
  });

  it.each(names)("reports an omitted raster layer in folder %s", name => {
    const omitted = asset(`${name}/extra.png`);
    const program = compile(`[[${name}]]`, [asset(`${name}/90_body.png`), omitted]);
    expect(messages(program, omitted.uri).some(m => m.includes("no numeric ordering prefix"))).toBe(true);
  });

  it.each(names)("keeps an explicit layered-image override named %s", name => {
    const program = compile(`define ${name} as layered_image with\n  assets = { background }\nend\n[[${name}]]`, [asset(`${name}/90_body.png`), asset("background.png")]);
    const image = resolveImageReference(program.assets, { $type: "layered_image", $name: name });
    expect(resolveImageLayers(program.assets, image).map(layer => layer.src)).toEqual(["/file:/local/assets/background.png"]);
  });
});
