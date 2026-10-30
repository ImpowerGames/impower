import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getReferences } from "../../utils/providers/getReferences";
import { complete as completeAt } from "./completionHarness";

const program = {
  context: {
    image: { forest: { $type: "image", $name: "forest" } },
    video: { bunny_idle: { $type: "video", $name: "bunny_idle", src: "bunny_idle.webm" } },
  },
} as any;

const labels = (source: string) =>
  completeAt(source.replace("|", "@0"), { program }).labels;

describe("video name completions in image commands (I-1378)", () => {
  it.each(["show", "animate"])("offers video and image names after %s LAYER", (control) => {
    expect(labels(`[[${control} backdrop |]]`)).toEqual(
      expect.arrayContaining(["bunny_idle", "forest"]),
    );
  });

  it("keeps with first after animate LAYER", () => {
    expect(labels("[[animate backdrop |]]")[0]).toBe("with");
  });

  it.each(["show", "animate"])("offers a video name while typing it after %s LAYER", (control) => {
    expect(labels(`[[${control} backdrop bun|]]`)).toContain("bunny_idle");
  });

  it("describes a video name as a video", () => {
    const at = completeAt("[[show backdrop bun@0]]", { program });
    expect(at.detail("bunny_idle")).toBe("video");
  });

  it.each([
    "[[show backdrop |]]",
    "[[show backdrop bunny_idle |]]",
    "[[show backdrop bunny_idle with fade |]]",
    "[[animate backdrop bunny_idle |]]",
  ])("offers loop, once and mute among the clauses: %s", (source) => {
    expect(labels(source)).toEqual(expect.arrayContaining(["loop", "once", "mute"]));
  });

  it("keeps the movie clauses off hide", () => {
    const offered = labels("[[hide backdrop |]]");
    expect(offered).toContain("with");
    expect(offered).not.toContain("loop");
  });
});

describe("video name definitions in image commands (I-1378)", () => {
  const URI = "file:///provider.sd";
  const source = `define bunny_idle as video with
  src = "bunny_idle.webm"
end
[[show backdrop bunny_idle]]
[[animate backdrop bunny_idle]]
`;
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  documents.set({
    textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" },
  });
  const workspace = {
    annotations: (uri: string) => documents.annotations(uri),
    document: (uri: string) => documents.get(uri),
    uris: () => [...documents.keys()],
    compilerConfig: undefined,
    findFiles: () => [],
  } as any;

  it.each([3, 4])("go-to-definition from line %i lands on the video declaration", (line) => {
    const character = source.split("\n")[line]!.indexOf("bunny_idle") + 1;
    const { references } = getReferences(
      documents.get(URI),
      documents.tree(URI),
      undefined,
      workspace,
      { line, character },
      {
        searchOtherFiles: true,
        includeDeclaration: true,
        excludeUses: true,
        includeInterdependent: false,
        includeLinks: false,
      },
    );
    expect(references?.map((r) => r.range)).toEqual([
      { start: { line: 0, character: 7 }, end: { line: 0, character: 17 } },
    ]);
  });
});
