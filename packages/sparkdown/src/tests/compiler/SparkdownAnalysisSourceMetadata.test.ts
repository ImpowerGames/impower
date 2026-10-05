import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownAnalysis, type SparkdownAnalysisDocument } from "../../compiler/typecheck/SparkdownAnalysis";
import { sparkdownUnits } from "../../compiler/typecheck/LuauDocumentChecker";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const facades: SparkdownAnalysis[] = [];
afterEach(async () => { await Promise.all(facades.splice(0).map(facade => facade.dispose())); });
function document(version: number, text: string): SparkdownAnalysisDocument {
  const tree = compiler.documents.parser.parse(text), units = sparkdownUnits(tree, text);
  expect(units.prelude.errors).toEqual([]); for (const flow of units.flows) expect(flow.errors).toEqual([]);
  return { uri: "metadata.sd", version, text, tree, units: [units.prelude, ...units.flows], mode: "strict" };
}

test("foreign callable source facts project through the target map and story-only shifts keep the native origin", async () => {
  const analysis = new SparkdownAnalysis(await createNodeAnalysisBackend().createProject({ mode: "strict" })); facades.push(analysis);
  const text = "local function later(label: string): string\r\n  return label\r\nend\r\n\r\nscene alpha\r\n  local observed = later(\"x\")\r\nend\r\n";
  const cold = await analysis.analyze({ documents: [document(1, text)], programNames: ["alpha"] });
  expect(cold.outcome.status, cold.outcome.message).toBe("ok"); expect(cold.diagnostics.get("metadata.sd")).toEqual([]);
  const oldMap = cold.documents[0]!;
  const before = await analysis.querySourceMetadata(oldMap, 5, 20);
  expect(before?.status, before?.message).toBe("ok"); expect(before?.allMapped).toBe(true);
  const parameter = before!.locations.find(field => field.kind === "parameter")!;
  expect(parameter).toMatchObject({ uri: "metadata.sd", module: oldMap.units[0]!.module, name: "label", mapEpoch: oldMap.mapEpoch,
    range: { start: { line: 0, column: 21 }, end: { line: 0, column: 26 } } });
  expect(before!.locations.find(field => field.kind === "definition")?.range.end).toEqual({ line: 2, column: 3 });
  expect(await analysis.querySourceMetadata(oldMap, 4, 2)).toBeUndefined(); // Narrative header gap has no syntax ownership.
  const shiftedText = "😀 More story.\r\n" + text;
  const shifted = await analysis.analyze({ documents: [document(2, shiftedText)], programNames: ["alpha"] });
  expect(shifted.stats).toEqual({ encoded: 0, reused: 2, checked: 0 });
  const newMap = shifted.documents[0]!, after = await analysis.querySourceMetadata(newMap, 6, 20);
  expect(after?.allMapped).toBe(true); expect(after!.origin).toEqual(before!.origin);
  expect(after!.effective).toEqual(before!.effective);
  expect(after!.locations.find(field => field.kind === "parameter")).toMatchObject({ uri: "metadata.sd", name: "label", mapEpoch: newMap.mapEpoch,
    range: { start: { line: 1, column: 21 }, end: { line: 1, column: 26 } } });
  expect(Object.isFrozen(after!.locations)).toBe(true);
  await expect(analysis.querySourceMetadata(oldMap, 5, 20)).rejects.toThrow("Stale");
  await analysis.reset();
  const reset = await analysis.analyze({ documents: [document(2, shiftedText)], programNames: ["alpha"] });
  expect(reset.outcome.status, reset.outcome.message).toBe("ok");
  const resetMetadata = await analysis.querySourceMetadata(reset.documents[0]!, 6, 20);
  expect(resetMetadata!.locations.map(({ sourceGeneration, mapEpoch, ...field }) => field))
    .toEqual(after!.locations.map(({ sourceGeneration, mapEpoch, ...field }) => field));
});
