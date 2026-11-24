import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";
import { imageFileNameOf, imageThingsOf } from "../../attributes/imageFileName";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";
import type { AttributeVocabulary } from "../../attributes/types";

const uri = "file:///proj/main.sd";
const asset = (path: string, type = "image"): File => ({
  uri: `file:///proj/assets/${path}`,
  type,
  name: path.split("/").at(-1)!.split(".")[0]!,
  ext: SparkdownWorkspace.prototype.getFileExtension(`file:///proj/assets/${path}`),
  src: `/local/assets/${path}`,
});
const MIA = [
  "mia/90 body.png",
  "mia/60 face.happy/40 pupils eyes.open default.png",
  "mia/60 face.happy/40 lids eyes.closed.png",
  "mia/60 face.neutral default/40 pupils eyes.open look.camera default.png",
  "mia/60 face.neutral default/40 pupils eyes.open look.left.png",
  "mia/60 face.neutral default/40 lids eyes.closed.png",
  "mia/10 hat.on.png",
];
const compile = (paths: readonly (string | File)[], text = "") => {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [
    { uri, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 },
    ...paths.map((path) => typeof path === "string" ? asset(path) : path),
  ] });
  return compiler.compile({ textDocument: { uri } }).program!;
};
const drawn = (context: any, name: string, attributes: string[]) => {
  const look = attributes.length
    ? { $type: "filtered_image", $name: `${name}:${attributes.join(":")}`, image: { $type: "layered_image", $name: name }, attributes }
    : context["layered_image"][name];
  return resolveImageLayers(context, look).map((layer) => layer.src.replace("/local/assets/", ""));
};
const portraitsOf = (context: any): string[] =>
  Object.keys(context?.["layered_image"] ?? {}).filter((name) => !name.startsWith("$")).sort();
const messagesOn = (program: any, path: string): string[] =>
  (program.diagnostics?.[`file:///proj/assets/${path}`] ?? []).map((d: any) => String(d.message?.value ?? d.message));

