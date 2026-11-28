import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getCodeActions } from "../../src/utils/providers/getCodeActions";
import { complete } from "./completionHarness";

const program = {
  context: {
    transition: { fade: { $type: "transition", $name: "fade" } },
    animation: { shake: { $type: "animation", $name: "shake" } },
  },
} as any;

const labels = (source: string) => complete(source.replace("|", "@0"), { program }).labels;

describe("completions offer `using`, not `with`, on `load` and `play` lines (I-2886)", () => {
  it.each(["[[load chapter2 |]]", "[[play intro |]]", "[[play intro loop |]]"])("%s offers `using` and no `with`", (source) => {
    const offered = labels(source);
    expect(offered).toContain("using");
    expect(offered).not.toContain("with");
  });

  it.each(["[[load chapter2 using fade |]]", "[[play intro using fade |]]"])("%s offers no second `using`", (source) => {
    expect(labels(source)).not.toContain("using");
  });

  it("lists only transitions after `using` on a `play` line", () => {
    const offered = labels("[[play intro using |]]");
    expect(offered).toContain("fade");
    expect(offered).not.toContain("shake");
  });
});

const MAIN = "file://proj/main.sd";

const scene = (line: string) => `scene start\n  ${line}\n  Hello.\nend\n\nscene Chapter2\n  Bye.\nend\n`;

const usingErrors = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: MAIN, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] as never,
  });
  const compiled: SparkProgram = compiler.compile({ textDocument: { uri: MAIN } }).program;
  return (compiled.diagnostics?.[MAIN] ?? []).filter((d) =>
    (typeof d.message === "string" ? d.message : d.message.value).includes("line names its transition with `using`"),
  );
};

describe("the quick fix on a `with` on a `load` line rewrites it to `using` (I-2886)", () => {
  it("rewrites `[[load Chapter2 with fade]]` to `[[load Chapter2 using fade]]` and the error is gone", () => {
    const text = scene("[[load Chapter2 with fade]]");
    const diagnostics = usingErrors(text);
    expect(diagnostics).toHaveLength(1);
    const document = TextDocument.create(MAIN, "sparkdown", 1, text);
    const actions = getCodeActions(document, diagnostics);
    expect(actions.map((action) => action.title)).toEqual(["Write `using fade`"]);
    const fixed = TextDocument.applyEdits(document, actions[0]!.edit!.changes![MAIN]!);
    expect(fixed).toBe(scene("[[load Chapter2 using fade]]"));
    expect(usingErrors(fixed)).toEqual([]);
  });

  it("rewrites a `with` on a `play` line the same way", () => {
    const text = scene("[[play intro with fade]]");
    const diagnostics = usingErrors(text);
    const document = TextDocument.create(MAIN, "sparkdown", 1, text);
    const fixed = TextDocument.applyEdits(document, getCodeActions(document, diagnostics)[0]!.edit!.changes![MAIN]!);
    expect(fixed).toBe(scene("[[play intro using fade]]"));
  });

  it("offers no fix when the name after `with` is not a transition", () => {
    const text = scene("[[load Chapter2 with shake]]");
    const diagnostics = usingErrors(text);
    expect(diagnostics).toHaveLength(1);
    expect(getCodeActions(TextDocument.create(MAIN, "sparkdown", 1, text), diagnostics)).toEqual([]);
  });

  it("offers nothing once the name after `with` has been edited", () => {
    const diagnostics = usingErrors(scene("[[load Chapter2 with fade]]"));
    const edited = TextDocument.create(MAIN, "sparkdown", 2, scene("[[load Chapter2 with fadeX]]"));
    expect(getCodeActions(edited, diagnostics)).toEqual([]);
  });
});
