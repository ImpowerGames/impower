import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisCheckResult, AnalysisDocument, AnalysisProject, AnalysisScopeSourceQueryResult, AnalysisSourceFacts } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const projects: AnalysisProject[] = [];
afterEach(async () => { await Promise.all(projects.splice(0).map(project => project.dispose())); });
async function project() { const p = await createNodeAnalysisBackend().createProject({ mode: "strict" }); projects.push(p); return p; }
function document(module: string, version: number, source: string, kind: "ast" | "source" = "ast"): AnalysisDocument {
  if (kind === "source") return { module, version, source };
  const unit = luauFileUnit(source, wrapped => compiler.documents.parser.parse(wrapped))!;
  expect(unit.errors).toEqual([]);
  return { module, version, kind, ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(check: AnalysisCheckResult) { expect(check.status, check.message).toBe("ok"); return check; }
function handle(check: AnalysisCheckResult, module: string) { return check.documents.find(entry => entry.module === module)!; }
function observed(result: AnalysisScopeSourceQueryResult) {
  expect(result.status, result.message).toBe("ok"); expect(result.supported).toBe(true); expect(result.truncated).toBe(false);
  expect(result.origin?.complete).toBe(true); expect(result.effective).toEqual(result.origin); return result.origin!;
}
function fields(facts: AnalysisSourceFacts) { return facts.fields.map(({ sourceGeneration, ...field }) => field); }
function range(line: number, start: number, end: number) { return { start: { line, column: start }, end: { line, column: end } }; }
function unsupported(result: AnalysisScopeSourceQueryResult) {
  expect(result.status, result.message).toBe("ok"); expect(result.supported).toBe(false);
  expect(result.origin).toBeNull(); expect(result.effective).toBeNull(); expect(result.truncated).toBe(false);
}

test.each(["\n", "\r\n"].flatMap(newline => (["ast", "source"] as const).map(kind => ({ newline, kind }))))(
  "exact alias/annotated/inferred property source roles use UTF16 ($kind/$newline)", async ({ newline, kind }) => {
    const p = await project();
    const alias = 'local marker = "😀"; type Shape = {read count: number}';
    const value = 'local inferred = {count = 1}';
    const text = [alias, value, "return inferred", ""].join(newline);
    await p.update({ projectVersion: 1, documents: [document("own", 1, text, kind)] });
    const check = ok(await p.check("own")); expect(check.diagnostics).toEqual([]);
    const own = handle(check, "own");
    const aliasFacts = observed(await p.queryScopeSourceMetadata(own, { namespace: "alias", name: "Shape" }));
    expect(fields(aliasFacts)).toEqual([
      { kind: "alias-definition", name: "Shape", index: 0, module: "own", range: range(0, alias.indexOf("type Shape"), alias.length) },
      { kind: "alias-name", name: "Shape", index: 0, module: "own", range: range(0, alias.indexOf("Shape"), alias.indexOf("Shape") + 5) },
      { kind: "table-definition", name: "", index: 0, module: "own", range: range(0, alias.indexOf("{"), alias.length) },
      { kind: "property-type-location", name: "count", index: 0, module: "own", range: range(0, alias.indexOf("count"), alias.indexOf("count") + 5) },
    ]);
    const valueFacts = observed(await p.queryScopeSourceMetadata(own, { namespace: "value", name: "inferred" }));
    expect(fields(valueFacts)).toEqual([
      { kind: "table-definition", name: "", index: 0, module: "own", range: range(1, value.indexOf("{"), value.length) },
      { kind: "property-location", name: "count", index: 0, module: "own", range: range(1, value.indexOf("count"), value.indexOf("count") + 5) },
    ]);
    expect(new Set([...aliasFacts.fields, ...valueFacts.fields].map(field => field.sourceGeneration)).size).toBe(1);
    expect(Object.isFrozen(aliasFacts.fields[0]!.range.start)).toBe(true);
    const bounded = await p.queryScopeSourceMetadata(own, { namespace: "alias", name: "Shape" }, 1);
    expect(bounded.supported).toBe(true); expect(bounded.truncated).toBe(true);
    expect(bounded.origin?.fields).toHaveLength(1); expect(bounded.origin?.complete).toBe(false);
  });

test("root aliases sharing a builtin remain distinct and nested private names never replace the root", async () => {
  const p = await project();
  const prelude = "type A = number\ntype B = number\n";
  const caller = "type A = string\ndo type B = boolean; type Hidden = number end\nlocal a: A = \"x\"\nlocal b: B = 1\nreturn a\n";
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, prelude), document("caller", 1, caller)],
    scopeLinks: [{ module: "caller", version: 1, prelude: "prelude" }] });
  const check = ok(await p.check("caller")); expect(check.diagnostics).toEqual([]);
  const first = observed(await p.queryScopeSourceMetadata(handle(check, "prelude"), { namespace: "alias", name: "A" }));
  const second = observed(await p.queryScopeSourceMetadata(handle(check, "prelude"), { namespace: "alias", name: "B" }));
  expect(first.fields.map(field => field.name)).toEqual(["A", "A"]);
  expect(second.fields.map(field => field.name)).toEqual(["B", "B"]);
  expect(first.fields[0]!.range).toEqual(range(0, 0, 15)); expect(second.fields[0]!.range).toEqual(range(1, 0, 15));
  const shadow = observed(await p.queryScopeSourceMetadata(handle(check, "caller"), { namespace: "alias", name: "A" }));
  expect(shadow.fields.every(field => field.module === "caller")).toBe(true);
  expect(shadow.fields[0]!.range).toEqual(range(0, 0, 15));
  expect(observed(await p.queryScopeSourceMetadata(handle(check, "caller"), { namespace: "alias", name: "B" }))).toEqual(second);
  unsupported(await p.queryScopeSourceMetadata(handle(check, "caller"), { namespace: "alias", name: "Hidden" }));
  unsupported(await p.queryScopeSourceMetadata(handle(check, "caller"), { namespace: "value", name: "A" }));
});

