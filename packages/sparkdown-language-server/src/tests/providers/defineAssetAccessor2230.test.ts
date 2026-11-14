// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it } from "vitest";
import { complete } from "./completionHarness";

const ROOT = "file:///proj";

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: `${ROOT}/main.sd`, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 },
      { uri: `${ROOT}/assets/Images/office.png`, type: "image", name: "office", ext: "png", src: `${ROOT}/assets/Images/office.png`, version: 1 },
      { uri: `${ROOT}/assets/Images/mia/90_body.png`, type: "image", name: "mia", ext: "png", src: `${ROOT}/assets/Images/mia/90_body.png`, version: 1 },
      { uri: `${ROOT}/assets/Fonts/serif.ttf`, type: "font", name: "serif", ext: "ttf", src: `${ROOT}/assets/Fonts/serif.ttf`, version: 1 },
      { uri: `${ROOT}/assets/Audio/rain.mp3`, type: "audio", name: "rain", ext: "mp3", src: `${ROOT}/assets/Audio/rain.mp3`, version: 1 },
    ] as never,
  });
  return compiler.compile({ textDocument: { uri: `${ROOT}/main.sd` } }).program!;
};

const labels = (source: string) =>
  complete(source, { program: compile(source.replace("@1", "")), trigger: "." }).labels;

describe("a typed asset accessor in a define property value lists asset names (#2230)", () => {
  it("offers image names after image. in a define value", () => {
    expect(labels("define look as filtered_image with\n  image = image.@1\nend\n")).toEqual(
      expect.arrayContaining(["office", "mia"]),
    );
  });

  it("offers audio names after audio. in a define value", () => {
    expect(labels("define cue as synth with\n  sound = audio.@1\nend\n")).toContain("rain");
  });

  it("offers font names after font. in a define value", () => {
    expect(labels("define body as typography with\n  font = font.@1\nend\n")).toContain("serif");
  });

  it("keeps Luau variable completion for a non-asset root", () => {
    const result = labels("store = { coins = 1 }\ndefine look as filtered_image with\n  image = store.@1\nend\n");
    expect(result).not.toContain("office");
  });

  it("offers no asset names after image. outside a define", () => {
    expect(labels("local x = image.@1\n")).not.toContain("office");
  });
});
