import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { imageThingsOf } from "@impower/sparkdown/src/attributes/imageFileName";
import { byRasterOrder, rasterLayerOfPath } from "@impower/sparkdown/src/attributes/rasterSource";
import { describe, expect, it } from "vitest";
import { imageStacks, isStacked } from "../../src/modules/spark-editor/utils/imageStacks";
import { fileRows } from "../../src/modules/spark-editor/utils/imageVariants";

const P = "Assets/Images/Portraits";

const AVA = [
  `${P}/ava.png`,
  `${P}/ava@night.png`,
  `${P}/ava~20_face.happy.png`,
  `${P}/ava~20_face.sad.png`,
  `${P}/ava~30_mouth.closed~default.png`,
  `${P}/ava~30_mouth.open.png`,
  `${P}/ava~10_hat.on.png`,
  `${P}/ava@night~face.happy.png`,
  `${P}/ava.v2.png`,
];

const MIA = [
  `${P}/mia/90_body.png`,
  `${P}/mia/30_face.neutral~default.png`,
  `${P}/mia/30_face.happy.png`,
  `${P}/mia/10_hat.on.png`,
];

const OFFICE = "Assets/Images/Backdrops/office.png";

const FIXTURE = [...AVA, ...MIA, OFFICE];

describe("the Assets page groups image files by the compiler's file-name rule", () => {
  const stacks = imageStacks(FIXTURE);

  it("finds the same things, pictures and layers, in the same stacking order, as the shared rule", () => {
    const shared = imageThingsOf(FIXTURE).map((thing) => [
      thing.name,
      thing.pictures.map((picture) => [picture.alternate, picture.path, picture.layers.map((layer) => layer.path)]),
    ]);
    const page = stacks
      .filter((stack) => stack.kind === "files")
      .map((stack) => [
        stack.name,
        stack.pictures.map((picture) => [picture.alternate, picture.path, picture.layers]),
      ]);
    const byName = (a: unknown[], b: unknown[]) => String(a[0]).localeCompare(String(b[0]));
    expect(page.sort(byName)).toEqual(shared.sort(byName));
  });

  it("stacks a folder's numbered files as the compiler's folder stack, bottom first", () => {
    const [mia] = stacks.filter((stack) => stack.kind === "folder");
    const bottomFirst = MIA.map((path) => ({ path, order: rasterLayerOfPath(path)!.order }))
      .sort(byRasterOrder)
      .map((layer) => layer.path);
    expect(mia).toMatchObject({ name: "mia", paths: [...MIA].sort() });
    expect(mia!.pictures.map((picture) => picture.layers)).toEqual([bottomFirst]);
  });

  it("puts every file in exactly one tile, a first-dot name such as ava.v2.png under the thing it names", () => {
    expect(stacks.flatMap((stack) => stack.paths).sort()).toEqual([...FIXTURE].sort());
    const ava = stacks.find((stack) => stack.name === "ava")!;
    expect(ava.paths).toContain(`${P}/ava.v2.png`);
    expect(stacks.filter((stack) => stack.name === "ava")).toHaveLength(1);
  });

  it("shows a picture with layer files beside it as one picture with its options", () => {
    const ava = stacks.find((stack) => stack.name === "ava")!;
    expect(ava.pictures.map((picture) => picture.alternate)).toEqual([null, "night"]);
    expect(ava.pictures[0]!.groups).toEqual([
      { name: "hat", options: ["on", "off"], switch: true },
      { name: "face", options: ["happy", "sad"], switch: false },
      { name: "mouth", options: ["closed", "open"], switch: false, default: "closed" },
    ]);
    expect(ava.pictures[0]!.variants).toBe(3 * 2 * 2);
    expect(ava.pictures[1]!.groups).toEqual([{ name: "face", options: ["happy"], switch: false }]);
    expect(ava.cover).toBe(`${P}/ava.png`);
  });

  it("names a beside layer's order number in its Files role, as a folder layer's", () => {
    const ava = stacks.find((stack) => stack.name === "ava")!;
    const roles = Object.fromEntries(
      fileRows(ava, {}).map((row) => [row.name, row.role]),
    );
    expect(roles).toMatchObject({
      "ava~10_hat.on.png": "Layer 10 · hat.on",
      "ava~20_face.happy.png": "Layer 20 · face.happy",
      "ava~30_mouth.closed~default.png": "Layer 30 · mouth.closed · default",
      "ava@night~face.happy.png": "Layer · face.happy · on night",
      "ava.v2.png": "Asset name collision · also provides ava",
    });
  });
});

describe("two files the compiler names alike, with no @ or ~ files", () => {
  const PATHS = [`${P}/ava.png`, `${P}/ava.v2.png`];

  it("shows one tile holding both files, the second named as the compiler's collision", () => {
    const stacks = imageStacks(PATHS);
    expect(stacks.map((stack) => [stack.name, stack.paths])).toEqual([["ava", PATHS]]);
    expect(isStacked(stacks[0]!)).toBe(true);
    expect(fileRows(stacks[0]!, {}).map((row) => [row.name, row.role])).toEqual([
      ["ava.png", "Base"],
      ["ava.v2.png", "Asset name collision · also provides ava"],
    ]);
  });

  it("is the file the compiler warns about, so the role and the Problems entry state one fact", () => {
    const main = "file:///project/main.sd";
    const uriOf = (path: string) => `file:///project/${path}`;
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        { uri: main, name: "main", type: "script", ext: "sd", text: "scene start\n  [[ava]]\nend\n", languageId: "sparkdown", version: 1 },
        ...PATHS.map((path) => ({ uri: uriOf(path), type: "image", name: "ava", ext: "png", src: `/src/${path}`, version: 1 })),
      ] as never,
    });
    const program = compiler.compile({ textDocument: { uri: main } }).program!;
    const messages = (path: string) =>
      (program.diagnostics?.[uriOf(path)] ?? []).map((d) => (typeof d.message === "string" ? d.message : d.message.value));
    for (const path of PATHS) {
      expect(messages(path).some((message) => message.startsWith("Asset name collision: `ava` (image)"))).toBe(true);
    }
  });
});
