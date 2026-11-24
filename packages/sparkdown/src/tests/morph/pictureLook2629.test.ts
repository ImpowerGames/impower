import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { resolvePictureLook } from "../../morph/look";
import { morphPoseAt, morphRestPose } from "../../morph/recipe";
import { talkingPortrait } from "./fixtures";

const MAIN = "file:///proj/main.sd";
const P = "file:///proj/assets/Images/Portraits";

const png = (path: string) => {
  const leaf = path.slice(path.lastIndexOf("/") + 1);
  return { uri: `${P}/${path}`, type: "image", name: leaf.slice(0, leaf.lastIndexOf(".")), ext: "png", src: `/src/${path}`, version: 1 };
};

const lidsMorph = (name: string, states: string[], extra = "") => `morph ${name} {
  blend = cut
${extra}  keyframes {
${states.map((state, index) => `    ${Math.round((index / (states.length - 1)) * 100)}% {\n      lids {\n        state = ${state}\n      }\n    }`).join("\n")}
  }
}
`;

const compile = (text: string, files: object[]) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: MAIN, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }, ...files] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
};

const BESIDE = [png("ava.png"), png("ava lids.on.png"), png("ava mouth.closed default.png"), png("ava mouth.open.png")];
const OVERLAY = [png("overlay.png")];
const overlayOnly = (key: string) => `define kit as layered_image with\n  assets = {\n    ["${key}"] = overlay,\n  }\nend\n`;

const srcs = (layers: { src: string }[] | undefined) => layers?.map((layer) => layer.src);