test("cloned table and alias entries preserve their original generation across equal predecessor rechecks and a transitive consumer", async () => {
  const p = await project();
  const initial = "local function earlier(value: number): number return value + 0 end\ntype Shape = {count: number}\nlocal shared: Shape = {count = 1}\n";
  const middle = "local bridge: Shape = shared\n";
  const caller = "local value: Shape = bridge\nreturn value.count\n";
  const links = [{ module: "middle", version: 1, prelude: "prelude" }, { module: "caller", version: 1, prelude: "middle" }];
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, initial), document("middle", 1, middle), document("caller", 1, caller)], scopeLinks: links });
  const cold = ok(await p.check("caller")); expect(cold.diagnostics).toEqual([]);
  const origin = observed(await p.queryScopeSourceMetadata(handle(cold, "prelude"), { namespace: "alias", name: "Shape" }));
  const borrowed = observed(await p.queryScopeSourceMetadata(handle(cold, "caller"), { namespace: "alias", name: "Shape" }));
  expect(borrowed).toEqual(origin); expect(borrowed.fields.every(field => field.module === "prelude")).toBe(true);
  for (let version = 2; version <= 3; version++) {
    await p.update({ projectVersion: version, documents: [document("prelude", version, initial.replace("+ 0", "+ " + version)), document("caller", version, caller)] });
    const warm = ok(await p.check("caller")); expect(warm.diagnostics).toEqual([]);
    expect(warm.scopeGenerations).toEqual(cold.scopeGenerations);
    const own = observed(await p.queryScopeSourceMetadata(handle(warm, "prelude"), { namespace: "alias", name: "Shape" }));
    expect(fields(own)).toEqual(fields(origin)); expect(own.fields[0]!.sourceGeneration).not.toBe(origin.fields[0]!.sourceGeneration);
    const copied = await p.queryScopeSourceMetadata(handle(warm, "caller"), { namespace: "alias", name: "Shape" });
    expect(copied.status).toBe("ok"); expect(copied.supported).toBe(true); expect(copied.origin).toEqual(origin);
    expect(copied.effective).toEqual(own);
    const table = await p.queryScopeSourceMetadata(handle(warm, "caller"), { namespace: "value", name: "shared" });
    expect(table.supported).toBe(true);
    expect(table.origin?.fields).toEqual(origin.fields.filter(field => field.kind === "table-definition" || field.kind === "property-type-location"));
    expect(table.effective?.fields).toEqual(own.fields.filter(field => field.kind === "table-definition" || field.kind === "property-type-location"));
    expect((await p.queryType(handle(warm, "caller"), { line: 1, column: 13 })).type).toBe("number");
  }
});

test("foreign, reassigned, dynamic and merged property origins are explicitly unsupported", async () => {
  const p = await project();
  const source = "local reassigned = {count = 1}\nreassigned.count = 2\nlocal created = {}\ncreated.added = 1\nlocal dynamic = {[1] = 1}\nlocal merged: {count: number} | {other: string} = nil :: any\nlocal foreign = require(\"target\")\nreturn reassigned\n";
  await p.update({ projectVersion: 1, documents: [document("own", 1, source), document("target", 1, "return {count = 1}\n")] });
  const check = ok(await p.check("own")); expect(check.diagnostics).toEqual([]);
  for (const name of ["reassigned", "created", "dynamic", "merged", "foreign"])
    unsupported(await p.queryScopeSourceMetadata(handle(check, "own"), { namespace: "value", name }));
  expect((await p.queryType(handle(check, "own"), { line: 1, column: 13 })).type).toBe("number");
});

