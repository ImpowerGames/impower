import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisAstDocument, AnalysisProject } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const projects: AnalysisProject[] = [];
async function project() {
  const p = await createNodeAnalysisBackend().createProject({ mode: "strict" });
  projects.push(p); return p;
}
afterEach(async () => { await Promise.all(projects.splice(0).map(p => p.dispose())); });
function document(module: string, version: number, source: string): AnalysisAstDocument {
  const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
  const unit = luauFileUnit(source, wrapped => compiler.documents.parser.parse(wrapped))!;
  expect(unit.errors).toEqual([]);
  return { kind: "ast", module, version, ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}

test("pack-valued calls and declaration identities give the same bounded raw/AST query", async () => {
  const source = 'local function identity<T>(value: T): T return value end\nlocal answer = identity(42)\nlocal function inner()\n  local answer = "shadow"\n  return answer\nend\nreturn identity(answer)\n';
  const a = await project(), b = await project();
  await a.update({ projectVersion: 1, documents: [document("main", 1, source)] });
  await b.update({ projectVersion: 1, documents: [{ module: "main", version: 1, source }] });
  const ast = await a.check("main"), raw = await b.check("main");
  expect(ast.status, ast.message).toBe("ok"); expect(raw.status, raw.message).toBe("ok");
  expect(ast.diagnostics).toEqual([]); expect(raw.diagnostics).toEqual([]);
  const controls = [
    { line: 1, column: 6, type: "number" }, // The declaration, not a later use.
    { line: 3, column: 8, type: "string" }, // Exact shadow local identity.
    { line: 1, column: "local answer = identity".length, type: "number" }, // Final RHS pack.
    { line: 6, column: "return identity".length, type: "number" }, // Final return pack.
  ];
  for (const control of controls) {
    expect((await a.queryType(ast.documents[0]!, control)).type).toBe(control.type);
    expect((await b.queryType(raw.documents[0]!, control)).type).toBe(control.type);
  }
});

test("comments have raw/AST UTF16 ranges and suppress queries without hiding adjacent expressions", async () => {
  const source = 'local value = 42 -- suffix 😀\r\n--[=[ block 😀 ]=]\r\nreturn value\r\n';
  const a = await project(), b = await project();
  await a.update({ projectVersion: 1, documents: [document("main", 1, source)] });
  await b.update({ projectVersion: 1, documents: [{ module: "main", version: 1, source }] });
  const ast = await a.check("main"), raw = await b.check("main");
  expect(ast.diagnostics).toEqual(raw.diagnostics);
  for (const position of [{ line: 0, column: 22 }, { line: 1, column: 7 }]) {
    expect((await a.queryType(ast.documents[0]!, position)).type).toBeNull();
    expect((await b.queryType(raw.documents[0]!, position)).type).toBeNull();
  }
  expect((await a.queryType(ast.documents[0]!, { line: 0, column: 14 })).type).toBe("number");
  expect((await b.queryType(raw.documents[0]!, { line: 0, column: 14 })).type).toBe("number");
});

test("multiple, empty and variadic packs differ from their callee and parameter binding displays", async () => {
  const source = 'local function multiple(): (number, string) return 1, "x" end\nlocal function none(): () return end\nlocal function spread(...: string): ...string return ... end\nlocal a, b = multiple()\nlocal empty = none()\nlocal result = spread("x")\nlocal function outer(value: number)\n  local function inner(value: string) return value end\n  return value\nend\nreturn a\n';
  const a = await project(), b = await project();
  await a.update({ projectVersion: 1, documents: [document("main", 1, source)] });
  await b.update({ projectVersion: 1, documents: [{ module: "main", version: 1, source }] });
  const ast = await a.check("main"), raw = await b.check("main");
  expect(ast.status, ast.message).toBe("ok"); expect(raw.status, raw.message).toBe("ok");
  expect(ast.diagnostics).toEqual(raw.diagnostics);
  for (const [line, prefix, type] of [[3, "local a, b = multiple", "number"], [4, "local empty = none", null],
    [5, "local result = spread", "string"], [6, "local function outer(", "number"],
    [7, "  local function inner(", "string"]] as const) {
    const position = { line, column: prefix.length };
    expect((await b.queryType(raw.documents[0]!, position)).type).toBe(type);
    expect((await a.queryType(ast.documents[0]!, position)).type).toBe(type);
  }
  const calleePosition = { line: 3, column: "local a, b = ".length };
  const callee = (await a.queryType(ast.documents[0]!, calleePosition)).type;
  expect(callee).toBe((await b.queryType(raw.documents[0]!, calleePosition)).type);
  expect(callee).toContain("number"); expect(callee).toContain("string"); expect(callee).not.toBe("number");
  const changed = source.replace("(number, string) return 1", '(string, string) return "changed"');
  await a.update({ projectVersion: 2, documents: [document("main", 2, changed)] });
  await b.update({ projectVersion: 2, documents: [{ module: "main", version: 2, source: changed }] });
  const warmAst = await a.check("main"), warmRaw = await b.check("main");
  expect(warmAst.diagnostics).toEqual(warmRaw.diagnostics);
  const position = { line: 3, column: "local a, b = multiple".length };
  expect((await a.queryType(warmAst.documents[0]!, position)).type).toBe("string");
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("main", 2, changed)] });
  const cold = await fresh.check("main");
  expect(cold.diagnostics).toEqual(warmAst.diagnostics);
  expect((await fresh.queryType(cold.documents[0]!, position)).type).toBe("string");
});

