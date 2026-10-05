import "../../inkjs/engine/Container";
import { expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownAnalysisInputs } from "../../compiler/typecheck/SparkdownAnalysisInputs";
import { sparkdownUnits } from "../../compiler/typecheck/LuauDocumentChecker";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
function read(source: string) {
  const units = sparkdownUnits(compiler.documents.parser.parse(source), source);
  expect(units.prelude.errors).toEqual([]);
  for (const flow of units.flows) expect(flow.errors).toEqual([]);
  return [units.prelude, ...units.flows];
}

test("same-line empty prelude cannot own a flow parameter or its narrative and whitespace", () => {
  const text = "scene alpha(n: number)\n  local value: number = n\n  Narrative only.\nend\n";
  const cache = new SparkdownAnalysisInputs(), snapshot = cache.update("main.sd", 1, read(text));
  expect(snapshot.units).toHaveLength(2);
  expect(snapshot.units[0]!.lines).toContain(0);
  expect(snapshot.units[1]!.lines).toContain(0);
  expect(cache.unitPosition(snapshot, 0, 12)?.module).toBe(snapshot.units[1]!.module);
  expect(cache.unitPosition(snapshot, 0, 2)).toBeUndefined(); // Synthetic scene wrapper is not authored Luau.
  expect(cache.unitPosition(snapshot, 1, 0)).toBeUndefined();
  const body = text.split("\n")[1]!;
  expect(cache.unitPosition(snapshot, 1, body.lastIndexOf("n"))?.module).toBe(snapshot.units[1]!.module);
  expect(cache.unitPosition(snapshot, 1, body.length)).toBeUndefined();
  expect(cache.unitPosition(snapshot, 2, 3)).toBeUndefined();
});

test("inline comments and delimiters retain only the actual marked call ownership after CRLF story shifts", () => {
  const line = '  & print("😀") -- After comment.';
  const source = "scene alpha\r\n  😀 before.\r\n" + line + "\r\nend\r\n";
  const cache = new SparkdownAnalysisInputs(), cold = cache.update("main.sd", 1, read(source));
  const print = line.indexOf("print"), close = line.indexOf(")");
  expect(cold.units).toHaveLength(2);
  expect(cache.unitPosition(cold, 2, print)?.module).toBe(cold.units[1]!.module);
  expect(cache.unitPosition(cold, 2, close)?.module).toBe(cold.units[1]!.module);
  expect(cache.unitPosition(cold, 1, 5)).toBeUndefined();
  expect(cache.unitPosition(cold, 2, line.indexOf("After"))).toBeUndefined();
  expect(cache.unitPosition(cold, 2, line.indexOf("&"))).toBeUndefined(); // Authored discard marker.
  expect(cache.unitPosition(cold, 2, print - 1)).toBeUndefined(); // Whitespace before the call.
  expect(cache.unitPosition(cold, 2, close + 1)).toBeUndefined(); // Whitespace before the comment.
  const staged = cache.prepare("main.sd", 2, read(source.replace("scene alpha\r\n", "scene alpha\r\n  More story.\r\n")));
  expect(staged.stats.encoded).toBe(0);
  expect(cache.unitPosition(cold, 2, print)?.module).toBe(cold.units[1]!.module);
  expect(cache.unitPosition(staged, 3, print)).toBeUndefined();
  cache.publish([staged]);
  expect(cache.unitPosition(cold, 2, print)).toBeUndefined();
  expect(cache.unitPosition(staged, 3, print)?.module).toBe(cold.units[1]!.module);
  expect(cache.unitPosition(staged, 3, line.indexOf("After"))).toBeUndefined();
});
