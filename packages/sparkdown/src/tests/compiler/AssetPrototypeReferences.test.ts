import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";
import { resolveImageReference } from "../../compiler/utils/resolveImageReference";
import { ProgramTransportDecoder, ProgramTransportEncoder } from "../../workspace/utils/programTransport";
import {
  isPureNumberStdLibOp, isStdLibFunctionName, lookupAnyStdLib,
  lookupGlobalStdLibBuiltin, lookupStateAwareStdLib, lookupStdLibBuiltin,
  lookupStdLibConstant, lookupStdLibDeprecation,
} from "../../runtime/StdLib";

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
const compile = (text: string, files: File[] = [], seedBuiltinsIntoStory = false) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({ seedBuiltinsIntoStory, files: [
    { uri, name: "main", type: "script", ext: "sd", text, version: 1, languageId: "sparkdown" },
    ...files,
  ] });
  return compiler.compile({ textDocument: { uri } }).program;
};
const messages = (program: ReturnType<typeof compile>, target = uri) =>
  (program.diagnostics?.[target] ?? []).map(d => typeof d.message === "string" ? d.message : d.message.value);
const playerAssets = (program: ReturnType<typeof compile>) =>
  new ProgramTransportDecoder().decode(
    structuredClone(new ProgramTransportEncoder().encode(program)),
  ).assets!;

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

  it.each(names)("accepts the authored image definition named %s", name => {
    const program = compile(`define ${name} as image with\n  src = "override.png"\nend\n[[show backdrop ${name}]]\nA beat.`);
    expect(messages(program)).toEqual([]);
  });

  it("still rejects a definition named after a registered builtin", () => {
    const program = compile('define next as image with\n  src = "override.png"\nend\nA beat.');
    expect(messages(program)).toContain("`next` cannot be used for the name of a define because it's a built in function");
  });

  it.each(names)("does not resolve %s through inherited stdlib entries", name => {
    expect(lookupStateAwareStdLib(name)).toBeNull();
    expect(lookupAnyStdLib(name)).toBeNull();
    expect(lookupGlobalStdLibBuiltin(name, 0)).toBeNull();
    expect(isStdLibFunctionName(name)).toBe(false);
    expect(isPureNumberStdLibOp(name)).toBe(false);
    expect(lookupStdLibDeprecation(name)).toBeNull();
    expect(lookupStdLibConstant(name)).toBeUndefined();
    expect(lookupStdLibBuiltin("count", name, 0)).toBeNull();
    expect(lookupStdLibBuiltin(name, "toString", 0)).toBeNull();
  });

  it("still resolves registered stdlib entries and aliases", () => {
    expect(lookupStateAwareStdLib("next")).not.toBeNull();
    expect(lookupAnyStdLib("math.abs")).not.toBeNull();
    expect(lookupGlobalStdLibBuiltin("assert", 1)).toBe("assert");
    expect(isStdLibFunctionName("math.abs")).toBe(true);
    expect(isPureNumberStdLibOp("math.abs")).toBe(true);
    expect(lookupStdLibDeprecation("table.getn")).toContain("deprecated");
    expect(lookupStdLibConstant("math.pi")).toBe(Math.PI);
    expect(lookupStdLibBuiltin("count", "turns", 1)).toBe("TURNS_SINCE");
    expect(lookupStdLibBuiltin("count", "turns", 0)).toBe("count.turns");
  });

  it.each(names.flatMap(name => [false, true].map(seed => ({ name, seed }))))(
    "keeps the authored source for $name when builtins are seeded: $seed",
    ({ name, seed }) => {
      const program = compile(`define ${name} as image with\n  src = "override.png"\nend\n[[show backdrop ${name}]]\nA beat.`, [asset(`${name}.png`)], seed);
      const assets = playerAssets(program);
      const image = resolveImageReference(assets, { $name: name });
      expect(resolveImageLayers(assets, image).map(layer => layer.src)).toEqual(["override.png"]);
    },
  );

  it.each((["audio", "font", "video"] as const).flatMap(type => names.map(name => ({ type, name }))))(
    "keeps the authored source for the transported $type/$name asset",
    ({ type, name }) => {
      const ext = { audio: "mp3", font: "ttf", video: "mp4" }[type];
      const file = { ...asset(`${name}.${ext}`), type };
      const program = compile(`define ${name} as ${type} with\n  src = "override.${ext}"\nend\nA beat.`, [file]);
      expect(playerAssets(program)[type]?.[name].src).toBe(`override.${ext}`);
    },
  );

  it.each(names)("does not warn that an explicitly included layer in %s was omitted", name => {
    const extra = asset(`${name}/extra.png`);
    const program = compile(`define ${name} as layered_image with\n  assets = { extra }\nend\n[[${name}]]`, [asset(`${name}/90_body.png`), extra]);
    const image = resolveImageReference(program.assets, { $name: name });
    expect(resolveImageLayers(program.assets, image).map(layer => layer.src)).toEqual([extra.src]);
    expect(messages(program, extra.uri).filter(m => m.includes("no numeric ordering prefix"))).toEqual([]);
  });
});