test("AST and raw source agree on non-BMP CRLF diagnostics and queries", async () => {
  const source = "local emoji = '😀'; local target = 42; local wrong: string = target\r\nreturn target\r\n";
  const a = await project(), b = await project();
  const updated = await a.update({ projectVersion: 1, documents: [document("main", 1, source)] });
  expect(updated.status, updated.message).toBe("ok");
  expect((await b.update({ projectVersion: 1, documents: [{ module: "main", version: 1, source }] })).status).toBe("ok");
  const ast = await a.check("main"), raw = await b.check("main");
  expect(ast.status, ast.message).toBe("ok");
  expect(ast.diagnostics).toEqual(raw.diagnostics);
  expect(ast.diagnostics).toHaveLength(1);
  expect(ast.diagnostics[0]!.range.start.column).toBe(source.indexOf("target\r"));
  const position = { line: 0, column: source.indexOf("42") };
  expect((await a.queryType(ast.documents[0]!, position)).type).toBe("number");
  expect((await b.queryType(raw.documents[0]!, position)).type).toBe("number");
  // An incorrect byte conversion would shift this query past the number.
  expect((await a.queryType(ast.documents[0]!, { ...position, column: position.column + 4 })).type).not.toBe("number");
  await expect(a.queryType(ast.documents[0]!, { line: 50, column: 0 })).rejects.toThrow("outside");
});

test("caller mutations do not alter queued AST input or its reset snapshot", async () => {
  const p = await project();
  const input = document("main", 1, "local tag = 'safe'\nlocal result: string = 42\nreturn result\n");
  const update = p.update({ projectVersion: 1, documents: [input] });
  const numberLayout = input.ast.layouts.findIndex(l => l[0] === "ExprConstantNumber");
  const stringLayout = input.ast.layouts.findIndex(l => l[0] === "ExprConstantString");
  const index = input.ast.nodes.findIndex(n => n[0] === numberLayout);
  const number = input.ast.nodes[index]!, string = input.ast.nodes.find(n => n[0] === stringLayout)!;
  input.ast.nodes[index] = [stringLayout, ...number.slice(1, 5), ...string.slice(5)];
  expect((await update).status).toBe("ok");
  const first = await p.check("main");
  expect(first.diagnostics).toHaveLength(1);
  // This valid mutation really removes the error when submitted independently;
  // it cannot be explained by an unused field or malformed input rejection.
  const changed = await project();
  expect((await changed.update({ projectVersion: 1, documents: [input] })).status).toBe("ok");
  expect((await changed.check("main")).diagnostics).toEqual([]);
  expect((await p.reset()).status).toBe("ok");
  expect((await p.check("main")).diagnostics).toEqual(first.diagnostics);
});