test("entry observers snapshot selectors and reject cross-instance/reset handles and invalid bounds", async () => {
  const a = await project(), b = await project();
  const input = { projectVersion: 1, documents: [document("same", 1, "type Shape = {count: number}\n")] };
  await a.update(input); await b.update(input);
  const first = ok(await a.check("same")), second = ok(await b.check("same"));
  const own = handle(first, "same"), selector = { namespace: "alias" as const, name: "Shape" };
  const pending = a.queryScopeSourceMetadata(own, selector); selector.name = "wrong"; own.module = "wrong";
  const actual = await pending; observed(actual); expect(actual.selector).toEqual({ namespace: "alias", name: "Shape" }); expect(Object.isFrozen(actual.selector)).toBe(true);
  const valid = { ...own, module: "same" };
  await expect(b.queryScopeSourceMetadata(valid, { namespace: "alias", name: "Shape" })).rejects.toThrow("Stale");
  await expect(a.queryScopeSourceMetadata(valid, { namespace: "alias", name: "Shape" }, 129)).rejects.toThrow("bounds");
  await expect(a.queryScopeSourceMetadata(valid, { namespace: "alias", name: "" })).rejects.toThrow("bounds");
  await expect(a.queryScopeSourceMetadata(valid, { namespace: "alias", name: String.fromCharCode(0) })).rejects.toThrow("bounds");
  await a.update({ projectVersion: 2, documents: [document("same", 2, "\ntype Shape = {count: number}\n")] });
  const moved = ok(await a.check("same"));
  const current = observed(await a.queryScopeSourceMetadata(handle(moved, "same"), { namespace: "alias", name: "Shape" }));
  expect(current.fields[0]!.range.start.line).toBe(1);
  await expect(a.queryScopeSourceMetadata(valid, { namespace: "alias", name: "Shape" })).rejects.toThrow("Stale");
  const untouched = observed(await b.queryScopeSourceMetadata(handle(second, "same"), { namespace: "alias", name: "Shape" }));
  expect(untouched.fields[0]!.range.start.line).toBe(0);
  expect(fields(untouched)).toEqual(fields(actual.origin!)); expect((await b.check("same")).checkedModules).toBe(0);
  await b.reset(); await expect(b.queryScopeSourceMetadata(handle(second, "same"), { namespace: "alias", name: "Shape" })).rejects.toThrow("Stale");
  const restored = ok(await b.check("same"));
  expect(fields(observed(await b.queryScopeSourceMetadata(handle(restored, "same"), { namespace: "alias", name: "Shape" })))).toEqual(fields(untouched));
});

test("a real failed batch clears a valid same-version entry handle and reset/removal releases its owners", async () => {
  const p = await project();
  const prelude = "type Shape = {count: number}\nlocal shared: Shape = {count = 1}\n";
  const caller = "local value: Shape = shared\nreturn value.count\n";
  const failure = 'type function explode() error("not enough memory") end\ntype Result = explode<>\nlocal value: Result = nil\nreturn value\n';
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, prelude), document("caller", 1, caller), document("failure", 1, failure, "source")],
    scopeLinks: [{ module: "caller", version: 1, prelude: "prelude" }] });
  const before = ok(await p.check("caller")); const valid = handle(before, "caller");
  const original = observed(await p.queryScopeSourceMetadata(valid, { namespace: "alias", name: "Shape" }));
  const version = p.projectVersion, failed = await p.checkModules(["caller", "failure"]);
  // Existing ambiguous-allocation-message policy, not an ordinary diagnostic
  // or a claim that the bounded input exhausted native memory.
  expect(failed.status).toBe("error"); expect(failed.documents).toEqual([]); expect(p.projectVersion).toBe(version);
  expect(failed.diagnostics.some(diagnostic => diagnostic.kind === "UserDefinedTypeFunctionError")).toBe(true);
  await expect(p.queryScopeSourceMetadata(valid, { namespace: "alias", name: "Shape" })).rejects.toThrow("Stale");
  await p.reset(); await p.update({ projectVersion: p.projectVersion + 1, removeDocuments: ["failure"] });
  const restored = ok(await p.check("caller")); expect(restored.diagnostics).toEqual([]);
  expect(fields(observed(await p.queryScopeSourceMetadata(handle(restored, "caller"), { namespace: "alias", name: "Shape" })))).toEqual(fields(original));
  expect(restored.nativeRetention).toEqual({ installedInputs: 2, retainedAstInputs: 2, snapshots: 1, flowOwners: 1, leases: 0 });
  await p.update({ projectVersion: p.projectVersion + 1, removeDocuments: ["caller", "prelude"], documents: [document("empty", 1, "return 1\n", "source")] });
  const removed = ok(await p.check("empty"));
  expect(removed.nativeRetention).toEqual({ installedInputs: 1, retainedAstInputs: 0, snapshots: 0, flowOwners: 0, leases: 0 });
});
