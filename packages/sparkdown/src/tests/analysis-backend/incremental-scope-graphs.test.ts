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
function document(module: string, version: number, source: string): AnalysisAstDocument {
  const unit = luauFileUnit(source, wrapped => compiler.documents.parser.parse(wrapped))!;
  expect(unit.errors).toEqual([]);
  return { module, version, kind: "ast", ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(result: AnalysisCheckResult) {
  expect(result.status, result.message).toBe("ok"); expect(result.work?.parsedModules).toBe(0); return result;
}
function generation(result: AnalysisCheckResult) { return result.scopeGenerations.find(entry => entry.module === "prelude")!.generation; }
async function query(project: AnalysisProject, checked: AnalysisCheckResult, flow: string) {
  const handle = checked.documents.find(document => document.module === "flow")!;
  const result = await project.queryType(handle, { line: flow.trimEnd().split("\n").length - 1, column: 7 });
  expect(result.status, result.message).toBe("ok"); expect(result.type).not.toBeNull(); return result.type;
}
const privateBody = "local function private(): number\n  local body: number = 111\n  return body\nend\n";
const cases = [
  {
    name: "recursive named aliases",
    prelude: "type Node = {value: number, next: Node?}\nlocal root: Node = {value = 1, next = nil}\n" + privateBody,
    flow: "local observed: number = root.value\nreturn root\n",
    changed: (source: string) => source.replace("value: number", "value: string").replace("value = 1", 'value = "x"'),
    initialErrors: 0, changedErrors: 1,
  },
  {
    // Pinned TypeInfer.tables.test.cpp new_solver_supports_read_write_properties.
    name: "separate read and write property types",
    prelude: "type Read = {read value: number}\ntype Write = {write value: number}\nlocal reader: Read = {} :: any\nlocal writer: Write = {} :: any\n" + privateBody,
    flow: "local observed: number = reader.value\nwriter.value = 1\nreturn observed\n",
    changed: (source: string) => source.replace("type Read = {read value: number}", "type Read = {read value: string}"),
    initialErrors: 0, changedErrors: 1,
  },
  {
    // Pinned read_only_indexer_read_allowed/read_only_indexer_write_disallowed.
    name: "read-only versus writable indexers",
    prelude: "type View = {read [string]: number}\nlocal view: View = {} :: any\n" + privateBody,
    flow: 'local observed: number = view["key"]\nview["key"] = 1\nreturn observed\n',
    changed: (source: string) => source.replace("{read [string]: number}", "{[string]: number}"),
    initialErrors: 1, changedErrors: 0,
  },
  {
    name: "metatable-provided property types",
    prelude: "local prototype = {value = 42}\nlocal object = setmetatable({}, {__index = prototype})\n" + privateBody,
    flow: "local observed: number = object.value\nreturn observed\n",
    changed: (source: string) => source.replace("value = 42", 'value = "x"'),
    initialErrors: 0, changedErrors: 1,
  },
  {
    // Pinned TypeInfer.aliases.test.cpp default_pack_parameter, exact alias shape.
    name: "generic pack defaults",
    prelude: "type T<A... = (number, string)> = {fn: (A...) -> ()}\nlocal value: T\n" + privateBody,
    flow: 'local fn = value.fn\nfn(1, "text")\nreturn fn\n',
    changed: (source: string) => source.replace("(number, string)", "(string, number)"),
    initialErrors: 0, changedErrors: 2,
  },
];

test.each(cases)("$name retain unchanged-body scopes and invalidate observable graph changes", async fixture => {
  const p = await project(), flow = document("flow", 1, fixture.flow);
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, fixture.prelude), flow],
    scopeLinks: [{ module: "flow", prelude: "prelude", version: 1 }] });
  const cold = ok(await p.check("flow")); expect(cold.checkedModules).toBe(2); expect(cold.diagnostics).toHaveLength(fixture.initialErrors);
  await query(p, cold, fixture.flow);
  expect(ok(await p.check("flow")).checkedModules).toBe(0);
  const body = fixture.prelude.replace("111", "222");
  await p.update({ projectVersion: 2, documents: [document("prelude", 2, body)] });
  const reused = ok(await p.check("flow")); expect(reused.checkedModules).toBe(1);
  expect(generation(reused)).toBe(generation(cold)); expect(reused.diagnostics).toEqual(cold.diagnostics);
  const changed = fixture.changed(body);
  await p.update({ projectVersion: 3, documents: [document("prelude", 3, changed)] });
  const warm = ok(await p.check("flow")); expect(warm.checkedModules).toBe(2);
  expect(generation(warm)).not.toBe(generation(reused)); expect(warm.diagnostics).toHaveLength(fixture.changedErrors);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("prelude", 3, changed), flow],
    scopeLinks: [{ module: "flow", prelude: "prelude", version: 1 }] });
  const coldChanged = ok(await fresh.check("flow")); expect(warm.diagnostics).toEqual(coldChanged.diagnostics);
  expect(await query(p, warm, fixture.flow)).toBe(await query(fresh, coldChanged, fixture.flow));
});

