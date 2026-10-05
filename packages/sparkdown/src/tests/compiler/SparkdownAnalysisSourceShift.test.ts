import "../../inkjs/engine/Container";
import { afterEach, expect, test, vi } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { AstStatLocalFunction } from "../../compiler/typecheck/Ast";
import { SparkdownAnalysis, type SparkdownAnalysisDocument, type SparkdownAnalysisPublication } from "../../compiler/typecheck/SparkdownAnalysis";
import { sparkdownUnits } from "../../compiler/typecheck/LuauDocumentChecker";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const facades: SparkdownAnalysis[] = [];
afterEach(async () => { await Promise.all(facades.splice(0).map(facade => facade.dispose())); });
async function facade() {
  const backend = await createNodeAnalysisBackend().createProject({ mode: "strict" });
  const updates = vi.spyOn(backend, "update"), analysis = new SparkdownAnalysis(backend);
  facades.push(analysis); return { analysis, updates };
}
function read(version: number, text: string): SparkdownAnalysisDocument {
  const tree = compiler.documents.parser.parse(text), extracted = sparkdownUnits(tree, text);
  const units = [extracted.prelude, ...extracted.flows];
  expect(units).toHaveLength(3);
  for (const unit of units) expect(unit.errors).toEqual([]);
  return { uri: "shift.sd", version, text, tree, units, mode: "strict" };
}
function ok(result: SparkdownAnalysisPublication) {
  expect(result.outcome.status, result.outcome.message).toBe("ok");
  expect(result.check?.work?.parsedModules).toBe(0); return result;
}
function generation(result: SparkdownAnalysisPublication) {
  const prelude = result.documents[0]!.units[0]!.module;
  return result.check!.scopeGenerations.find(entry => entry.module === prelude)!.generation;
}
function metadataGeneration(result: SparkdownAnalysisPublication) {
  const prelude = result.documents[0]!.units[0]!.module;
  return result.check!.scopeMetadataGenerations.find(entry => entry.module === prelude)!.generation;
}
function functionFacts(document: SparkdownAnalysisDocument) {
  const functions = document.units[0]!.root.body.filter(statement => statement.kind === "StatLocalFunction") as AstStatLocalFunction[];
  expect(functions.map(statement => statement.name.name)).toEqual(["first", "later"]);
  return functions.map(statement => ({ name: statement.name.name, definition: statement.func.location,
    originalName: statement.name.location,
    arguments: statement.func.args.map(argument => ({ name: argument.name, location: argument.location })),
    vararg: statement.func.vararg ? statement.func.varargLocation : null }));
}
async function queries(analysis: SparkdownAnalysis, result: SparkdownAnalysisPublication, text: string) {
  const snapshot = result.documents[0]!, lines = text.split(/\r?\n/);
  const positions = lines.flatMap((line, index) => line.includes("local observed:") ? [{ line: index, column: line.lastIndexOf(")") }] : []);
  expect(positions).toHaveLength(2);
  const types = await Promise.all(positions.map(position => analysis.queryType(snapshot, position.line, position.column)));
  for (const type of types) expect(type?.type).toBe("string");
  return types.map(type => type!.type);
}
async function sourceQueries(analysis: SparkdownAnalysis, result: SparkdownAnalysisPublication, text: string) {
  const snapshot = result.documents[0]!, lines = text.split(/\r?\n/);
  const positions = lines.flatMap((line, index) => line.includes("local observed:") ? [{ line: index, column: line.indexOf("later(") + 2 }] : []);
  expect(positions).toHaveLength(2);
  const results = await Promise.all(positions.map(position => analysis.querySourceMetadata(snapshot, position.line, position.column)));
  for (const metadata of results) {
    expect(metadata?.status, metadata?.message).toBe("ok"); expect(metadata?.supported).toBe(true); expect(metadata?.allMapped).toBe(true);
    expect(metadata?.origin?.complete).toBe(true); expect(metadata?.effective?.complete).toBe(true);
  }
  // These comparisons preserve every source fact but remove only opaque
  // session generations/map epochs, which intentionally differ in a fresh run.
  return results.map(metadata => ({
    origin: metadata!.origin!.fields.map(({ sourceGeneration, ...field }) => field),
    effective: metadata!.effective!.fields.map(({ sourceGeneration, ...field }) => field),
    locations: metadata!.locations.map(({ sourceGeneration, mapEpoch, ...field }) => field),
  }));
}

