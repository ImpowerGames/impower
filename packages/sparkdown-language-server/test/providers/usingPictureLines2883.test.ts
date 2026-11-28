import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getCodeActions } from "../../src/utils/providers/getCodeActions";
import { getHover } from "../../src/utils/providers/getHover";
import { complete } from "./completionHarness";

const program = {
  context: {
    image: {
      hero: { $type: "image", $name: "hero" },
      dusk: { $type: "image", $name: "dusk" },
    },
    transition: { fade: { $type: "transition", $name: "fade" } },
    animation: { shake: { $type: "animation", $name: "shake" } },
  },
} as any;

const labels = (source: string) => complete(source.replace("|", "@0"), { program }).labels;

describe("completions offer `using` once on a picture line that takes it (I-2883)", () => {
  it.each([
    "[[show portrait hero |]]",
    "[[hide portrait |]]",
    "[[hero |]]",
    "[[animate backdrop dusk |]]",
    "[[show portrait hero with shake |]]",
  ])("%s offers `using`", (source) => {
    expect(labels(source)).toContain("using");
  });

  it.each([
    "[[show portrait hero using fade |]]",
    "[[show portrait hero using fade with shake |]]",
    "[[animate portrait |]]",
    "[[load chapter2 |]]",
    "[[play intro |]]",
    "((play music theme |))",
  ])("%s offers no `using`", (source) => {
    expect(labels(source)).not.toContain("using");
  });

  it("lists only transitions after `using`", () => {
    const offered = labels("[[show portrait hero using |]]");
    expect(offered).toContain("fade");
    expect(offered).not.toContain("shake");
  });

  it("offers the line's `over`, `after` and `ease` after the transition's name", () => {
    expect(labels("[[show portrait hero using fade |]]")).toEqual(expect.arrayContaining(["over", "after", "ease"]));
    expect(labels("[[show portrait hero with shake over 1s after 1s using fade |]]")).toEqual(
      expect.arrayContaining(["over", "after", "ease"]),
    );
    expect(labels("[[show portrait hero over 1s using fade |]]")).not.toContain("over");
  });
});

const MAIN = "file://proj/main.sd";

const compile = (main: string): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: MAIN, type: "script", name: "main", ext: "sd", text: main, version: 1, languageId: "sparkdown" }] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
};

const kindErrors = (text: string) =>
  (compile(text).diagnostics?.[MAIN] ?? []).filter((d) =>
    (typeof d.message === "string" ? d.message : d.message.value).includes("is an animation: write"),
  );

const scene = (line: string) => `scene start\n  ${line}\n  Hello.\nend\n`;

const hoverAt = async (text: string, line: number, character: number) => {
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri: MAIN, text, version: 1, languageId: "sparkdown" } });
  const hover = await getHover(documents.get(MAIN), documents.tree(MAIN), documents.annotations(MAIN), compile(text), undefined, {
    line,
    character,
  });
  return (hover?.contents as { value: string } | undefined)?.value ?? "";
};

describe("hover on the transition after `using` describes it (I-2883)", () => {
  it("names the transition and the animations it arrives and leaves by", async () => {
    const text = scene("[[show portrait hero using fade over 1s]]");
    const at = text.split("\n")[1]!.indexOf("fade") + 2;
    const value = await hoverAt(text, 1, at);
    expect(value).toContain("**transition** `fade`");
    expect(value).toContain("- arrives by `fadein` (0.5s)");
    expect(value).toContain("- leaves by `fadeout` (0.5s)");
  });

  it("lists a transition's other parts with the layer each plays on", async () => {
    const text = scene("[[show portrait hero using screenfade]]");
    const value = await hoverAt(text, 1, text.split("\n")[1]!.indexOf("screenfade") + 3);
    expect(value).toContain("- plays `blackpulse` (1s) on `screen`");
  });
});

describe("the quick fix on an animation after `using` rewrites the word to `with` (I-2883)", () => {
  it("rewrites `using shake` to `with shake` and the error is gone", () => {
    const text = scene("[[show portrait using shake over 1s]]");
    const diagnostics = kindErrors(text);
    expect(diagnostics).toHaveLength(1);
    const document = TextDocument.create(MAIN, "sparkdown", 1, text);
    const actions = getCodeActions(document, diagnostics);
    expect(actions.map((action) => action.title)).toEqual(["Write `with shake`"]);
    const fixed = TextDocument.applyEdits(document, actions[0]!.edit!.changes![MAIN]!);
    expect(fixed).toBe(scene("[[show portrait with shake over 1s]]"));
    expect(kindErrors(fixed)).toEqual([]);
  });

  it("offers nothing once `using` before the name has been edited to another clause word", () => {
    const text = scene("[[show portrait hero using shake]]");
    const diagnostics = kindErrors(text);
    expect(diagnostics).toHaveLength(1);
    const edited = TextDocument.create(MAIN, "sparkdown", 2, scene("[[show portrait hero after shake]]"));
    expect(getCodeActions(edited, diagnostics)).toEqual([]);
  });

  it("offers nothing once the name under the error has been edited", () => {
    const text = scene("[[show portrait using shake]]");
    const diagnostics = kindErrors(text);
    const edited = TextDocument.create(MAIN, "sparkdown", 2, scene("[[show portrait using spin]]"));
    expect(getCodeActions(edited, diagnostics)).toEqual([]);
  });
});