test("transitive type functions recheck captured aliases, inputs and closures even for an unchanged result", async () => {
  const p = await project();
  const a = 'type Input = number\ntype function getnil() return types.singleton(nil) end\ntype function make(arg)\n  if arg:is("number") then return getnil() end\n  return arg\nend\n';
  const b = "type Result = make<Input>\nlocal exported: Result = nil\n";
  const c = "local observed: nil = exported\nreturn exported\n";
  const links = [{ module: "B", prelude: "A", version: 1 }, { module: "flow", prelude: "B", version: 1 }];
  await p.update({ projectVersion: 1, documents: [document("A", 1, a), document("B", 1, b), document("flow", 1, c)], scopeLinks: links });
  const cold = ok(await p.check("flow")); expect(cold.checkedModules).toBe(3); expect(cold.diagnostics).toEqual([]);
  expect(await query(p, cold, c)).toBe("nil");
  const sameResult = a.replace("return types.singleton(nil)", "local ty = types.singleton(nil) return ty");
  await p.update({ projectVersion: 2, documents: [document("A", 2, sameResult)] });
  const unchanged = ok(await p.check("flow")); expect(unchanged.checkedModules).toBe(3); expect(unchanged.diagnostics).toEqual([]);
  expect(await query(p, unchanged, c)).toBe("nil");
  const inputChanged = sameResult.replace("Input = number", "Input = string");
  await p.update({ projectVersion: 3, documents: [document("A", 3, inputChanged)] });
  const input = ok(await p.check("flow")); expect(input.checkedModules).toBe(3); expect(input.diagnostics).toHaveLength(2);
  expect(await query(p, input, c)).toBe("string");
  const closureChanged = sameResult.replace("types.singleton(nil)", "types.string");
  await p.update({ projectVersion: 4, documents: [document("A", 4, closureChanged)] });
  const closure = ok(await p.check("flow")); expect(closure.checkedModules).toBe(3); expect(closure.diagnostics).toHaveLength(2);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("A", 4, closureChanged), document("B", 1, b), document("flow", 1, c)], scopeLinks: links });
  const freshResult = ok(await fresh.check("flow")); expect(closure.diagnostics).toEqual(freshResult.diagnostics);
  expect(await query(p, closure, c)).toBe(await query(fresh, freshResult, c));
});

test("the original captured-helper source checks raw and encoded within its lexical module", async () => {
  const source = 'type Input = number\ntype function make() return types.singleton(nil) end\ntype function captured(arg)\n  if arg:is("number") then return make() end\n  return arg\nend\ntype Result = captured<Input>\nlocal exported: Result = nil\nlocal observed: nil = exported\nreturn exported\n';
  const ast = await project(), raw = await project();
  await ast.update({ projectVersion: 1, documents: [document("single", 1, source)] });
  await raw.update({ projectVersion: 1, documents: [{ module: "single", version: 1, source }] });
  const checked = ok(await ast.check("single")); expect(checked.diagnostics).toEqual([]);
  expect((await raw.check("single")).diagnostics).toEqual(checked.diagnostics);
});

test("a split lexical type-function body can call its outer type function", async () => {
  const p = await project();
  const a = 'type Input = number\ntype function make() return types.singleton(nil) end\n';
  const b = 'type function captured(arg)\n  if arg:is("number") then return make() end\n  return arg\nend\ntype Result = captured<Input>\nlocal exported: Result = nil\n';
  const c = "local observed: nil = exported\nreturn exported\n";
  const links = [{ module: "B", prelude: "A", version: 1 }, { module: "flow", prelude: "B", version: 1 }];
  await p.update({ projectVersion: 1, documents: [document("A", 1, a), document("B", 1, b), document("flow", 1, c)], scopeLinks: links });
  const cold = ok(await p.check("flow")); expect(cold.checkedModules).toBe(3); expect(cold.diagnostics).toEqual([]);
  expect(await query(p, cold, c)).toBe("nil");
  expect(ok(await p.check("flow")).checkedModules).toBe(0);
  const changed = a.replace("types.singleton(nil)", "types.string");
  await p.update({ projectVersion: 2, documents: [document("A", 2, changed)] });
  const warm = ok(await p.check("flow")); expect(warm.checkedModules).toBe(3); expect(warm.diagnostics).toHaveLength(2);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("A", 2, changed), document("B", 1, b), document("flow", 1, c)], scopeLinks: links });
  const freshResult = ok(await fresh.check("flow")); expect(warm.diagnostics).toEqual(freshResult.diagnostics);
  expect(await query(p, warm, c)).toBe(await query(fresh, freshResult, c));
});
