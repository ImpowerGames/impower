import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisCheckResult, AnalysisDocument, AnalysisProject, AnalysisSourceFacts } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const projects: AnalysisProject[] = [];
afterEach(async () => { await Promise.all(projects.splice(0).map(project => project.dispose())); });
async function project() { const p = await createNodeAnalysisBackend().createProject({ mode: "strict" }); projects.push(p); return p; }
function ast(module: string, version: number, source: string): AnalysisDocument {
  const unit = luauFileUnit(source, text => compiler.documents.parser.parse(text))!;
  expect(unit.errors).toEqual([]);
  return { module, version, kind: "ast", ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function fields(facts: AnalysisSourceFacts | null) {
  expect(facts?.complete).toBe(true);
  return facts!.fields.map(({ sourceGeneration, ...field }) => field);
}
function scope(check: AnalysisCheckResult, metadata = false) {
  return (metadata ? check.scopeMetadataGenerations : check.scopeGenerations).find(entry => entry.module === "prelude")!.generation;
}
async function observe(p: AnalysisProject, check: AnalysisCheckResult) {
  expect(check.status, check.message).toBe("ok");
  const handle = check.documents.find(handle => handle.module === "caller")!;
  const source = await p.querySourceMetadata(handle, { line: 1, column: 15 });
  expect(source.status, source.message).toBe("ok"); expect(source.supported).toBe(true); expect(source.truncated).toBe(false);
  expect((await p.queryType(handle, { line: 1, column: 18 })).type).toBe("number");
  return { source, origin: fields(source.origin), effective: fields(source.effective) };
}

test.each([
  ["\n", "ast"], ["\r\n", "ast"], ["\n", "source"], ["\r\n", "source"],
] as const)("returned monomorphic callable copies retain their origin through repeated UTF16 shifts (%j, %s)", async (newline, kind) => {
  const p = await project();
  const initial = ['local marker = "😀"; local function factory(value: number)',
    "  return function(input: number): number return input + value end", "end", ""].join(newline);
  const caller = "local f = factory(1)\nlocal result = f(2)\nreturn result\n";
  const input = (version: number, source: string): AnalysisDocument => kind === "ast" ? ast("prelude", version, source)
    : { module: "prelude", version, source };
  await p.update({ projectVersion: 1, documents: [input(1, initial), { module: "caller", version: 1, source: caller }],
    scopeLinks: [{ module: "caller", version: 1, prelude: "prelude" }] });
  const cold = await p.check("caller"), coldFacts = await observe(p, cold);
  expect(cold.checkedModules).toBe(2); expect(cold.diagnostics).toEqual([]);
  expect(coldFacts.origin.find(field => field.kind === "parameter")?.range)
    .toEqual({ start: { line: 1, column: 18 }, end: { line: 1, column: 23 } });
  let text = initial, previous = cold;
  for (let version = 2; version <= 5; version++) {
    text = text.replace("  return function", "  local copy" + version + ": number = value" + newline + "  return function");
    const updated = await p.update({ projectVersion: version, documents: [input(version, text)] });
    expect(updated.work?.changedInputs).toBe(1); expect(updated.work?.decodedInputs).toBe(kind === "ast" ? 1 : 0);
    const warm = await p.check("caller"), warmFacts = await observe(p, warm);
    expect(warm.checkedModules).toBe(1); expect(warm.work?.parsedModules).toBe(kind === "ast" ? 0 : 1);
    expect(scope(warm)).toBe(scope(cold)); expect(scope(warm, true)).toBeGreaterThan(scope(previous, true));
    expect(warmFacts.origin).toEqual(coldFacts.origin);
    expect(warmFacts.source.origin).toEqual(coldFacts.source.origin);
    const fresh = await project();
    await fresh.update({ projectVersion: version, documents: [input(version, text), { module: "caller", version: 1, source: caller }],
      scopeLinks: [{ module: "caller", version: 1, prelude: "prelude" }] });
    const freshCheck = await fresh.check("caller"), freshFacts = await observe(fresh, freshCheck);
    expect(warmFacts.effective).toEqual(freshFacts.effective); expect(warm.diagnostics).toEqual(freshCheck.diagnostics);
    await fresh.dispose(); projects.splice(projects.indexOf(fresh), 1);
    expect(warm.nativeRetention).toEqual({ installedInputs: 2, retainedAstInputs: kind === "ast" ? 1 : 0, snapshots: 1, flowOwners: 1, leases: 0 });
    await expect(p.querySourceMetadata(previous.documents.find(handle => handle.module === "caller")!, { line: 1, column: 15 })).rejects.toThrow("Stale");
    previous = warm;
  }
  await p.reset();
  const reset = await p.check("caller"), resetFacts = await observe(p, reset);
  expect(reset.checkedModules).toBe(2); expect(resetFacts.origin).toEqual(resetFacts.effective);
  await p.update({ projectVersion: p.projectVersion + 1, documents: [{ module: "independent", version: 1, source: "return 0\n" }],
    removeDocuments: ["caller", "prelude"], removeScopeLinks: ["caller"] });
  const removed = await p.check("independent"); expect(removed.status, removed.message).toBe("ok");
  expect(removed.nativeRetention).toEqual({ installedInputs: 1, retainedAstInputs: 0, snapshots: 0, flowOwners: 0, leases: 0 });
});

test("a callable metadata view stays isolated from a second project with the same module and coordinates", async () => {
  const a = await project(), b = await project();
  const source = "local function f(value: number): number\n  return value\nend\n";
  const caller = "local result = f(2)\nreturn result\n";
  const inputs = { projectVersion: 1, documents: [ast("prelude", 1, source), { module: "caller", version: 1, source: caller }],
    scopeLinks: [{ module: "caller", version: 1, prelude: "prelude" }] };
  await a.update(inputs); await b.update(inputs);
  const first = await a.check("caller"), untouched = await b.check("caller");
  const bHandle = untouched.documents.find(handle => handle.module === "caller")!;
  const bOrigin = await b.querySourceMetadata(bHandle, { line: 0, column: 15 });
  await a.update({ projectVersion: 2, documents: [ast("prelude", 2, source.replace("  return value", "  local copy = value\n  return copy"))] });
  const shifted = await a.check("caller"); expect(shifted.checkedModules).toBe(1); expect(scope(shifted)).toBe(scope(first));
  const aFacts = await a.querySourceMetadata(shifted.documents.find(handle => handle.module === "caller")!, { line: 0, column: 15 });
  expect(aFacts.origin?.fields.find(field => field.kind === "definition")?.range.end.line).toBe(2);
  expect(aFacts.effective?.fields.find(field => field.kind === "definition")?.range.end.line).toBe(3);
  const bCurrent = await b.querySourceMetadata(bHandle, { line: 0, column: 15 });
  expect({ sessionId: bCurrent.sessionId, projectVersion: bCurrent.projectVersion, status: bCurrent.status,
    origin: bCurrent.origin, effective: bCurrent.effective, supported: bCurrent.supported, truncated: bCurrent.truncated })
    .toEqual({ sessionId: bOrigin.sessionId, projectVersion: bOrigin.projectVersion, status: bOrigin.status,
      origin: bOrigin.origin, effective: bOrigin.effective, supported: bOrigin.supported, truncated: bOrigin.truncated });
  expect((await b.check("caller")).checkedModules).toBe(0);
});

test("a later root's real ambiguous native failure resets retained callable views and current origins", async () => {
  const p = await project();
  const source = "local function f(value: number): number\n  return value\nend\n";
  const caller = "local result = f(2)\nreturn result\n";
  await p.update({ projectVersion: 1, documents: [ast("prelude", 1, source), { module: "caller", version: 1, source: caller }],
    scopeLinks: [{ module: "caller", version: 1, prelude: "prelude" }] });
  const cold = await p.check("caller"); expect(cold.status, cold.message).toBe("ok");
  const oldHandle = cold.documents.find(handle => handle.module === "caller")!;
  const oldFacts = await p.querySourceMetadata(oldHandle, { line: 0, column: 15 });
  expect(oldFacts.origin?.fields.find(field => field.kind === "definition")?.range.end.line).toBe(2);
  const shifted = source.replace("  return value", "  local copy = value\n  return copy");
  // This is the backend's existing ambiguous-allocation-message policy, not
  // an ordinary type diagnostic or a proven memory-limit/OOM observation.
  const failure = 'type function explode() error("not enough memory") end\ntype Result = explode<>\nlocal value: Result = nil\nreturn value\n';
  await p.update({ projectVersion: 2, documents: [ast("prelude", 2, shifted), { module: "failure", version: 1, source: failure }] });
  const failed = await p.checkModules(["caller", "failure"]);
  expect(failed.status).toBe("error"); expect(failed.documents).toEqual([]);
  expect(failed.diagnostics.some(diagnostic => diagnostic.kind === "UserDefinedTypeFunctionError")).toBe(true);
  await expect(p.querySourceMetadata(oldHandle, { line: 0, column: 15 })).rejects.toThrow("Stale");
  expect((await p.reset()).status).toBe("ok");
  // The earlier v1 handle was already stale after update. Obtain a valid handle
  // at the current revision, then fail a batch without another update/reset.
  const beforeFailure = await p.check("caller"); expect(beforeFailure.status, beforeFailure.message).toBe("ok");
  const sameVersionHandle = beforeFailure.documents.find(handle => handle.module === "caller")!;
  const beforeFailureFacts = await p.querySourceMetadata(sameVersionHandle, { line: 0, column: 15 });
  expect(beforeFailureFacts.status).toBe("ok"); expect(beforeFailureFacts.supported).toBe(true);
  expect(beforeFailureFacts.origin).toEqual(beforeFailureFacts.effective);
  expect(beforeFailureFacts.effective?.fields.find(field => field.kind === "definition")?.range.end.line).toBe(3);
  expect((await p.queryType(sameVersionHandle, { line: 0, column: 18 })).type).toBe("number");
  const currentVersion = p.projectVersion;
  const sameVersionFailure = await p.checkModules(["caller", "failure"]);
  expect(sameVersionFailure.status).toBe("error"); expect(sameVersionFailure.documents).toEqual([]);
  expect(sameVersionFailure.diagnostics.some(diagnostic => diagnostic.kind === "UserDefinedTypeFunctionError")).toBe(true);
  expect(p.projectVersion).toBe(currentVersion);
  await expect(p.querySourceMetadata(sameVersionHandle, { line: 0, column: 15 })).rejects.toThrow("Stale");
  await expect(p.queryType(sameVersionHandle, { line: 0, column: 18 })).rejects.toThrow("Stale");
  expect((await p.reset()).status).toBe("ok");
  await p.update({ projectVersion: p.projectVersion + 1, removeDocuments: ["failure"] });
  const restored = await p.check("caller"); expect(restored.status, restored.message).toBe("ok"); expect(restored.checkedModules).toBe(2);
  expect(restored.nativeRetention).toEqual({ installedInputs: 2, retainedAstInputs: 1, snapshots: 1, flowOwners: 1, leases: 0 });
  const current = await p.querySourceMetadata(restored.documents.find(handle => handle.module === "caller")!, { line: 0, column: 15 });
  expect(current.supported).toBe(true); expect(current.origin).toEqual(current.effective);
  expect(current.origin?.fields.find(field => field.kind === "definition")?.range.end.line).toBe(3);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [ast("prelude", 2, shifted), { module: "caller", version: 1, source: caller }],
    scopeLinks: [{ module: "caller", version: 1, prelude: "prelude" }] });
  const freshCheck = await fresh.check("caller"); expect(restored.diagnostics).toEqual(freshCheck.diagnostics);
  const freshHandle = freshCheck.documents.find(handle => handle.module === "caller")!;
  expect(fields(current.effective)).toEqual(fields((await fresh.querySourceMetadata(freshHandle, { line: 0, column: 15 })).effective));
  expect((await p.queryType(restored.documents.find(handle => handle.module === "caller")!, { line: 0, column: 18 })).type)
    .toBe((await fresh.queryType(freshHandle, { line: 0, column: 18 })).type);
});
