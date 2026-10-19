import { describe, expect, it } from "vitest";
import { complete as completeAt } from "./completionHarness";

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

const completeItems = (source: string, contextProgram = program, trigger?: string) =>
  completeAt(source.replace("|", "@0"), { program: contextProgram, trigger }).items;
const complete = (source: string, contextProgram = program, trigger?: string) =>
  completeItems(source, contextProgram, trigger).map((item) => item.label).sort();
type Edit = { newText: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } };
/** The document after accepting `label`, its text edit applied to the cursor's line. */
const accept = (source: string, label: string, trigger?: string) => {
  const item = completeItems(source, program, trigger).find((candidate) => candidate.label === label);
  expect(item, label).toBeDefined();
  const edit = item!.textEdit as Edit;
  const lines = source.replace("|", "").split("\n");
  const line = lines[edit.range.start.line]!;
  lines[edit.range.start.line] = line.slice(0, edit.range.start.character) + edit.newText + line.slice(edit.range.end.character);
  return { text: lines.join("\n"), item: item! };
};

describe("image attribute completion", () => {
  it.each([":", "~"])("offers the image's groups, switches and bare options after %s, none dotted", (separator) => {
    expect(complete(`[[mia${separator}|]]`)).toEqual(["face", "far-left", "happy", "hat", "look", "sad"]);
  });
  it("inserts a group with its dot and asks for its options, and a switch on its own", () => {
    const face = accept("[[mia:|]]", "face");
    expect(face.text).toBe("[[mia:face.]]");
    expect(face.item.command?.command).toBe("editor.action.triggerSuggest");
    const hat = accept("[[mia:|]]", "hat");
    expect(hat.text).toBe("[[mia:hat]]");
    expect(hat.item.data.filtered).toEqual({ image: "mia", attributes: ["hat"] });
  });
  it.each([
    ["[[mia:face.|]]", "[[mia:face.happy]]"],
    ["[[mia:face.h|]]", "[[mia:face.happy]]"],
    ["[[mia~face.|]]", "[[mia~face.happy]]"],
  ])("offers only the typed group's options after its dot: %s", (source, accepted) => {
    expect(complete(source, program, ".")).toEqual(["happy", "sad"]);
    const { text, item } = accept(source, "happy", ".");
    expect(text).toBe(accepted);
    expect(item.data.filtered).toEqual({ image: "mia", attributes: ["face.happy"] });
  });
  it("offers a switch's on and off after its dot, and nothing after an unknown group", () => {
    expect(complete("[[mia:hat.|]]", program, ".")).toEqual(["off", "on"]);
    expect(complete("[[mia:nope.|]]", program, ".")).toEqual([]);
  });
  it("inherits the named look vocabulary and excludes groups and options already written", () => {
    expect(complete("[[party:hat:|]]")).toEqual(["face", "far-left", "happy", "look", "sad"]);
    expect(complete("[[mia:face.happy:|]]")).toEqual(["far-left", "hat", "look"]);
    expect(complete("[[mia:happy:face.|]]", program, ".")).toEqual(["sad"]);
  });
  it("omits ambiguous bare options but retains their groups and face/eyebrows shorthand", () => {
    const withGroups = (groups: typeof vocabulary.groups | object) => ({ context: { image: { mia: {
      $type: "image", $name: "mia", attribute_vocabulary: { ...vocabulary, groups },
    } } } }) as any;
    const face = { options: ["happy"], switch: false };
    expect(complete("[[mia:|]]", withGroups({ face, clothes: face }))).toEqual(["clothes", "face"]);
    expect(complete("[[mia:|]]", withGroups({ face, eyebrows: face }))).toEqual(["eyebrows", "face", "happy"]);
  });
  it.each(['"', "'"])("completes a named look attribute inside %s quotes without replacing the quotes", (quote) => {
    const source = `define party as filtered_image with\n  image = image.mia\n  attributes = { ${quote}hat${quote}, ${quote}sa|d${quote} }\nend\n`;
    const labels = complete(source);
    expect(labels).toEqual(["face", "far-left", "happy", "look", "sad"]);
    const { text, item } = accept(source, "sad");
    expect(text.split("\n")[2]).toBe(`  attributes = { ${quote}hat${quote}, ${quote}sad${quote} }`);
    expect(item.data.filtered).toEqual({ image: "mia", attributes: ["hat", "sad"] });
  });
  it("completes a group's options after its dot inside a quoted attribute", () => {
    const source = `define party as filtered_image with\n  image = image.mia\n  attributes = { "face.|" }\nend\n`;
    expect(complete(source, program, ".")).toEqual(["happy", "sad"]);
    const { text, item } = accept(source, "sad", ".");
    expect(text.split("\n")[2]).toBe(`  attributes = { "face.sad" }`);
    expect(item.data.filtered).toEqual({ image: "mia", attributes: ["face.sad"] });
  });
  it("completes multiline lists while retaining later attribute priority", () => {
    const source = `define party as filtered_image with\n  image = image.mia\n  attributes = {\n    "|",\n    "hat.off"\n  }\nend\n`;
    const sad = completeItems(source).find((item) => item.label === "sad");
    expect(sad?.data.filtered).toEqual({ image: "mia", attributes: ["sad", "hat.off"] });
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
    expect(complete(source)).not.toContain("sad");
  });
});
