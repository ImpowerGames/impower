import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisAstDocument, AnalysisCheckResult, AnalysisProject } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const projects: AnalysisProject[] = [];
afterEach(async () => { await Promise.all(projects.splice(0).map(project => project.dispose())); });
async function project() {
  const result = await createNodeAnalysisBackend().createProject({ mode: "strict" }); projects.push(result); return result;
}
function document(module: string, version: number, source: string, malformed = false): AnalysisAstDocument {
  const unit = luauFileUnit(source, wrapped => compiler.documents.parser.parse(wrapped))!;
  if (malformed) expect(unit.errors.length).toBeGreaterThan(0); else expect(unit.errors).toEqual([]);
  return { module, version, kind: "ast", ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(result: AnalysisCheckResult) {
  expect(result.status, result.message).toBe("ok"); expect(result.work?.parsedModules).toBe(0); return result;
}
const links = [{ module: "B", prelude: "A", version: 1 }, { module: "flow", prelude: "B", version: 1 }];
const caller = "type function captured() return make() end\ntype Result = captured<>\nlocal exported: Result = nil\n";
const flow = "local observed: nil = exported\nreturn exported\n";
async function observed(project: AnalysisProject, checked: AnalysisCheckResult) {
  const handle = checked.documents.find(document => document.module === "flow")!;
  const query = await project.queryType(handle, { line: 1, column: 7 });
  expect(query.status, query.message).toBe("ok"); expect(query.type).not.toBeNull(); return query.type;
}

test("only visible helpers are imported, and an inner module's own helper shadows its predecessor", async () => {
  const a = 'type function make() return types.singleton(nil) end\nlocal function private()\n  type function make() return types.string end\n  type Hidden = make<>\n  local hidden: Hidden = "private"\n  return hidden\nend\n';
  const p = await project();
  await p.update({ projectVersion: 1, documents: [document("A", 1, a), document("B", 1, caller), document("flow", 1, flow)], scopeLinks: links });
  const outer = ok(await p.check("flow")); expect(outer.diagnostics).toEqual([]); expect(await observed(p, outer)).toBe("nil");
  const shadow = "type function make() return types.string end\n" + caller;
  await p.update({ projectVersion: 2, documents: [document("B", 2, shadow)] });
  const inner = ok(await p.check("flow")); expect(inner.checkedModules).toBe(2);
  expect(inner.diagnostics).toHaveLength(2); expect(await observed(p, inner)).toBe("string");
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("A", 1, a), document("B", 2, shadow), document("flow", 1, flow)], scopeLinks: links });
  const cold = ok(await fresh.check("flow")); expect(inner.diagnostics).toEqual(cold.diagnostics);
  expect(await observed(fresh, cold)).toBe("string");
});

test("a callable type-function import stays outside the ordinary value namespace", async () => {
  const p = await project();
  const a = "type function make() return types.singleton(nil) end\n";
  const b = caller + "local ordinary = make()\n";
  await p.update({ projectVersion: 1, documents: [document("A", 1, a), document("B", 1, b), document("flow", 1, flow)], scopeLinks: links });
  const checked = ok(await p.check("flow")); expect(checked.diagnostics).toHaveLength(1);
  expect(checked.diagnostics[0]).toMatchObject({ module: "B", kind: "UnknownSymbol", unknownSymbol: { name: "make", context: "binding" },
    range: { start: { line: 3, column: 17 }, end: { line: 3, column: 21 } } });
  expect(await observed(p, checked)).toBe("nil");
});

