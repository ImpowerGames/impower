import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisCheckResult, AnalysisDocument, AnalysisProject, AnalysisScopeSourceSelector, AnalysisSourceFacts } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const projects: AnalysisProject[] = [];
afterEach(async () => { await Promise.all(projects.splice(0).map(p => p.dispose())); });
async function project() { const p = await createNodeAnalysisBackend().createProject({ mode: "strict" }); projects.push(p); return p; }
function document(module: string, version: number, source: string, kind: "ast" | "source" = "ast"): AnalysisDocument {
  if (kind === "source") return { module, version, source };
  const unit = luauFileUnit(source, text => compiler.documents.parser.parse(text))!;
  expect(unit.errors).toEqual([]);
  return { module, version, kind, ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(check: AnalysisCheckResult) { expect(check.status, check.message).toBe("ok"); return check; }
function handle(check: AnalysisCheckResult, module = "caller") { return check.documents.find(entry => entry.module === module)!; }
function generation(check: AnalysisCheckResult) { return check.scopeGenerations.find(entry => entry.module === "prelude")!.generation; }
function fields(facts: AnalysisSourceFacts | null) { return facts?.fields.map(({ sourceGeneration, ...field }) => field); }
async function observe(p: AnalysisProject, check: AnalysisCheckResult, selector: AnalysisScopeSourceSelector, module = "caller") {
  const result = await p.queryScopeSourceMetadata(handle(check, module), selector);
  expect(result.status, result.message).toBe("ok"); expect(result.supported).toBe(true); expect(result.truncated).toBe(false);
  expect(result.origin?.complete).toBe(true); expect(result.effective?.complete).toBe(true); return result;
}
const a = { namespace: "alias", name: "A" } as const, b = { namespace: "alias", name: "B" } as const;
const value = { namespace: "value", name: "value" } as const;

test.each(["\n", "\r\n"].flatMap(newline => (["ast", "source"] as const).map(kind => ({ newline, kind }))))(
  "distinct shared-builtin aliases and table origins relocate through retained transitive shadows ($kind/$newline)", async ({ newline, kind }) => {
    const p = await project();
    let source = ["local function earlier(x: number): number", "  return x", "end", 'local marker = "😀"; type A = number',
      "type B = number", "local value = {count = 1}", ""].join(newline);
    const middle = document("middle", 1, 'export type A = string\ndo type B = boolean end\n');
    const caller = document("caller", 1, 'local first: A = "x"\nlocal second: B = value.count\nreturn second\n');
    const links = [{ module: "middle", version: 1, prelude: "prelude" }, { module: "caller", version: 1, prelude: "middle" }];
    await p.update({ projectVersion: 1, documents: [document("prelude", 1, source, kind), middle, caller], scopeLinks: links });
    const cold = ok(await p.check("caller")); expect(cold.checkedModules).toBe(3); expect(cold.diagnostics).toEqual([]);
    const originalA = await observe(p, cold, a, "prelude"), originalB = await observe(p, cold, b);
    const originalValue = await observe(p, cold, value), shadow = await observe(p, cold, a);
    expect(originalA.origin?.fields.map(field => field.name)).toEqual(["A", "A"]);
    expect(originalB.origin?.fields.map(field => field.name)).toEqual(["B", "B"]);
    expect(originalA.origin?.fields[0]?.range).not.toEqual(originalB.origin?.fields[0]?.range);
    expect(shadow.origin?.fields.every(field => field.module === "middle")).toBe(true);
    for (let version = 2; version <= 3; version++) {
      source = source.replace("  return x", "  local copy" + version + ": number = x" + newline + "  return x");
      const update = await p.update({ projectVersion: version, documents: [document("prelude", version, source, kind)] });
      expect(update.work?.changedInputs).toBe(1); expect(update.work?.decodedInputs).toBe(kind === "ast" ? 1 : 0);
      const warm = ok(await p.check("caller"));
      const currentA = await observe(p, warm, a, "prelude"), currentB = await observe(p, warm, b), currentValue = await observe(p, warm, value);
      expect(currentB.origin).toEqual(originalB.origin); expect(currentValue.origin).toEqual(originalValue.origin);
      expect(currentB.effective?.fields.every(field => field.module === "prelude" && field.name === "B")).toBe(true);
      expect(currentA.origin?.fields.every(field => field.name === "A")).toBe(true);
      expect((await observe(p, warm, a)).origin).toEqual(shadow.origin);
      const fresh = await project();
      await fresh.update({ projectVersion: 1, documents: [document("prelude", version, source, kind), middle, caller], scopeLinks: links });
      const freshCheck = ok(await fresh.check("caller"));
      expect(fields(currentB.effective)).toEqual(fields((await observe(fresh, freshCheck, b)).effective));
      expect(fields(currentValue.effective)).toEqual(fields((await observe(fresh, freshCheck, value)).effective));
      expect(warm.diagnostics).toEqual(freshCheck.diagnostics);
      expect((await p.queryType(handle(warm), { line: 1, column: 26 })).type)
        .toBe((await fresh.queryType(handle(freshCheck), { line: 1, column: 26 })).type);
      expect(warm.checkedModules).toBe(1); expect(generation(warm)).toBe(generation(cold));
      expect(warm.nativeRetention).toEqual({ installedInputs: 3, retainedAstInputs: kind === "ast" ? 3 : 2, snapshots: 2, flowOwners: 2, leases: 0 });
    }
    await p.update({ projectVersion: 4, documents: [document("prelude", 4, source.replace("type B = number", "type B = string"), kind)] });
    const changed = ok(await p.check("caller")); expect(changed.checkedModules).toBe(3); expect(generation(changed)).not.toBe(generation(cold));
    expect(changed.diagnostics.some(diagnostic => diagnostic.kind === "TypeMismatch")).toBe(true);
  });

test("unrecorded assignment-created property origins never authorize a location-only reuse", async () => {
  const p = await project();
  const initial = "local function earlier(x: number): number\n  return x\nend\nlocal value = {count = 1}\nvalue.count = 2\n";
  const caller = document("caller", 1, "return value.count\n"), links = [{ module: "caller", version: 1, prelude: "prelude" }];
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, initial), caller], scopeLinks: links });
  const cold = ok(await p.check("caller"));
  await p.update({ projectVersion: 2, documents: [document("prelude", 2, initial.replace("  return x", "  local copy: number = x\n  return x"))] });
  const warm = ok(await p.check("caller")); expect(warm.checkedModules).toBe(2); expect(generation(warm)).not.toBe(generation(cold));
  const unsupported = await p.queryScopeSourceMetadata(handle(warm), value);
  expect(unsupported.status).toBe("ok"); expect(unsupported.supported).toBe(false);
  expect(unsupported.origin).toBeNull(); expect(unsupported.effective).toBeNull();
  expect((await p.queryType(handle(warm), { line: 0, column: 15 })).type).toBe("number");
});

