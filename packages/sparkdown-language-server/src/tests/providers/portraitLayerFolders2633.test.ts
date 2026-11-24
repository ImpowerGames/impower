// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../utils/providers/getHover";
import { complete } from "./completionHarness";

const ROOT = "file:///proj";
const MAIN = `${ROOT}/main.sd`;
const M = `${ROOT}/assets/Images/mia`;
const FILES = [
  `${M}/90 body.png`,
  `${M}/60 face.happy/40 pupils eyes.open default.png`,
  `${M}/60 face.happy/40 lids eyes.closed.png`,
  `${M}/60 face.neutral default/40 pupils eyes.open look.camera default.png`,
  `${M}/60 face.neutral default/40 pupils eyes.open look.left.png`,
  `${M}/60 face.neutral default/40 lids eyes.closed.png`,
  `${M}/10 hat.on.png`,
];

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 },
      ...FILES.map((uri) => {
        const leaf = uri.split("/").at(-1)!;
        return { uri, type: "image", name: leaf.split(".")[0]!, ext: "png", src: uri, version: 1 };
      }),
    ] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program!;
};

const program = compile("");

const labels = (source: string, trigger?: string) =>
  complete(source, { program, trigger }).labels.filter((label) => !label.startsWith("$")).sort();

const hoverAt = async (text: string, column: number) => {
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri: MAIN, text, version: 1, languageId: "sparkdown" } });
  const hover = await getHover(documents.get(MAIN), documents.tree(MAIN), documents.annotations(MAIN), compile(text), undefined, { line: 0, character: column });
  return (hover?.contents as { value: string } | undefined)?.value ?? "";
};

const listed = (markup: string) => [...markup.matchAll(/^- `([^`]+)`$/gm)].map((match) => match[1]);

describe("a portrait folder with layer folders in the language server (#2633)", () => {
  it("offers the options nested files name after [[mia:", () => {
    expect(labels("[[mia:@0]]")).toEqual(expect.arrayContaining(["happy", "closed", "left"]));
    expect(labels("[[mia:eyes.@0]]", ".")).toEqual(["closed", "open"]);
    expect(labels("[[mia:look.@0]]", ".")).toEqual(["camera", "left"]);
  });

  it("lists the portrait's files bottom to top by their path from the portrait folder", async () => {
    expect(listed(await hoverAt("[[mia]]", 3))).toEqual([
      "90 body.png",
      "60 face.happy/40 lids eyes.closed.png",
      "60 face.happy/40 pupils eyes.open default.png",
      "60 face.neutral default/40 lids eyes.closed.png",
      "60 face.neutral default/40 pupils eyes.open look.camera default.png",
      "60 face.neutral default/40 pupils eyes.open look.left.png",
      "10 hat.on.png",
    ]);
  });
});
