import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const MAIN = "file:///proj/main.sd";
const P = "file:///proj/assets/Images/Portraits";

const imageFile = (uri: string) => {
  const leaf = decodeURIComponent(uri.slice(uri.lastIndexOf("/") + 1));
  return {
    uri,
    type: "image",
    name: leaf.slice(0, leaf.lastIndexOf(".")),
    ext: "png",
    src: `/src/${uri.slice(P.length + 1)}`,
    version: 1,
  };
};

const FILES = [
  `${P}/mia/90 base.png`,
  `${P}/mia/50 mouth.closed default.png`,
  `${P}/mia/50 mouth.open.png`,
  `${P}/mia/10 lids.on.png`,
  `${P}/ava.png`,
  `${P}/ava mouth.closed default.png`,
  `${P}/ava mouth.open.png`,
  `${P}/ava lids.on.png`,
  `${P}/kit_base.png`,
  `${P}/kit_closed.png`,
  `${P}/kit_open.png`,
  `${P}/kit_lids.png`,
];

const BLINK = `morph blink {
  blend = cut
  unless = mouth.open
  keyframes {
    from {
      lids {
        state = off
      }
    }
    50% {
      lids {
        state = on
      }
    }
    to {
      lids {
        state = off
      }
    }
  }
}
`;

const DEFINES = `define kit as layered_image with
  assets = {
    ["base"] = kit_base,
    ["mouth.closed default"] = kit_closed,
    ["mouth.open"] = kit_open,
    ["lids.on"] = kit_lids,
  }
end

define mia_open as filtered_image with
  image = mia,
  attributes = { "mouth.open" }
end

define ava_open as filtered_image with
  image = ava,
  attributes = { "mouth.open" }
end

define kit_talking as filtered_image with
  image = kit,
  attributes = { "mouth.open" }
end
`;

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      ...FILES.map(imageFile),
    ] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
};

const program = compile(`${BLINK}\n${DEFINES}\nscene start\n  [[mia]]\n  [[ava]]\n  [[kit]]\nend\n`);

describe("a morph mints references for pictures made of image files (#2629)", () => {
  test.each([
    ["a portrait folder", "mia"],
    ["a picture with layer files beside it", "ava"],
    ["a hand-written layered_image", "kit"],
  ])("%s gets one reference that plays the blink", (_kind, name) => {
    const refs = program.morphs?.variants[name];
    expect(refs).toHaveLength(1);
    expect(refs![0]).toMatchObject({ morphs: ["blink"], image: name, groups: ["lids"] });
    expect(refs![0]!.src).toBeUndefined();
  });

  test("the three pictures get three different keys", () => {
    const keys = ["mia", "ava", "kit"].map((name) => program.morphs?.variants[name]?.[0]?.key);
    expect(new Set(keys).size).toBe(3);
  });

  test.each(["mia_open", "ava_open", "kit_talking"])("the look %s, which the blink's `unless` keeps out, gets none", (name) => {
    expect(program.morphs?.variants[name]).toBeUndefined();
  });

  test("a key changes when a layer file's source changes", () => {
    const before = program.morphs?.variants["kit"]?.[0]?.key;
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        { uri: MAIN, type: "script", name: "main", ext: "sd", text: `${BLINK}\n${DEFINES}`, version: 1, languageId: "sparkdown" },
        ...FILES.map(imageFile).map((file) => (file.name === "kit_lids" ? { ...file, src: "/src/other.png" } : file)),
      ] as never,
    });
    const after = compiler.compile({ textDocument: { uri: MAIN } }).program.morphs?.variants["kit"]?.[0]?.key;
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
  });

  test("a morph clause that names a painted portrait's speech morph is accepted", () => {
    const talk = `morph talk {\n  blend = cut\n  keyframes {\n    from {\n      mouth {\n        state = closed\n      }\n    }\n    50% {\n      mouth {\n        state = open\n      }\n    }\n    to {\n      mouth {\n        state = closed\n      }\n    }\n  }\n  timing {\n    trigger = speech\n  }\n}\n`;
    const text = `define ava as character with\n  name = "AVA"\nend\n\n${talk}\nscene start\n  AVA:\n    [[ava morph talk]]\n    Hello.\nend\n`;
    const painted = compile(text);
    const messages = (painted.diagnostics?.[MAIN] ?? []).map((d) => (typeof d.message === "string" ? d.message : d.message.value));
    expect(painted.morphs?.picks?.["ava"]?.["talk"]).toHaveLength(1);
    expect(messages.filter((message) => message.includes("plays on no image"))).toEqual([]);
  });

  const messagesOf = (text: string) =>
    (compile(text).diagnostics?.[MAIN] ?? []).map((d) => (typeof d.message === "string" ? d.message : d.message.value));

  test("a morph clause that names the speech morph of a picture with no layer shown at rest is accepted", () => {
    const talk = `morph chatter {\n  blend = cut\n  keyframes {\n    from {\n      lids {\n        state = off\n      }\n    }\n    to {\n      lids {\n        state = on\n      }\n    }\n  }\n  timing {\n    trigger = speech\n  }\n}\n`;
    const overlay = `define jaw as layered_image with\n  assets = {\n    ["lids.on"] = kit_lids,\n  }\nend\n`;
    const messages = messagesOf(`define ava as character with\n  name = "AVA"\nend\n\n${talk}\n${overlay}\nscene start\n  AVA:\n    [[jaw morph chatter]]\n    Hello.\nend\n`);
    expect(messages.filter((message) => message.includes("chatter"))).toEqual([]);
  });

  test("a painted portrait warns where its morph's rest replaces a written choice, as an SVG image does", () => {
    const messages = messagesOf(`${BLINK}\nscene start\n  [[ava:lids.on]]\nend\n`);
    expect(messages.filter((message) => message.startsWith("`blink` plays on this look and rests its `lids` on `off`"))).toHaveLength(1);
  });
});
