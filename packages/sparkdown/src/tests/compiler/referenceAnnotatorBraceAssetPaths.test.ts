import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

const NEWLINE = String.fromCharCode(10);
const lines = (...rows: string[]) => [...rows, ""].join(NEWLINE);

interface Read {
  text: string;
  symbolIds?: string[];
  root?: number;
  linkable?: boolean;
  firstMatchOnly?: boolean;
  asset?: { types: string[]; name: string; typed?: boolean };
}

const valueReads = (source: string, value: string): Read[] => {
  const uri = "file:///brace.sd";
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  const start = source.indexOf(value);
  expect(start, value).toBeGreaterThanOrEqual(0);
  const reads: Read[] = [];
  for (const c = documents.annotations(uri).references.iter(); c.value; c.next()) {
    if (c.from < start || c.to > start + value.length) continue;
    const { symbolIds, root, linkable, firstMatchOnly, asset } = c.value.type;
    reads.push({
      text: source.slice(c.from, c.to),
      symbolIds,
      ...(root == null ? {} : { root }),
      ...(linkable ? { linkable } : {}),
      ...(firstMatchOnly ? { firstMatchOnly } : {}),
      ...(asset ? { asset } : {}),
    });
  }
  return reads;
};

const defineWith = (property: string, value: string) =>
  valueReads(lines("define x as style with", `  ${property} = ${value}`, "end"), value);

const IMAGE = "image.ui_box";
const FONT = "font.review_font";

const BLOCKS: [string, string, string, string][] = [
  ["style", lines("style dialogue_background {", `  background_image = ${IMAGE}`, "}"), "background_image", IMAGE],
  ["style font", lines("style dialogue_background {", `  font_family = ${FONT}`, "}"), "font_family", FONT],
  ["screen", lines("screen hud {", `  image = ${IMAGE}`, "}"), "image", IMAGE],
  ["layout", lines("layout hud {", `  background_image = ${IMAGE}`, "}"), "background_image", IMAGE],
  ["animation keyframe", lines("animation fade {", "  keyframes {", `    from { background_image = ${IMAGE} }`, "  }", "}"), "background_image", IMAGE],
  ["theme", lines("theme dark {", `  font_family = ${FONT}`, "}"), "font_family", FONT],
  ["component", lines("component card {", `  background_image = ${IMAGE}`, "}"), "background_image", IMAGE],
  ["style child selector", lines("style card {", `  > text { font_family = ${FONT} }`, "}"), "font_family", FONT],
  ["style state block", lines("style card {", "  @hovered {", `    background_image = ${IMAGE}`, "  }", "}"), "background_image", IMAGE],
  ["layout element body", lines("layout hud {", "  column {", `    background_image = ${IMAGE}`, "  }", "}"), "background_image", IMAGE],
  ["morph list entry", lines("morph blink {", "  keyframes {", `    { offset = 0; eyes { state = ${IMAGE} } }`, "  }", "}"), "state", IMAGE],
];

describe("ReferenceAnnotator · asset paths in brace-form blocks", () => {
  test("the define-with form records the type word and the asset name", () => {
    expect(defineWith("background_image", IMAGE)).toEqual([
      { text: "image", symbolIds: [".image", "image"], linkable: true, firstMatchOnly: true },
      { text: "ui_box", symbolIds: ["image.ui_box"], asset: { types: ["image"], name: "ui_box", typed: true } },
    ]);
    expect(defineWith("font_family", FONT)).toEqual([
      { text: "font", symbolIds: [".font", "font"], linkable: true, firstMatchOnly: true },
      { text: "review_font", symbolIds: ["font.review_font"], root: 5 },
    ]);
  });

  test.each(BLOCKS)("a %s brace block records what the define-with form records", (_kind, source, property, value) => {
    expect(valueReads(source, value)).toEqual(defineWith(property, value));
  });

  test("every further segment of a brace-body path is recorded with the path up to it and its root", () => {
    const value = "font.review_font.bold";
    expect(valueReads(lines("style card {", `  font_family = ${value}`, "}"), value)).toEqual([
      { text: "font", symbolIds: [".font", "font"], linkable: true, firstMatchOnly: true },
      { text: "review_font", symbolIds: ["font.review_font"], root: 5 },
      { text: "bold", symbolIds: ["font.review_font.bold"], root: 17 },
    ]);
    expect(valueReads(lines("style card {", `  font_family = ${value}`, "}"), value)).toEqual(
      defineWith("font_family", value),
    );
  });

  test.each([
    ["inside the asset name", "ui_box", "ui_boxes"],
    ["on the type word", "image.ui_box", "font.ui_box"],
    ["adding a segment", "font.review_font", "font.review_font.bold"],
    ["before the block", "scene start", "scene start\n  Hello there.\n  Another line."],
  ])("an edit %s leaves the annotations equal to a fresh parse", (_, find, replace) => {
    const uri = "file:///edited.sd";
    const source = lines(
      "scene start",
      "  Hi.",
      "end",
      "screen hud {",
      `  image = ${IMAGE}`,
      "}",
      "style dialogue_text {",
      `  font_family = ${FONT}`,
      "}",
    );
    const snapshot = (registry: SparkdownDocumentRegistry, text: string) => {
      const out: unknown[] = [];
      for (const c = registry.annotations(uri).references.iter(); c.value; c.next()) {
        out.push([c.from, text.slice(c.from, c.to), c.value.type]);
      }
      return out;
    };
    const incremental = new SparkdownDocumentRegistry(["references"]);
    incremental.set({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
    const offset = source.indexOf(find);
    const position = (to: number) => {
      const before = source.slice(0, to).split(NEWLINE);
      return { line: before.length - 1, character: before.at(-1)!.length };
    };
    incremental.update({
      textDocument: { uri, version: 2 },
      contentChanges: [{ range: { start: position(offset), end: position(offset + find.length) }, text: replace }],
    });
    const edited = source.slice(0, offset) + replace + source.slice(offset + find.length);
    const fresh = new SparkdownDocumentRegistry(["references"]);
    fresh.set({ textDocument: { uri, text: edited, version: 1, languageId: "sparkdown" } });
    expect(snapshot(incremental, edited)).toEqual(snapshot(fresh, edited));
  });

  test("a brace-body image that names no image warns as the define-with form does", () => {
    const uri = "file:///project/main.sd";
    const warnings = (text: string) => {
      const compiler = new SparkdownCompiler();
      compiler.configure({
        files: [{ uri, name: "main", type: "script", ext: "sd", text, version: 1, languageId: "sparkdown" }],
      } as never);
      return (compiler.compile({ textDocument: { uri } }).program.diagnostics?.[uri] ?? [])
        .map((d) => (typeof d.message === "string" ? d.message : d.message.value))
        .filter((message) => message.startsWith("Cannot find"));
    };
    expect(warnings(lines("screen hud {", "  image = image.nowhere", "}"))).toEqual([
      "Cannot find image named `nowhere`",
    ]);
    expect(warnings(lines("define x as style with", "  background_image = image.nowhere", "end"))).toContain(
      "Cannot find image named `nowhere`",
    );
  });
});
