import { expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { compileSource } from "./compileSnapshot";

test.each(["theme", "style"])("%s list literals retain comments ending in a colon", type => {
  const source = `${type} sample with
values {
2-- note:
true// note:
"hi"-- note:
"hi"// note:
2 -- note:
true // note:
"hi" -- note:
"hi" // note:
}
end
`;
  const uri = "file:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [{ uri, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }] } as any);
  const program = compiler.compile({ textDocument: { uri } }).program;
  expect((program.diagnostics?.[uri] ?? []).filter(d => d.severity === 1)).toEqual([]);
  const block = compileSource(source).find(entry => entry.block?.context?.[type]?.["sample"]);
  // Style scalar numbers retain their CSS spelling; theme numbers are numeric.
  const number = type === "style" ? "2" : 2;
  expect((block!.block!.context![type]!["sample"] as any).values).toEqual([number, true, "hi", "hi", number, true, "hi", "hi"]);
});