test("committed table views remain project-local and failed same-version publication resets them without retaining owners", async () => {
  const p = await project(), untouched = await project();
  const initial = "local function earlier(x: number): number\n  return x\nend\ntype A = {count: number}\nlocal value: A = {count = 1}\n";
  const caller = document("caller", 1, "local observed: A = value\nreturn observed.count\n");
  const links = [{ module: "caller", version: 1, prelude: "prelude" }];
  const input = { projectVersion: 1, documents: [document("prelude", 1, initial), caller], scopeLinks: links };
  await p.update(input); await untouched.update(input);
  const cold = ok(await p.check("caller")), other = ok(await untouched.check("caller"));
  const original = await observe(p, cold, a), otherOrigin = await observe(untouched, other, a);
  const shifted = initial.replace("  return x", "  local copy: number = x\n  return x");
  const failure = 'type function explode() error("not enough memory") end\ntype Result = explode<>\nlocal result: Result = nil\n';
  await p.update({ projectVersion: 2, documents: [document("prelude", 2, shifted), { module: "failure", version: 1, source: failure }] });
  const beforeFailure = ok(await p.check("caller")), valid = handle(beforeFailure);
  const current = await observe(p, beforeFailure, a); expect(current.origin).toEqual(original.origin);
  expect(current.effective?.fields.find(field => field.kind === "alias-definition")?.range.start.line).toBe(4);
  expect(beforeFailure.checkedModules).toBe(1); expect(generation(beforeFailure)).toBe(generation(cold));
  const otherCurrent = await observe(untouched, other, a);
  expect(otherCurrent.origin).toEqual(otherOrigin.origin); expect(otherCurrent.effective).toEqual(otherOrigin.effective);
  expect((await untouched.check("caller")).checkedModules).toBe(0);
  const version = p.projectVersion, failed = await p.checkModules(["caller", "failure"]);
  expect(failed.status).toBe("error"); expect(failed.documents).toEqual([]); expect(p.projectVersion).toBe(version);
  expect(failed.diagnostics.some(diagnostic => diagnostic.kind === "UserDefinedTypeFunctionError")).toBe(true);
  await expect(p.queryScopeSourceMetadata(valid, a)).rejects.toThrow("Stale");
  await p.reset(); await p.update({ projectVersion: p.projectVersion + 1, removeDocuments: ["failure"] });
  const restored = ok(await p.check("caller")), hydrated = await observe(p, restored, a);
  expect(restored.checkedModules).toBe(2); expect(hydrated.origin).toEqual(hydrated.effective);
  expect(fields(hydrated.effective)).toEqual(fields(current.effective));
  expect(restored.nativeRetention).toEqual({ installedInputs: 2, retainedAstInputs: 2, snapshots: 1, flowOwners: 1, leases: 0 });
  // Distinct transaction: the first root now has a newly shifted producer to
  // check/publish before the later root fails. This phase is not used to prove
  // same-version handle clearing; the valid-handle phase above does that.
  const latest = shifted.replace("  return x", "  local another: number = x\n  return x");
  await p.update({ projectVersion: p.projectVersion + 1, documents: [document("prelude", 3, latest), { module: "failure", version: 2, source: failure }] });
  const unpublished = await p.checkModules(["caller", "failure"]);
  expect(unpublished.status).toBe("error"); expect(unpublished.documents).toEqual([]);
  expect(unpublished.diagnostics.some(diagnostic => diagnostic.kind === "UserDefinedTypeFunctionError")).toBe(true);
  await p.reset(); await p.update({ projectVersion: p.projectVersion + 1, removeDocuments: ["failure"] });
  const latestCheck = ok(await p.check("caller")), latestFacts = await observe(p, latestCheck, a);
  expect(latestFacts.origin).toEqual(latestFacts.effective);
  expect(latestFacts.effective?.fields.find(field => field.kind === "alias-definition")?.range.start.line).toBe(5);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("prelude", 3, latest), caller], scopeLinks: links });
  const freshCheck = ok(await fresh.check("caller"));
  expect(latestCheck.diagnostics).toEqual(freshCheck.diagnostics);
  expect(fields(latestFacts.effective)).toEqual(fields((await observe(fresh, freshCheck, a)).effective));
  expect(latestCheck.nativeRetention).toEqual({ installedInputs: 2, retainedAstInputs: 2, snapshots: 1, flowOwners: 1, leases: 0 });
  await p.update({ projectVersion: p.projectVersion + 1, removeDocuments: ["caller", "prelude"], removeScopeLinks: ["caller"],
    documents: [{ module: "empty", version: 1, source: "return 1\n" }] });
  const removed = ok(await p.check("empty"));
  expect(removed.nativeRetention).toEqual({ installedInputs: 1, retainedAstInputs: 0, snapshots: 0, flowOwners: 0, leases: 0 });
});
