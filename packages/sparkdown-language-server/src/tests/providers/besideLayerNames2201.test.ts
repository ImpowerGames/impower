// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it } from "vitest";
import { complete } from "./completionHarness";

const ROOT = "file:///proj";
const P = `${ROOT}/assets/Images/Portraits`;
const FILES = [
  `${P}/ava.png`,
  `${P}/ava~face.happy.png`,
  `${P}/ava@night.png`,
  `${P}/ava@night~face.happy.png`,
  `${P}/mia/90_body.png`,
  `${P}/mia/30_face.happy.png`,
  `${ROOT}/assets/Images/office.png`,
];

const program = (() => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: `${ROOT}/main.sd`, name: "main", type: "script", ext: "sd", text: "", languageId: "sparkdown", version: 1 },
      ...FILES.map((uri) => {
        const leaf = uri.split("/").at(-1)!;
        return { uri, type: "image", name: leaf.split(/[.~]/)[0]!, ext: "png", src: uri, version: 1 };
      }),
    ] as never,
  });
  return compiler.compile({ textDocument: { uri: `${ROOT}/main.sd` } }).program!;
})();

const names = (source: string) =>
  complete(source, { program, trigger: "." }).labels.filter((label) => !label.startsWith("$")).sort();

describe("image. names every picture an image reference finds (#2201)", () => {
  it("offers pictures with layer files and folder portraits after image. in a style", () => {
    expect(names("style card {\n  background_image = image.@1\n}\n")).toEqual(expect.arrayContaining(["ava", "ava@night", "mia", "office"]));
  });
});
