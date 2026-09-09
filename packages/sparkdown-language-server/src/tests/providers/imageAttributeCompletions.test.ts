import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getCompletions } from "../../utils/providers/getCompletions";

const URI = "file:///complete.sd";
const vocabulary = { layers: [], folders: {}, diagnostics: [], groups: {
  face: { options: ["happy", "sad"], switch: false },
  hat: { options: ["on", "off"], switch: true },
  look: { options: ["far-left"], switch: false },
} };
const program = { context: {
  image: {
    mia: { $type: "image", $name: "mia", attribute_vocabulary: vocabulary },
    other: { $type: "image", $name: "other", attribute_vocabulary: { ...vocabulary, groups: { coat: { options: ["on", "off"], switch: true } } } },
  },
  filtered_image: { party: { $type: "filtered_image", $name: "party", image: { $name: "mia" }, attributes: ["happy"] } },
} } as any;

const completeItems = (source: string, contextProgram = program) => {
  const offset = source.indexOf("|");
  const text = source.replace("|", "");
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  documents.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  return getCompletions(documents.get(URI), documents.tree(URI), new Map([[URI, documents.annotations(URI)]]), contextProgram, undefined, documents.get(URI)!.positionAt(offset), undefined) ?? [];
};
const complete = (source: string, contextProgram = program) => completeItems(source, contextProgram).map((item) => item.label).sort();

describe("image attribute completion", () => {
  it.each([":", "~"])("offers only the image vocabulary after %s", (separator) => {
    expect(complete(`[[mia${separator}|]]`)).toEqual(["face.happy", "face.sad", "far-left", "happy", "hat", "hat.off", "hat.on", "look.far-left", "sad"].sort());
  });
  it("inherits the named look vocabulary and excludes attributes already written", () => {
    const labels = complete("[[party:hat:|]]");
    expect(labels).toContain("face.sad");
    expect(labels).not.toContain("hat");
    expect(labels).not.toContain("coat");
  });
  it("omits ambiguous bare options but retains qualified choices and face/eyebrows shorthand", () => {
    const withGroups = (groups: typeof vocabulary.groups | object) => ({ context: { image: { mia: {
      $type: "image", $name: "mia", attribute_vocabulary: { ...vocabulary, groups },
    } } } }) as any;
    const face = { options: ["happy"], switch: false };
    expect(complete("[[mia:|]]", withGroups({ face, clothes: face }))).toEqual(["clothes.happy", "face.happy"]);
    expect(complete("[[mia:|]]", withGroups({ face, eyebrows: face }))).toEqual(["eyebrows.happy", "face.happy", "happy"]);
  });
  it.each(['"', "'"])("completes a named look attribute inside %s quotes without replacing the quotes", (quote) => {
    const source = `define party as filtered_image with\n  image = image.mia\n  attributes = { ${quote}hat${quote}, ${quote}sa|d${quote} }\nend\n`;
    const items = completeItems(source);
    const sad = items.find((item) => item.label === "face.sad")!;
    expect(sad).toBeDefined();
    expect(items.map((item) => item.label)).not.toContain("hat");
    expect(items.map((item) => item.label)).not.toContain("coat");
    const edit = sad.textEdit as { newText: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } };
    const lines = source.replace("|", "").split("\n");
    const line = lines[edit.range.start.line]!;
    expect(line.slice(0, edit.range.start.character) + edit.newText + line.slice(edit.range.end.character)).toBe(`  attributes = { ${quote}hat${quote}, ${quote}face.sad${quote} }`);
    expect(sad.data.filtered).toEqual({ image: "mia", attributes: ["hat", "face.sad"] });
  });
  it("completes multiline lists while retaining later attribute priority", () => {
    const source = `define party as filtered_image with\n  image = image.mia\n  attributes = {\n    "|",\n    "hat.off"\n  }\nend\n`;
    const sad = completeItems(source).find((item) => item.label === "face.sad");
    expect(sad?.data.filtered).toEqual({ image: "mia", attributes: ["face.sad", "hat.off"] });
  });
  it.each([
    `define party as filtered_image with\n  image = image.mia\n  description = { "|" }\nend\n`,
    `define party as audio with\n  attributes = { "|" }\nend\n`,
    `local attributes = { "|" }\n`,
    `Narration "|"\n`,
    `define missing as filtered_image with\n  image = image.missing\n  attributes = { "|" }\nend\n`,
    `define party as filtered_image with\n  attributes = { nested = { "|" } }\nend\n`,
    `define party as filtered_image with\n  attributes = { named = "|" }\nend\n`,
  ])("does not offer image attributes outside a resolved filtered-image list: %s", (source) => {
    expect(complete(source)).not.toContain("face.sad");
  });
});