test("mixed AST/source imports retain cached errors, restore missing inputs and release removed diagnostics", async () => {
  const p = await project();
  const main = 'local result: number = require("dep")\nreturn result\n';
  const bad = 'local bad: number = "wrong"\nreturn 1\n';
  await p.update({ projectVersion: 1, documents: [
    document("main", 1, main), { module: "dep", version: 1, source: bad },
    document("unrelated", 1, "return true\n"),
  ] });
  const first = await p.check("main"); await p.check("unrelated");
  expect(first.diagnostics).toHaveLength(1);
  expect(first.diagnostics[0]!.module).toBe("dep");
  await p.update({ projectVersion: 2, documents: [document("main", 2, main + "local extra = 1\n")] });
  const importer = await p.check("main");
  expect(importer.diagnostics).toEqual(first.diagnostics);
  expect(importer.checkedModules).toBe(1);
  await p.update({ projectVersion: 3, removeDocuments: ["dep"] });
  expect((await p.check("main")).diagnostics.some(d => /require|module/i.test(d.message))).toBe(true);
  await p.update({ projectVersion: 4, documents: [document("dep", 2, "return 1\n")] });
  const restored = await p.check("main");
  expect(restored.diagnostics).toEqual([]);
  expect(restored.checkedModules).toBe(2);
  expect((await p.check("unrelated")).checkedModules).toBe(0);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [
    document("main", 2, main + "local extra = 1\n"), document("dep", 2, "return 1\n"),
  ] });
  expect(restored.diagnostics).toEqual((await fresh.check("main")).diagnostics);
});

test("definition rebuild and reset reinstall AST inputs with the new environment", async () => {
  const p = await project();
  await p.update({ projectVersion: 1, definitions: [{ name: "host", version: 1, source: "declare Value: number" }],
    documents: [document("main", 1, "local result: number = Value\nreturn result\n")] });
  expect((await p.check("main")).diagnostics).toEqual([]);
  await p.update({ projectVersion: 2, definitions: [{ name: "host", version: 2, source: "declare Value: string" }] });
  const changed = await p.check("main");
  expect(changed.status).toBe("ok");
  expect(changed.diagnostics).toHaveLength(1);
  expect((await p.reset()).status).toBe("ok");
  expect((await p.check("main")).diagnostics).toEqual(changed.diagnostics);
  expect((await p.check("main")).checkedModules).toBe(0);
});

test("qualified references reject unavailable binding metadata and distinguish an explicit null", async () => {
  const source = 'local Module = require("dep")\ntype Alias = Module.Alias\nlocal value: Alias = 1\nreturn value\n';
  const input = document("main", 1, source), p = await project();
  const layoutIndex = input.ast.layouts.findIndex(l => l[0] === "TypeReference");
  const layout = input.ast.layouts[layoutIndex]!;
  const prefixOffset = 4 + layout.indexOf("prefix"), localOffset = 4 + layout.indexOf("prefixLocal");
  const qualified = input.ast.nodes.find(n => n[0] === layoutIndex && n[prefixOffset] === "Module")!;
  expect(qualified[localOffset]).toEqual([3, 0]);
  // A stale/foreign converter without binding metadata must fail explicitly.
  qualified[localOffset] = [0];
  const rejected = await p.update({ projectVersion: 1, documents: [input] });
  expect(rejected.status).toBe("error");
  expect(rejected.message).toContain("authoritative prefixLocal metadata");
  expect(p.projectVersion).toBe(0);

  // EXACT fixture has one preceding local declaration. Its identity is an
  // explicit test fact, never a production reconstruction from the name.
  expect(qualified[localOffset]).toEqual([0]); // unavailable, not null
  qualified[localOffset] = [3, 0];
  const repaired = await project(), raw = await project();
  const dependency = "export type Alias = number\nreturn 1\n";
  expect((await repaired.update({ projectVersion: 1, documents: [input, document("dep", 1, dependency)] })).status).toBe("ok");
  await raw.update({ projectVersion: 1, documents: [{ module: "main", version: 1, source }, { module: "dep", version: 1, source: dependency }] });
  const checked = await repaired.check("main"), baseline = await raw.check("main");
  expect(checked.diagnostics).toEqual(baseline.diagnostics);
  expect(checked.diagnostics).toEqual([]);
  expect((await repaired.queryType(checked.documents.find(d => d.module === "main")!, { line: 3, column: 8 })).type).toBe("number");

  const unresolvedSource = "type Alias = Missing.Alias\n";
  const unresolved = document("main", 1, unresolvedSource);
  const unresolvedLayout = unresolved.ast.layouts.findIndex(l => l[0] === "TypeReference");
  const unresolvedOffset = 4 + unresolved.ast.layouts[unresolvedLayout]!.indexOf("prefixLocal");
  unresolved.ast.nodes.find(n => n[0] === unresolvedLayout)![unresolvedOffset] = null;
  const global = await project(), globalRaw = await project();
  expect((await global.update({ projectVersion: 1, documents: [unresolved] })).status).toBe("ok");
  await globalRaw.update({ projectVersion: 1, documents: [{ module: "main", version: 1, source: unresolvedSource }] });
  const explicitNull = await global.check("main"), rawNull = await globalRaw.check("main");
  expect(explicitNull.diagnostics).toEqual(rawNull.diagnostics);
  expect(explicitNull.diagnostics.length).toBeGreaterThan(0);
});

