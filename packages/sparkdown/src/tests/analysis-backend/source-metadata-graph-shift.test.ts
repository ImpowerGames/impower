import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisAstDocument, AnalysisCheckResult, AnalysisProject, AnalysisScopeSourceSelector, AnalysisSourceFacts } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const projects: AnalysisProject[] = [];
afterEach(async () => { await Promise.all(projects.splice(0).map(project => project.dispose())); });
async function project() { const p = await createNodeAnalysisBackend().createProject({ mode: "strict" }); projects.push(p); return p; }
function document(module: string, version: number, source: string): AnalysisAstDocument {
  const unit = luauFileUnit(source, text => compiler.documents.parser.parse(text))!;
  expect(unit.errors).toEqual([]);
  return { module, version, kind: "ast", ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(check: AnalysisCheckResult) { expect(check.status, check.message).toBe("ok"); expect(check.work?.parsedModules).toBe(0); return check; }
function generation(check: AnalysisCheckResult) { return check.scopeGenerations.find(entry => entry.module === "prelude")!.generation; }
function metadataGeneration(check: AnalysisCheckResult) { return check.scopeMetadataGenerations.find(entry => entry.module === "prelude")!.generation; }
function fields(facts: AnalysisSourceFacts | null) { return facts?.fields.map(({ sourceGeneration, ...field }) => field); }
async function facts(p: AnalysisProject, check: AnalysisCheckResult, selector: AnalysisScopeSourceSelector) {
  const result = await p.queryScopeSourceMetadata(check.documents.find(entry => entry.module === "flow")!, selector);
  expect(result.status, result.message).toBe("ok"); expect(result.supported).toBe(true); expect(result.truncated).toBe(false);
  expect(result.origin?.complete).toBe(true); expect(result.effective?.complete).toBe(true); return result;
}
async function type(p: AnalysisProject, check: AnalysisCheckResult) {
  const handle = check.documents.find(entry => entry.module === "flow")!;
  const result = await p.queryType(handle, { line: 1, column: 7 });
  expect(result.status, result.message).toBe("ok"); expect(result.type).not.toBeNull(); return result.type;
}
const cases = [
  { name: "named table alias and annotated property", declaration: "type Shape = {count: number}\nlocal value: Shape = {count = 1}\n",
    changed: (text: string) => text.replace("count: number", "count: string").replace("count = 1", 'count = "one"') },
  { name: "read-only property alias", declaration: "type Shape = {read count: number}\nlocal value: Shape = {} :: any\n",
    changed: (text: string) => text.replace("count: number", "count: string") },
  { name: "inferred table property", declaration: "local value = {count = 1}\n",
    changed: (text: string) => text.replace("count = 1", 'count = "one"') },
];

test.each(cases)("$name retains callers when earlier body lines shift its source metadata", async fixture => {
  const p = await project();
  const body = "local function earlier(value: number): number\n  return value\nend\n";
  const initial = body + fixture.declaration;
  const flow = document("flow", 1, "local required: string = value.count\nreturn value\n");
  const links = [{ module: "flow", version: 1, prelude: "prelude" }];
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, initial), flow], scopeLinks: links });
  const cold = ok(await p.check("flow")); expect(cold.checkedModules).toBe(2); expect(cold.diagnostics).toHaveLength(1);
  expect(cold.diagnostics[0]?.module).toBe("flow"); expect(cold.diagnostics[0]?.kind).toBe("TypeMismatch");
  const initialType = await type(p, cold);
  const selector: AnalysisScopeSourceSelector = fixture.name === "inferred table property"
    ? { namespace: "value", name: "value" } : { namespace: "alias", name: "Shape" };
  const original = await facts(p, cold, selector);
  expect(original.origin).toEqual(original.effective);
  expect(ok(await p.check("flow")).checkedModules).toBe(0);
  let text = initial, previous = cold;
  for (let version = 2; version <= 3; version++) {
    text = text.replace("  return value", "  local copy" + version + ": number = value\n  return value");
    const updated = await p.update({ projectVersion: version, documents: [document("prelude", version, text)] });
    expect(updated.work?.changedInputs).toBe(1); expect(updated.work?.decodedInputs).toBe(1);
    const warm = ok(await p.check("flow")), warmType = await type(p, warm);
    const fresh = await project();
    await fresh.update({ projectVersion: 1, documents: [document("prelude", version, text), flow], scopeLinks: links });
    const freshCheck = ok(await fresh.check("flow"));
    expect(warm.diagnostics).toEqual(freshCheck.diagnostics); expect(warmType).toBe(await type(fresh, freshCheck));
    expect(warmType).toBe(initialType);
    const current = await facts(p, warm, selector), freshFacts = await facts(fresh, freshCheck, selector);
    expect(current.origin).toEqual(original.origin);
    expect(fields(current.effective)).toEqual(fields(freshFacts.effective));
    expect(current.effective!.fields.every(field => field.sourceGeneration !== original.origin!.fields[0]!.sourceGeneration)).toBe(true);
    expect(current.effective!.fields.find(field => field.kind === "table-definition")!.range.start.line)
      .toBe(original.origin!.fields.find(field => field.kind === "table-definition")!.range.start.line + version - 1);
    const limited = await p.queryScopeSourceMetadata(warm.documents.find(entry => entry.module === "flow")!, selector, 1);
    expect(limited.supported).toBe(true); expect(limited.truncated).toBe(true); expect(limited.effective?.complete).toBe(false);
    await fresh.dispose(); projects.splice(projects.indexOf(fresh), 1);
    console.log("Wider source-role shift", { name: fixture.name, version, checked: warm.checkedModules,
      coldGeneration: generation(cold), generation: generation(warm), work: updated.work, diagnostics: warm.diagnostics });
    expect(warm.checkedModules).toBe(1); expect(generation(warm)).toBe(generation(cold));
    expect(metadataGeneration(warm)).toBeGreaterThan(metadataGeneration(previous));
    expect(warm.nativeRetention).toEqual({ installedInputs: 2, retainedAstInputs: 2, snapshots: 1, flowOwners: 1, leases: 0 });
    previous = warm;
  }
  const changed = fixture.changed(text);
  await p.update({ projectVersion: 4, documents: [document("prelude", 4, changed)] });
  const warm = ok(await p.check("flow")); expect(warm.checkedModules).toBe(2); expect(generation(warm)).not.toBe(generation(cold));
  expect(warm.diagnostics).toEqual([]);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("prelude", 4, changed), flow], scopeLinks: links });
  const freshCheck = ok(await fresh.check("flow")); expect(warm.diagnostics).toEqual(freshCheck.diagnostics);
  expect(await type(p, warm)).toBe(await type(fresh, freshCheck));
  const changedFacts = await facts(p, warm, selector), freshChanged = await facts(fresh, freshCheck, selector);
  expect(changedFacts.origin).toEqual(changedFacts.effective); expect(fields(changedFacts.effective)).toEqual(fields(freshChanged.effective));
});