test("foreign helper aliases update transitively and reset preserves the lexical environment", async () => {
  const a = "type Seed = number\ntype function make() return Seed end\n";
  const b = "type function captured() return make() end\ntype Result = captured<>\nlocal exported: Result = 42\n";
  const c = "local observed: number = exported\nreturn exported\n";
  const p = await project();
  await p.update({ projectVersion: 1, documents: [document("A", 1, a), document("B", 1, b), document("flow", 1, c)], scopeLinks: links });
  const initial = ok(await p.check("flow")); expect(initial.diagnostics).toEqual([]); expect(await observed(p, initial)).toBe("number");
  const changed = a.replace("Seed = number", "Seed = string");
  await p.update({ projectVersion: 2, documents: [document("A", 2, changed)] });
  const warm = ok(await p.check("flow")); expect(warm.checkedModules).toBe(3);
  expect(warm.diagnostics).toHaveLength(2); expect(await observed(p, warm)).toBe("string");
  expect((await p.reset()).status).toBe("ok");
  const reset = ok(await p.check("flow")); expect(reset.diagnostics).toEqual(warm.diagnostics); expect(await observed(p, reset)).toBe("string");
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("A", 2, changed), document("B", 1, b), document("flow", 1, c)], scopeLinks: links });
  const cold = ok(await fresh.check("flow")); expect(cold.diagnostics).toEqual(warm.diagnostics); expect(await observed(fresh, cold)).toBe("string");
});

test("removed lexical callable owners collect and restored inputs remain independent across projects", async () => {
  const p = await project(), independent = await project();
  const a = "type function make() return types.singleton(nil) end\n";
  await independent.update({ projectVersion: 1, documents: [document("A", 1, a.replace("types.singleton(nil)", "types.string")),
    document("B", 1, caller), document("flow", 1, flow)], scopeLinks: links });
  const other = ok(await independent.check("flow")); expect(other.diagnostics).toHaveLength(2); expect(await observed(independent, other)).toBe("string");
  await p.update({ projectVersion: 1, documents: [document("unrelated", 1, "local untouched = 1\n")] });
  ok(await p.check("unrelated"));
  for (let iteration = 0; iteration < 8; iteration++) {
    await p.update({ projectVersion: p.projectVersion + 1, documents: [document("A", iteration + 1, a),
      document("B", iteration + 1, caller), document("flow", iteration + 1, flow)], scopeLinks: links });
    const restored = ok(await p.check("flow")); expect(restored.diagnostics).toEqual([]); expect(await observed(p, restored)).toBe("nil");
    expect(ok(await p.check("unrelated")).checkedModules).toBe(0);
    await p.update({ projectVersion: p.projectVersion + 1, removeDocuments: ["flow", "B", "A"] });
    const collected = ok(await p.check("unrelated")); expect(collected.checkedModules).toBe(0);
    expect(collected.nativeRetention).toEqual({ installedInputs: 1, retainedAstInputs: 1, snapshots: 0, flowOwners: 0, leases: 0 });
  }
  expect(ok(await independent.check("flow")).checkedModules).toBe(0);
  expect(await observed(independent, other)).toBe("string");
});

test("errored predecessors publish normal diagnostics and recover without fabricating callable types", async () => {
  const p = await project();
  const valid = "type function make() return types.singleton(nil) end\n";
  const malformed = "type function make() return types.singleton( end\n";
  await p.update({ projectVersion: 1, documents: [document("A", 1, malformed, true), document("B", 1, caller), document("flow", 1, flow)], scopeLinks: links });
  const broken = ok(await p.check("flow"));
  expect(broken.diagnostics.some(diagnostic => diagnostic.module === "A" && diagnostic.kind === "SyntaxError")).toBe(true);
  const fixed = valid + 'local bad: number = "wrong"\n';
  await p.update({ projectVersion: 2, documents: [document("A", 2, fixed)] });
  const ordinary = ok(await p.check("flow"));
  expect(ordinary.diagnostics).toHaveLength(1);
  expect(ordinary.diagnostics[0]).toMatchObject({ module: "A", kind: "TypeMismatch" });
  expect(await observed(p, ordinary)).toBe("nil");
  await p.update({ projectVersion: 3, documents: [document("A", 3, valid)] });
  const repaired = ok(await p.check("flow")); expect(repaired.diagnostics).toEqual([]); expect(await observed(p, repaired)).toBe("nil");
});