describe("resolvePictureLook (#2629)", () => {
  test("a painted picture whose morph plays: one reference for the whole picture, its rest and start looks, its artwork", () => {
    const program = compile(lidsMorph("blink", ["on", "off"]), BESIDE);
    const ava = program.context!["layered_image"]!["ava"];
    const look = resolvePictureLook(program.context, program.morphs, ava, { startPose: (recipe) => morphPoseAt(recipe, 0) });
    expect(look.plays).toBe(true);
    expect(look.conflict).toBeUndefined();
    expect(look.refs.map((ref) => ref.morphs)).toEqual([["blink"]]);
    expect(look.root).toBe(ava);
    expect(look.artwork?.files.map((file) => file.name)).toEqual(["", "lids.on", "mouth.closed default", "mouth.open"]);
    expect(srcs(look.layers)).toEqual(["/src/ava.png", "/src/ava mouth.closed default.png"]);
    expect(look.layers.every((layer) => layer.refs.length === 0)).toBe(true);
    expect(srcs(look.rest)).toEqual(["/src/ava.png", "/src/ava mouth.closed default.png"]);
    expect(srcs(look.start)).toEqual(["/src/ava.png", "/src/ava lids.on.png", "/src/ava mouth.closed default.png"]);
    expect(look.empty).toBe(false);
  });

  test("an overlay-only picture: no visible layer, and its look is empty or the overlay as the morph's rest decides", () => {
    const resting = compile(`${overlayOnly("lids.on default")}\n${lidsMorph("hide", ["on", "off"])}`, OVERLAY);
    const hidden = resolvePictureLook(resting.context, resting.morphs, resting.context!["layered_image"]!["kit"]);
    expect(srcs(hidden.layers)).toEqual(["/src/overlay.png"]);
    expect(hidden.plays).toBe(true);
    expect(hidden.rest).toEqual([]);
    expect(hidden.empty).toBe(true);
    const showing = compile(`${overlayOnly("lids.on")}\n${lidsMorph("show", ["off", "on"])}`, OVERLAY);
    const shown = resolvePictureLook(showing.context, showing.morphs, showing.context!["layered_image"]!["kit"]);
    expect(shown.layers).toEqual([]);
    expect(srcs(shown.rest)).toEqual(["/src/overlay.png"]);
    expect(shown.empty).toBe(false);
  });

  test("the picture itself takes part in the pick: a pick function decides the picture even with no visible layer", () => {
    const speech = lidsMorph("chatter", ["off", "on"], "  timing {\n    trigger = speech\n  }\n");
    const program = compile(`${overlayOnly("lids.on")}\n${speech}`, OVERLAY);
    const kit = program.context!["layered_image"]!["kit"];
    const seen: unknown[] = [];
    const none = resolvePictureLook(program.context, program.morphs, kit, {
      pick: (layer) => {
        seen.push(layer.struct);
        return "none";
      },
    });
    expect(seen[0]).toBe(kit);
    expect(none.pick).toBe("none");
    expect(none.decisions).toEqual(["none"]);
    expect(none.refs).toEqual([]);
    expect(none.rest).toEqual([]);
    const own = resolvePictureLook(program.context, program.morphs, kit);
    expect(own.speech).toEqual(["chatter"]);
    expect(srcs(own.rest)).toEqual(["/src/overlay.png"]);
  });

  test("a layer with references of its own, even hidden at rest, keeps them while the picture's morph plays (#2632)", () => {
    const svg = { uri: "file:///proj/bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait() };
    const talk = `morph talk {\n  blend = cut\n  keyframes {\n    from {\n      mouth {\n        state = open\n      }\n    }\n    to {\n      mouth {\n        state = closed\n      }\n    }\n  }\n}\n`;
    const text = `${lidsMorph("blink", ["off", "on", "off"])}\n${talk}\ndefine kit as layered_image with\n  assets = {\n    ["base"] = overlay,\n    ["lids.on"] = bunny,\n  }\nend\n`;
    const program = compile(text, [...OVERLAY, svg]);
    const look = resolvePictureLook(program.context, program.morphs, program.context!["layered_image"]!["kit"]);
    expect(look.refs.map((ref) => ref.morphs)).toEqual([["blink"]]);
    expect(look.conflict).toBeUndefined();
    expect(look.plays).toBe(true);
    expect(look.files.map((file) => file.refs.map((ref) => [ref.image, ref.morphs]))).toEqual([[], [["bunny", ["talk"]]]]);
  });

  test("a base file that has the picture's own name is a layer, not the picture: the picture's morph plays", () => {
    const files = [{ ...png("kit.png"), uri: "file:///proj/kit.png" }, { ...png("overlay.png"), uri: "file:///proj/overlay.png" }];
    const text = `${lidsMorph("blink", ["off", "on", "off"])}\ndefine kit as layered_image with\n  assets = {\n    ["base"] = kit,\n    ["lids.on"] = overlay,\n  }\nend\n`;
    const program = compile(text, files);
    const look = resolvePictureLook(program.context, program.morphs, program.context!["layered_image"]!["kit"]);
    expect(look.layers.map((layer) => [layer.struct?.$type, layer.struct?.$name, layer.refs.length])).toEqual([["image", "kit", 0]]);
    expect(look.conflict).toBeUndefined();
    expect(look.plays).toBe(true);
    expect(look.refs.map((ref) => [ref.morphs, ref.layered])).toEqual([[["blink"], true]]);
  });

  test("a picture's own speech morph is offered where, picked, it plays on the whole picture, beside its SVG layer's own (#2632)", () => {
    const face = { uri: "file:///proj/face.svg", type: "image", name: "face", ext: "svg", data: talkingPortrait() };
    const smile = `morph smile {\n  blend = cut\n  keyframes {\n    from {\n      mouth {\n        state = closed\n      }\n    }\n    to {\n      mouth {\n        state = open\n      }\n    }\n  }\n}\n`;
    const chatter = lidsMorph("chatter", ["off", "on", "off"], "  timing {\n    trigger = speech\n  }\n");
    const kit = (assets: string) => `define kit as layered_image with\n  assets = {\n${assets}  }\nend\n`;
    const both = compile(`${smile}\n${chatter}\n${kit('    ["base"] = face,\n    ["lids.on"] = overlay,\n')}`, [...OVERLAY, face]);
    const playing = resolvePictureLook(both.context, both.morphs, both.context!["layered_image"]!["kit"]);
    expect(playing.conflict).toBeUndefined();
    expect(playing.plays).toBe(true);
    expect(playing.speech).toEqual(["chatter"]);
    const free = compile(`${chatter}\n${kit('    ["lids.on"] = overlay,\n')}`, OVERLAY);
    expect(resolvePictureLook(free.context, free.morphs, free.context!["layered_image"]!["kit"]).speech).toEqual(["chatter"]);
  });

  test("morphs that overlap on the picture are a conflict and do not play", () => {
    const text = `${lidsMorph("blink", ["off", "on", "off"])}\n${lidsMorph("wink", ["off", "on"])}`;
    const program = compile(text, BESIDE);
    const look = resolvePictureLook(program.context, program.morphs, program.context!["layered_image"]!["ava"]);
    expect(look.refs).toHaveLength(2);
    expect(look.conflict).toBe("overlap");
    expect(look.plays).toBe(false);
    expect(srcs(look.rest)).toEqual(srcs(look.layers));
  });

  test("an SVG image keeps its references on its layer, posed at rest by its own look", () => {
    const svg = { uri: "file:///proj/bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait() };
    const talk = `morph talk {\n  method = bend\n  keyframes {\n    from {\n      mouth {\n        state = open\n      }\n    }\n    to {\n      mouth {\n        state = closed\n      }\n    }\n  }\n}\n`;
    const program = compile(talk, [svg]);
    const bunny = program.context!["image"]!["bunny"];
    const look = resolvePictureLook(program.context, program.morphs, bunny);
    expect(look.root).toBeUndefined();
    expect(look.refs).toEqual([]);
    expect(look.plays).toBe(false);
    expect(look.layers.map((layer) => layer.refs.map((ref) => ref.morphs))).toEqual([[["talk"]]]);
    expect(look.rest).toHaveLength(1);
    expect(look.rest[0]!.shown).toBe(true);
  });

  test("without a channel the look is the picture's own layers", () => {
    const program = compile("", BESIDE);
    const look = resolvePictureLook(program.context, undefined, program.context!["layered_image"]!["ava"], { startPose: morphRestPose });
    expect(srcs(look.rest)).toEqual(["/src/ava.png", "/src/ava mouth.closed default.png"]);
    expect(look.start).toEqual(look.rest);
    expect(look.plays).toBe(false);
    expect(look.speech).toEqual([]);
  });
});
