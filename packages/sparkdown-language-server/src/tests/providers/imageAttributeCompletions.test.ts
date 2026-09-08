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

const complete = (source: string) => {
  const offset = source.indexOf("|");
  const text = source.replace("|", "");
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  documents.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  return getCompletions(documents.get(URI), documents.tree(URI), new Map([[URI, documents.annotations(URI)]]), program, undefined, { line: 0, character: offset }, undefined)?.map((item) => item.label).sort() ?? [];
};

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
});