test("decoded type-function bodies execute the official VM and changed return types match fresh source", async () => {
  const source = 'type function getnil()\n  local ty = types.singleton(nil)\n  if ty:is("nil") then return ty end\n  return types.string\nend\nlocal function ok(idx: getnil<>): nil return idx end\nreturn ok(nil)\n';
  const p = await project(), raw = await project();
  await p.update({ projectVersion: 1, documents: [document("main", 1, source)] });
  await raw.update({ projectVersion: 1, documents: [{ module: "main", version: 1, source }] });
  const first = await p.check("main"), control = await raw.check("main");
  expect(first.status, first.message).toBe("ok");
  expect(first.diagnostics).toEqual(control.diagnostics);
  expect(first.diagnostics).toEqual([]);
  const position = { line: 5, column: source.split("\n")[5]!.lastIndexOf("idx") + 1 };
  expect((await p.queryType(first.documents[0]!, position)).type).toBe("nil");
  expect((await raw.queryType(control.documents[0]!, position)).type).toBe("nil");
  const changed = source.replace("then return ty", "then return types.string");
  await p.update({ projectVersion: 2, documents: [document("main", 2, changed)] });
  const warm = await p.check("main"), fresh = await project();
  await fresh.update({ projectVersion: 2, documents: [{ module: "main", version: 2, source: changed }] });
  expect(warm.status).toBe("ok");
  expect(warm.diagnostics).toEqual((await fresh.check("main")).diagnostics);
  expect(warm.diagnostics.length).toBeGreaterThan(0);
  expect(warm.diagnostics.some(d => /nil/.test(d.message))).toBe(true);
});

test("a single AST larger than the WASM stack transfer threshold checks through heap input", async () => {
  const source = Array.from({ length: 1500 }, (_, i) => "local value" + i + " = '" + "a".repeat(256) + "'\n").join("")
    + "local result: number = value1499\nreturn result\n";
  const input = document("main", 1, source);
  expect(new TextEncoder().encode(JSON.stringify(input.ast)).length).toBeGreaterThan(512 * 1024);
  const p = await project();
  const updated = await p.update({ projectVersion: 1, documents: [input] }, { deadlineMs: 10000 });
  expect(updated.status, updated.message).toBe("ok");
  const checked = await p.check("main", { deadlineMs: 10000 });
  expect(checked.status, checked.message).toBe("ok");
  expect(checked.diagnostics).toHaveLength(1);
  expect(checked.diagnostics[0]!.range.start.line).toBe(1500);
  expect((await p.queryType(checked.documents[0]!, { line: 1500, column: 25 })).type).toBe("string");
  expect((await p.check("main")).checkedModules).toBe(0);
});

test("fresh workers cannot use each other's AST handles and reset invalidates prior handles", async () => {
  const a = await project(), b = await project(), input = document("main", 1, "local value = 42\nreturn value\n");
  await a.update({ projectVersion: 1, documents: [input] });
  await b.update({ projectVersion: 1, documents: [input] });
  const first = await a.check("main"), second = await b.check("main");
  const position = { line: 1, column: 8 };
  expect((await a.queryType(first.documents[0]!, position)).type).toBe("number");
  expect((await b.queryType(second.documents[0]!, position)).type).toBe("number");
  expect(first.documents[0]!.sessionId).not.toBe(second.documents[0]!.sessionId);
  await expect(a.queryType(second.documents[0]!, position)).rejects.toThrow("Stale");
  await expect(b.queryType(first.documents[0]!, position)).rejects.toThrow("Stale");
  expect((await a.reset()).status).toBe("ok");
  await expect(a.queryType(first.documents[0]!, position)).rejects.toThrow("Stale");
  const restarted = await a.check("main");
  expect(restarted.documents[0]!.projectVersion).toBeGreaterThan(first.documents[0]!.projectVersion);
  expect((await a.queryType(restarted.documents[0]!, position)).type).toBe("number");
});
