import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { compileSource } from "./compileSnapshot";

function struct(type: "layout" | "component", body: string): any {
  const source = `${type} hud with\nrow {\n${body}\n}\nend\n`;
  const uri = "file:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [{
    uri, type: "script", name: "main", ext: "sd", text: source,
    version: 1, languageId: "sparkdown",
  }] } as any);
  const program = compiler.compile({ textDocument: { uri } }).program;
  expect((program.diagnostics?.[uri] ?? []).filter(d => d.severity === 1)).toEqual([]);
  return compileSource(source).find(e => e.block?.context?.[type]?.["hud"])!.block!.context![type]!["hud"];
}

describe.each(["layout", "component"] as const)("%s static content keys", (type) => {
  test.each([
    ["inline control", 'text "a" "b"'],
    ["continuation", 'text "a"\n  "b"'],
    ["closure boundary", 'text "a" @click={\nprint("hello")\n} "b"'],
    ["content only in continuations", 'text\n"a"\n"b"'],
  ])("%s keeps the first value and excludes all content from its key", (_label, body) => {
    expect(struct(type, body).row).toEqual({ text: "a" });
  });

  test("classes remain in the key and attribute strings are not content", () => {
    expect(struct(type, 'text.label #--label="prop" "a"\n"b"').row).toEqual({ "text label": "a" });
  });
});
