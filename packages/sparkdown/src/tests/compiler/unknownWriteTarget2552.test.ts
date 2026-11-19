import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";

const MAIN = "file:///proj/main.sd";

const compile = (text: string): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: MAIN, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
};

const targetDiagnostics = (program: SparkProgram) =>
  (program.diagnostics?.[MAIN] ?? [])
    .filter((d) => d.code === "write-target")
    .map((d) => ({
      line: d.range.start.line,
      character: d.range.start.character,
      end: d.range.end.character,
      message: typeof d.message === "string" ? d.message : d.message.value,
    }));

const script = (element: string, write = "@clock: 12:00") => `define ui as config with
  layouts_initial = { "textbox", "hud" }
end

layout hud {
  ${element}
}

scene start
  Rain falls.
  ${write}
  The door opens.
end
`;

describe("write lines to a target no layout element is named after (#2552)", () => {
  it("warns on the target of a write to a class-bearing text element", () => {
    const program = compile(script("text.clock"));
    const found = targetDiagnostics(program);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ line: 10, character: 3, end: 8 });
    expect(found[0]!.message).toContain("`clock`");
    expect(found[0]!.message).toContain("`text.clock`");
  });

  it("does not warn when an element is named after the target", () => {
    expect(targetDiagnostics(compile(script("clock { text }")))).toEqual([]);
  });

  it("does not warn on built-in targets", () => {
    expect(targetDiagnostics(compile(script("clock { text }", "@portrait: hi")))).toEqual([]);
  });

  it("names the close match of a misspelled target", () => {
    const found = targetDiagnostics(compile(script("clock { text }", "@clok: 12:00")));
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("Did you mean `clock`?");
  });

  it("does not warn on an instance of a named element", () => {
    expect(targetDiagnostics(compile(script("clock { text }", "@clock#0: 12:00")))).toEqual([]);
  });
});
