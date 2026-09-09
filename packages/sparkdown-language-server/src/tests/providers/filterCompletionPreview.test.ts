import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getCompletions } from "../../utils/providers/getCompletions";
import { resolveCompletion } from "../../utils/providers/resolveCompletion";

const URI = "file:///complete.sd";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><g id="body"/><g id="phone" data-name="phone.on"/><g id="look-down" data-name="look.down"/><g id="look-up" data-name="look.up:default"/></svg>';
const buildProgram = () => ({ context: {
  image: { bunny_bruh: { $type: "image", $name: "bunny_bruh", ext: "svg", data: SVG }, raffles: { $type: "image", $name: "raffles", ext: "svg", data: SVG } },
  audio: { bark: { $type: "audio", $name: "bark" } },
} }) as any;

const completionsAt = (source: string, program: any) => {
  const offset = source.indexOf("|");
  const text = source.replace("|", "");
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  documents.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  return getCompletions(documents.get(URI), documents.tree(URI), new Map([[URI, documents.annotations(URI)]]), program, undefined, { line: 0, character: offset }, undefined);
};
const itemNamed = (source: string, program: any, label: string) => completionsAt(source, program)?.find((item) => item.label === label);
const previewSrc = async (item: any, program: any) => {
  expect(item?.data, "candidate carries its ordered preview attributes").toBeTruthy();
  const resolved = await resolveCompletion(item, program);
  const markup = (resolved.documentation as any)?.value ?? "";
  const src = /<img src="([^"]*)"/.exec(markup)?.[1];
  expect(src, "resolved candidate has an image preview").toBeTruthy();
  return src!;
};

describe("provider · attribute completion preview (#474)", () => {
  test.each([":", "~"])("previews applied attributes plus the candidate after %s", async (separator) => {
    const program = buildProgram();
    const src = await previewSrc(itemNamed(`[[bunny_bruh${separator}phone${separator}look.d|]]`, program, "look.down"), program);
    expect(src).toContain("look-down");
    expect(src).toContain("phone");
    expect(src).not.toContain("look-up");
    expect(src).toContain("body");
  });
  test("previews the candidate alone with no prior attributes", async () => {
    const program = buildProgram();
    const src = await previewSrc(itemNamed("[[bunny_bruh:look.d|]]", program, "look.down"), program);
    expect(src).toContain("look-down");
    expect(src).not.toContain("look-up");
    expect(src).not.toContain("phone");
    expect(src).toContain("body");
  });
  test("offers previews immediately after a separator", async () => {
    const program = buildProgram();
    const src = await previewSrc(itemNamed("[[bunny_bruh:phone:|]]", program, "look.down"), program);
    expect(src).toContain("look-down");
    expect(src).toContain("phone");
  });
  test("replaces the current attribute and preserves later group choices", async () => {
    const program = buildProgram();
    const src = await previewSrc(itemNamed("[[bunny_bruh:look.up|]]", program, "look.down"), program);
    expect(src).toContain("look-down");
    expect(src).not.toContain("look-up");
    const later = await previewSrc(itemNamed("[[bunny_bruh:phone|:look.up]]", program, "look.down"), program);
    expect(later).toContain("look-up");
    expect(later).not.toContain("look-down");
  });
  test("keeps a plus-joined candidate scoped to its own image", async () => {
    const program = buildProgram();
    const src = await previewSrc(itemNamed("[[bunny_bruh:phone + raffles:look.d|]]", program, "look.down"), program);
    expect(src).toContain("look-down");
    expect(src).not.toContain("phone");
  });
  test("reuses an existing ordered combination without adding another struct", async () => {
    const program = buildProgram();
    const name = "bunny_bruh~phone~look.down";
    const declared: any = { $type: "filtered_image", $name: name, image: { $name: "bunny_bruh" }, attributes: ["phone", "look.down"] };
    program.context.filtered_image = { [name]: declared };
    const src = await previewSrc(itemNamed("[[bunny_bruh:phone:look.d|]]", program, "look.down"), program);
    expect(src).toContain("look-down");
    expect(declared.filtered_src).toBeTruthy();
    expect(Object.keys(program.context.filtered_image)).toEqual([name]);
  });
  test("does not declare an unaccepted candidate in the program", async () => {
    const program = buildProgram();
    await previewSrc(itemNamed("[[bunny_bruh:phone:look.d|]]", program, "look.down"), program);
    expect(program.context.filtered_image).toBeUndefined();
  });
  test.each(["[[~look.d|]]", "((bark~look.d|))"])("offers no image attributes without an image vocabulary: %s", (source) => {
    expect(completionsAt(source, buildProgram()) ?? []).toEqual([]);
  });
});
