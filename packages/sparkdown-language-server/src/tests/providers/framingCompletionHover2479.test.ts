// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../utils/providers/getHover";
import { complete } from "./completionHarness";

const MAIN = "file:///proj/main.sd";

const SOFA = `framing sofa {
  x = 60%
  y = 100%
  zoom = 1.2
}
`;

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: MAIN, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 }] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program!;
};

const program = compile(SOFA);

const BUILT_INS = ["bottom", "bottom_left", "bottom_right", "center", "left", "right", "top", "top_left", "top_right"];

const labels = (source: string) =>
  complete(source, { program }).labels.filter((label) => !label.startsWith("$")).sort();

const hoverAt = async (text: string, line: number, character: number) => {
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri: MAIN, text, version: 1, languageId: "sparkdown" } });
  const hover = await getHover(documents.get(MAIN), documents.tree(MAIN), documents.annotations(MAIN), compile(text), undefined, { line, character });
  return (hover?.contents as { value: string } | undefined)?.value ?? "";
};

describe("framing names complete after at and to (I-2479)", () => {
  it("completes the built-ins and the author's framings after at on a show", () => {
    expect(labels(`${SOFA}scene start\n  [[show backdrop bg at @0]]\nend\n`)).toEqual([...BUILT_INS, "sofa"].sort());
  });

  it("completes them after at on the bare shorthand", () => {
    expect(labels(`${SOFA}scene start\n  [[bunny at @0]]\nend\n`)).toEqual([...BUILT_INS, "sofa"].sort());
  });

  it("completes them after to on an animate", () => {
    expect(labels(`${SOFA}scene start\n  [[animate backdrop to @0]]\nend\n`)).toEqual([...BUILT_INS, "sofa"].sort());
  });

  it("completes a partly typed name", () => {
    expect(labels(`${SOFA}scene start\n  [[animate backdrop to so@0]]\nend\n`)).toContain("sofa");
  });

  it("offers at as a clause on a show and to on an animate, and neither on a hide", () => {
    const show = labels(`scene start\n  [[show backdrop bg @0]]\nend\n`);
    expect(show).toContain("at");
    expect(show).not.toContain("to");
    const animate = labels(`scene start\n  [[animate backdrop @0]]\nend\n`);
    expect(animate).toContain("to");
    expect(animate).not.toContain("at");
    const hide = labels(`scene start\n  [[hide backdrop @0]]\nend\n`);
    expect(hide).not.toContain("at");
    expect(hide).not.toContain("to");
  });
});

describe("framing fields complete inside a framing body (I-2479)", () => {
  it("completes x, y and zoom", () => {
    expect(labels(`framing close {\n  zo@0\n}\n`)).toEqual(["x", "y", "zoom"]);
    expect(labels(`framing close { x = 10%; y@0 }\n`)).toEqual(expect.arrayContaining(["y", "zoom"]));
  });
});

describe("framing names hover (I-2479)", () => {
  it("hovers an author's framing after to with its values", async () => {
    const text = `${SOFA}scene start\n  [[animate backdrop to sofa]]\nend\n`;
    const value = await hoverAt(text, 6, 26);
    expect(value).toContain("**framing** `sofa`");
    expect(value).toContain("`x = 60%` · `y = 100%` · `zoom = 1.2`");
  });

  it("hovers a built-in framing after at", async () => {
    const value = await hoverAt(`scene start\n  [[show backdrop bg at top_right]]\nend\n`, 1, 30);
    expect(value).toContain("**framing** `top_right`");
    expect(value).toContain("`x = 100%` · `y = 0%` · `zoom = 1`");
  });
});