describe("layer folders inside a portrait folder (#2633)", () => {
  it("reads the tree as one portrait whose nested files take their folder as parent", () => {
    const context = compile(MIA).context!;
    expect(portraitsOf(context)).toEqual(["mia"]);
    expect(context["layered_image"]?.["60 face.happy"]).toBeUndefined();
    expect(context["layered_image"]?.["60 face.neutral default"]).toBeUndefined();
    const vocabulary = context["layered_image"]!["mia"].attribute_vocabulary as AttributeVocabulary;
    const byKey = new Map(vocabulary.layers.map((layer) => [layer.key, layer]));
    const parentName = (name: string) =>
      vocabulary.layers.filter((layer) => layer.name === name).map((layer) => byKey.get(layer.parent)?.name ?? null);
    expect(parentName("pupils eyes.open default")).toEqual(["face.happy"]);
    expect(parentName("pupils eyes.open look.left")).toEqual(["face.neutral default"]);
    expect(parentName("lids eyes.closed").sort()).toEqual(["face.happy", "face.neutral default"]);
    expect(parentName("body")).toEqual([null]);
    expect(parentName("face.happy")).toEqual([null]);
  });

  it("draws each reference's files in stacking order", () => {
    const context = compile(MIA).context!;
    expect(drawn(context, "mia", [])).toEqual([
      "mia/90 body.png",
      "mia/60 face.neutral default/40 pupils eyes.open look.camera default.png",
    ]);
    expect(drawn(context, "mia", ["happy"])).toEqual([
      "mia/90 body.png",
      "mia/60 face.happy/40 pupils eyes.open default.png",
    ]);
    expect(drawn(context, "mia", ["happy", "eyes.closed"])).toEqual([
      "mia/90 body.png",
      "mia/60 face.happy/40 lids eyes.closed.png",
    ]);
    expect(drawn(context, "mia", ["look.left"])).toEqual([
      "mia/90 body.png",
      "mia/60 face.neutral default/40 pupils eyes.open look.left.png",
    ]);
    expect(drawn(context, "mia", ["happy", "hat.on"])).toEqual([
      "mia/90 body.png",
      "mia/60 face.happy/40 pupils eyes.open default.png",
      "mia/10 hat.on.png",
    ]);
  });

  it("lets each face rest a group its own way and flags two resting options inside one face", () => {
    const apart = compile([
      "mia/90 body.png",
      "mia/60 face.happy/40 pupils eyes.open default.png",
      "mia/60 face.happy/40 lids eyes.closed.png",
      "mia/60 face.neutral default/40 pupils eyes.open.png",
      "mia/60 face.neutral default/40 lids eyes.closed default.png",
    ]);
    const vocabulary = apart.context!["layered_image"]!["mia"].attribute_vocabulary as AttributeVocabulary;
    expect(vocabulary.diagnostics.filter((d) => d.code === "conflicting-defaults")).toEqual([]);
    expect(drawn(apart.context, "mia", [])).toEqual([
      "mia/90 body.png",
      "mia/60 face.neutral default/40 lids eyes.closed default.png",
    ]);
    expect(drawn(apart.context, "mia", ["happy"])).toEqual([
      "mia/90 body.png",
      "mia/60 face.happy/40 pupils eyes.open default.png",
    ]);

    const clash = compile([
      "mia/90 body.png",
      "mia/60 face.happy default/40 pupils eyes.open default.png",
      "mia/60 face.happy default/40 lids eyes.closed default.png",
    ]);
    for (const path of [
      "mia/60 face.happy default/40 pupils eyes.open default.png",
      "mia/60 face.happy default/40 lids eyes.closed default.png",
    ]) {
      expect(messagesOn(clash, path)).toEqual([expect.stringMatching(/"60 face\.happy default".*"mia".*eyes/)]);
    }
    expect(messagesOn(clash, "mia/90 body.png")).toEqual([]);
  });

  it("stacks a folder whole among its siblings", () => {
    const context = compile([
      "doll/70 back.png",
      "doll/60 middle/90 under.png",
      "doll/60 middle/10 over.png",
      "doll/50 front.png",
    ]).context!;
    expect(drawn(context, "doll", [])).toEqual([
      "doll/70 back.png",
      "doll/60 middle/90 under.png",
      "doll/60 middle/10 over.png",
      "doll/50 front.png",
    ]);
  });

  it("warns on an unnumbered subfolder holding layer files and keeps it a portrait of its own", () => {
    const program = compile(["mia/90 body.png", "mia/extras/10 scarf.png"]);
    expect(portraitsOf(program.context)).toEqual(["extras", "mia"]);
    expect(messagesOn(program, "mia/extras/10 scarf.png")).toEqual([
      expect.stringMatching(/"extras".*"mia".*number and a space/),
    ]);
    expect(messagesOn(program, "mia/90 body.png")).toEqual([]);
  });

  it("warns on a numbered folder directly under assets and reads it as neither layer nor portrait", () => {
    const program = compile(["60 face/10 lids.png", "mia/90 body.png"]);
    expect(portraitsOf(program.context)).toEqual(["mia"]);
    expect(messagesOn(program, "60 face/10 lids.png")).toEqual([
      expect.stringMatching(/"60 face".*portrait folder/),
    ]);
    expect(imageFileNameOf("/proj/assets/60 face/10 lids.png").layer).toBeUndefined();
  });

  it("names a folder and its portrait when a file in a layer folder has no number", () => {
    const program = compile(["mia/90 body.png", "mia/60 face.happy/blush.png", "mia/60 face.sad/40 eyes/lids.png"]);
    expect(messagesOn(program, "mia/60 face.happy/blush.png")).toEqual([
      expect.stringMatching(/"blush\.png".*"60 face\.happy".*"mia".*"NN blush\.png"/),
    ]);
    expect(messagesOn(program, "mia/60 face.sad/40 eyes/lids.png")).toEqual([
      expect.stringMatching(/"lids\.png".*"40 eyes".*"mia".*"NN lids\.png"/),
    ]);
  });

  it("warns on an unnumbered subfolder inside a layer folder that holds no layer files of its own", () => {
    const program = compile(["mia/90 body.png", "mia/60 face.happy/extras/10 scarf.png"]);
    expect(messagesOn(program, "mia/60 face.happy/extras/10 scarf.png")).toEqual([
      expect.stringMatching(/"extras".*"60 face\.happy".*"mia".*number and a space/),
    ]);
  });

  it("puts a warning about a layer folder's own name on a file inside that folder", () => {
    const program = compile(["mia/90 body.png", "mia/60 face_happy/40 pupils.png"]);
    const vocabulary = program.context!["layered_image"]!["mia"].attribute_vocabulary as AttributeVocabulary;
    expect(vocabulary.diagnostics.filter((d) => d.path === "60 face_happy")).not.toEqual([]);
    expect(messagesOn(program, "mia/60 face_happy/40 pupils.png")).not.toEqual([]);
    expect(messagesOn(program, "mia/90 body.png")).toEqual([]);
  });

  it("links a script warning about a layer folder to a file inside that folder", () => {
    const program = compile([
      "mia/90 body.png",
      "mia/60 face.happy default/40 pupils eyes.open.png",
      "mia/60 face.happy default/40 lids eyes.closed.png",
    ], "scene start\n  [[mia]]\n  Mia rests.\nend\n");
    const related = (program.diagnostics?.[uri] ?? [])
      .filter((d: any) => String(d.message?.value ?? d.message).includes('"face.happy default"'))
      .flatMap((d: any) => d.relatedInformation ?? [])
      .map((info: any) => info.location.uri);
    expect(related).not.toEqual([]);
    for (const target of related) expect(target).toContain("/60 face.happy default/");
  });

  it("adds nothing for a layer folder that holds no layer files", () => {
    const plain = compile(["mia/90 body.png", "mia/60 face.happy/10 mouth.png"]).context!["layered_image"]!["mia"];
    const withEmpty = compile([
      "mia/90 body.png", "mia/60 face.happy/10 mouth.png", asset("mia/60 face.sad/10 hum.mp3", "audio"),
    ]).context!["layered_image"]!["mia"];
    expect(withEmpty.assets).toEqual(plain.assets);
    expect(withEmpty.attribute_vocabulary).toEqual(plain.attribute_vocabulary);
  });

  it("never offers a file in a layer folder as a layer beside a picture", () => {
    const path = "/proj/assets/mia/60 face.happy/40 lids eyes.closed.png";
    expect(imageFileNameOf(path).layer).toBeUndefined();
    expect(imageThingsOf([path, "/proj/assets/mia/90 body.png"])).toEqual([]);
    const program = compile([...MIA, "40.png"]);
    expect(program.context!["layered_image"]?.["40"]).toBeUndefined();
  });
});
