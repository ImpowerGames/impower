import { describe, expect, it } from "vitest";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createHarness } from "../ui/harness/uiTestHarness";

const ASSETS: File[] = [
  { uri: "inmemory:///bg.png", type: "image", name: "bg", ext: "png", src: "/file:/proj/bg.png?v=1" },
  { uri: "inmemory:///bunny.png", type: "image", name: "bunny", ext: "png", src: "/file:/proj/bunny.png?v=1" },
];

const SOFA = `framing sofa {
  x = 60%
  y = 100%
  zoom = 1.2
}
`;

const imagesOf = async (line: string) => {
  const h = createHarness(`${SOFA}scene start\n  Hi.\nend\n`);
  await h.ready;
  return h.game.module.interpreter.parse(`${line} Hello`, "main", {} as any).image ?? {};
};

const flat = (messages: any[]): any[] =>
  messages.flatMap((message) => (message?.method === "ui/batch" ? flat(message.params?.messages ?? []) : [message]));

const imageMessages = (messages: any[], framings = true) =>
  JSON.stringify(
    flat(messages).filter((message) => /image/.test(String(message?.method))),
    (key, value) => (framings || (key !== "framing" && key !== "travel") ? value : undefined),
  ).replaceAll(/"id":"[^"]*"/g, "");

const played = async (source: string) => {
  const h = createHarness(source, 0, { assets: ASSETS });
  await h.ready;
  const beats: unknown[] = [];
  for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
    beats.push(beat);
    await h.display(beat, true);
  }
  return { beats, messages: h.messages, errors: h.errors };
};

describe("at and to on the image instruction (I-2479)", () => {
  it("carries at on a show", async () => {
    expect((await imagesOf("[[show backdrop bg at right]]"))["backdrop"]).toEqual([
      expect.objectContaining({ control: "show", assets: ["bg"], at: "right" }),
    ]);
  });

  it("carries at on the bare shorthand", async () => {
    const [instruction] = Object.values(await imagesOf("[[bunny@serious at left]]")).flat();
    expect(instruction).toEqual(expect.objectContaining({ assets: ["bunny@serious"], at: "left" }));
    expect(instruction).not.toHaveProperty("to");
  });

  it("carries to on an animate, as the framing's name and not a number", async () => {
    const [instruction] = (await imagesOf("[[animate backdrop to sofa over 1s]]"))["backdrop"]!;
    expect(instruction).toEqual(expect.objectContaining({ control: "animate", to: "sofa", over: 1 }));
    expect(instruction).not.toHaveProperty("at");
  });

  it("plays a script that uses at and to as it plays without them, apart from the framings at places, with no runtime error", async () => {
    const lines = (framed: boolean) =>
      `${SOFA}scene start\n  [[show backdrop bg${framed ? " at right" : ""}]]\n  One.\n  [[animate backdrop${framed ? " to sofa" : ""} over 1s]]\n  Two.\n  [[bunny${framed ? " at left" : ""}]]\n  Three.\nend\n`;
    const framed = await played(lines(true));
    const plain = await played(lines(false));
    expect(framed.errors).toEqual([]);
    expect(plain.errors).toEqual([]);
    const framedImages = imageMessages(framed.messages);
    expect(framedImages).toContain("bunny.png");
    expect(framedImages).toContain("bg.png");
    expect(framedImages).toContain('"framing":{"x":1,"y":0.5,"zoom":1}');
    expect(framedImages).toContain('"framing":{"x":0,"y":0.5,"zoom":1}');
    expect(framedImages).toContain('"travel":{"framing":{"x":0.6,"y":1,"zoom":1.2}');
    expect(imageMessages(framed.messages, false)).toEqual(imageMessages(plain.messages));
  });
});