test.each(["\n", "\r\n"])("a body newline shifts later signatures and maps while retaining callers (%j)", async newline => {
  const original = [
    "local function first(value: number): number", "  return value", "end",
    "local function later(label: string): string", "  return label", "end", "",
    "scene alpha", "  local observed: string = later(1)", "  local firstObserved: number = first(2)", "end", "",
    "scene beta", "  local observed: string = later(2)", "end", "",
  ].join(newline);
  const initialDocument = read(1, original);
  const { analysis, updates } = await facade(), cold = ok(await analysis.analyze({ documents: [initialDocument], programNames: ["alpha", "beta"] }));
  expect(cold.stats).toEqual({ encoded: 3, reused: 0, checked: 3 });
  expect(cold.diagnostics.get("shift.sd")).toHaveLength(2);
  await queries(analysis, cold, original);
  const coldMetadata = await sourceQueries(analysis, cold, original);
  const shifted = original.replace("  return value", "  local copy: number = value" + newline + "  return copy");
  const shiftedDocument = read(2, shifted);
  const warm = ok(await analysis.analyze({ documents: [shiftedDocument], programNames: ["alpha", "beta"] }));
  const { analysis: fresh } = await facade(), freshShifted = ok(await fresh.analyze({ documents: [read(2, shifted)], programNames: ["alpha", "beta"] }));
  expect(warm.diagnostics).toEqual(freshShifted.diagnostics);
  expect(await queries(analysis, warm, shifted)).toEqual(await queries(fresh, freshShifted, shifted));
  const warmMetadata = await sourceQueries(analysis, warm, shifted);
  const freshMetadata = await sourceQueries(fresh, freshShifted, shifted);
  expect(warmMetadata.map(({ effective, locations }) => ({ effective, locations })))
    .toEqual(freshMetadata.map(({ effective, locations }) => ({ effective, locations })));
  const firstMetadata = await analysis.querySourceMetadata(warm.documents[0]!, 0, 17);
  expect(firstMetadata?.supported).toBe(true); expect(firstMetadata?.allMapped).toBe(true);
  expect(firstMetadata!.locations.find(field => field.kind === "definition")?.range)
    .toEqual({ start: { line: 0, column: 0 }, end: { line: 3, column: 3 } });
  const shiftedLines = shifted.split(/\r?\n/);
  const firstCallLine = shiftedLines.findIndex(line => line.includes("local firstObserved:"));
  const borrowedFirstMetadata = await analysis.querySourceMetadata(warm.documents[0]!, firstCallLine, shiftedLines[firstCallLine]!.indexOf("first(") + 2);
  expect(borrowedFirstMetadata?.supported).toBe(true); expect(borrowedFirstMetadata?.allMapped).toBe(true);
  expect(borrowedFirstMetadata!.locations.find(field => field.kind === "definition")?.range)
    .toEqual({ start: { line: 0, column: 0 }, end: { line: 3, column: 3 } });
  for (const metadata of warmMetadata) {
    expect(metadata.locations.find(field => field.kind === "definition")?.range)
      .toEqual({ start: { line: 4, column: 0 }, end: { line: 6, column: 3 } });
    expect(metadata.locations.find(field => field.kind === "parameter")?.range)
      .toEqual({ start: { line: 4, column: 21 }, end: { line: 4, column: 26 } });
  }
  expect(warm.diagnostics.get("shift.sd")!.map(diagnostic => diagnostic.start.line))
    .toEqual(cold.diagnostics.get("shift.sd")!.map(diagnostic => diagnostic.start.line + 1));
  expect(warm.documents[0]!.mapEpoch).not.toBe(cold.documents[0]!.mapEpoch);
  await expect(analysis.queryType(cold.documents[0]!, 8, 33)).rejects.toThrow("Stale");
  expect(warm.documents[0]!.units.slice(1).map(unit => [unit.module, unit.unitVersion]))
    .toEqual(cold.documents[0]!.units.slice(1).map(unit => [unit.module, unit.unitVersion]));
  console.log("Source-shift native observation", JSON.stringify({ newline, cold: cold.stats, shifted: warm.stats,
    sentModules: updates.mock.calls.at(-1)![0].documents!.map(document => document.module),
    coldGeneration: generation(cold), shiftedGeneration: generation(warm),
    originalFunctionFacts: functionFacts(initialDocument), shiftedFunctionFacts: functionFacts(shiftedDocument),
    coldNativeMetadata: coldMetadata, shiftedNativeMetadata: warmMetadata,
    currentDiagnosticRanges: warm.diagnostics.get("shift.sd")!.map(diagnostic => ({ start: diagnostic.start, end: diagnostic.end })) }));
  // This is the accepted #999 behavior. A conservative metadata recheck is
  // still an incremental failure, even when the diagnostics above are correct.
  expect(warm.stats).toEqual({ encoded: 1, reused: 2, checked: 1 });
  expect(updates.mock.calls.at(-1)![0].documents).toHaveLength(1);
  expect(generation(warm)).toBe(generation(cold));
  expect(metadataGeneration(warm)).toBeGreaterThan(metadataGeneration(cold));
  expect(warmMetadata.map(metadata => metadata.origin)).toEqual(coldMetadata.map(metadata => metadata.origin));
  // The newly checked prelude has current raw metadata, while its reused
  // caller still borrows the original immutable graph revision.
  expect(firstMetadata!.origin!.fields.find(field => field.kind === "definition")?.range.end).toEqual({ line: 3, column: 3 });
  expect(borrowedFirstMetadata!.origin!.fields.find(field => field.kind === "definition")?.range.end).toEqual({ line: 2, column: 3 });

  const warning = shifted.replace("  return copy", "  local wrong: number = \"bad\"" + newline + "  return copy");
  const warned = ok(await analysis.analyze({ documents: [read(3, warning)], programNames: ["alpha", "beta"] }));
  const { analysis: warningFresh } = await facade(), freshWarning = ok(await warningFresh.analyze({ documents: [read(3, warning)], programNames: ["alpha", "beta"] }));
  expect(warned.diagnostics).toEqual(freshWarning.diagnostics);
  expect(warned.diagnostics.get("shift.sd")).toHaveLength(3);
  expect(await queries(analysis, warned, warning)).toEqual(await queries(warningFresh, freshWarning, warning));
  const warningMetadata = await sourceQueries(analysis, warned, warning), freshWarningMetadata = await sourceQueries(warningFresh, freshWarning, warning);
  expect(warningMetadata.map(({ effective, locations }) => ({ effective, locations })))
    .toEqual(freshWarningMetadata.map(({ effective, locations }) => ({ effective, locations })));
  expect(warningMetadata.map(metadata => metadata.origin)).toEqual(coldMetadata.map(metadata => metadata.origin));
  expect(warned.stats).toEqual({ encoded: 1, reused: 2, checked: 1 });
  expect(generation(warned)).toBe(generation(warm));
  expect(metadataGeneration(warned)).toBeGreaterThan(metadataGeneration(warm));

  const signature = warning.replace("later(label: string)", "later(label: number)").replace("  return label", "  return tostring(label)");
  const changed = ok(await analysis.analyze({ documents: [read(4, signature)], programNames: ["alpha", "beta"] }));
  const { analysis: signatureFresh } = await facade(), freshSignature = ok(await signatureFresh.analyze({ documents: [read(4, signature)], programNames: ["alpha", "beta"] }));
  expect(changed.diagnostics).toEqual(freshSignature.diagnostics);
  expect(changed.diagnostics.get("shift.sd")).toHaveLength(1);
  expect(await queries(analysis, changed, signature)).toEqual(await queries(signatureFresh, freshSignature, signature));
  expect(changed.stats).toEqual({ encoded: 1, reused: 2, checked: 3 });
  expect(generation(changed)).not.toBe(generation(warned));
});
