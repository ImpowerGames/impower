import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisAstDocument, AnalysisModuleResolution, AnalysisProject } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const projects: AnalysisProject[] = [];
async function project() { const p = await createNodeAnalysisBackend().createProject({ mode: "strict" }); projects.push(p); return p; }
afterEach(async () => { await Promise.all(projects.splice(0).map(p => p.dispose())); });
function document(module: string, version: number, source: string): AnalysisAstDocument {
  const unit = luauFileUnit(source, wrapped => compiler.documents.parser.parse(wrapped))!;
  expect(unit.errors).toEqual([]);
  return { module, version, kind: "ast", ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
const caller = document("sparkdown-unit:caller", 1, 'local value: number = require("./dependency")\nreturn value\n');
const top = document("sparkdown-unit:top", 1, 'return require("./caller")\n');
const unrelated = document("sparkdown-unit:unrelated", 1, "return true\n");
const identity = (module: string, sourceUri: string, version = 1) => ({ module, sourceUri, version });
function resolution(module: string, specifier: string, targetModule: string, targetSourceUri: string, version = 1): AnalysisModuleResolution {
  return { module, version, resolutions: [{ specifier, targetModule, targetSourceUri }] };
}
const edge = (version = 1, target = "sparkdown-unit:dependency", uri = "file:///dependency.luau") => resolution(caller.module, "./dependency", target, uri, version);
const topEdge = resolution(top.module, "./caller", caller.module, "file:///caller.luau");

test("missing opaque targets keep URI diagnostics across create/delete/restore and unrelated native reuse", async () => {
  const p = await project();
  await p.update({ projectVersion: 1, documents: [caller, top, unrelated],
    moduleIdentities: [identity(caller.module, "file:///caller.luau"), identity(top.module, "file:///top.luau"), identity(unrelated.module, "file:///other.luau")],
    moduleResolutions: [edge(), topEdge] });
  const missing = await p.checkModules([top.module, unrelated.module]);
  expect(missing.status, missing.message).toBe("ok");
  const warning = missing.diagnostics.find(d => d.kind === "UnknownRequire")!;
  expect(warning.message).toContain("file:///dependency.luau"); expect(warning.message).not.toContain("sparkdown-unit:");
  expect((await p.checkModules([top.module, unrelated.module])).checkedModules).toBe(0);
  const dependency = document("sparkdown-unit:dependency", 1, "return 42\n");
  expect((await p.update({ projectVersion: 2, documents: [dependency], moduleIdentities: [identity(dependency.module, "file:///dependency.luau")] })).work?.decodedInputs).toBe(1);
  const created = await p.checkModules([top.module, unrelated.module]);
  expect(created.diagnostics).toEqual([]); expect(created.checkedModules).toBe(3); expect(created.work?.parsedModules).toBe(0);
  await p.update({ projectVersion: 3, removeDocuments: [dependency.module] });
  const deleted = await p.checkModules([top.module, unrelated.module]);
  expect(deleted.diagnostics).toEqual(missing.diagnostics); expect(deleted.checkedModules).toBe(2);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [caller, top, unrelated],
    moduleIdentities: [identity(caller.module, "file:///caller.luau"), identity(top.module, "file:///top.luau"), identity(unrelated.module, "file:///other.luau")], moduleResolutions: [edge(), topEdge] });
  expect((await fresh.checkModules([top.module, unrelated.module])).diagnostics).toEqual(deleted.diagnostics);
  await p.update({ projectVersion: 4, documents: [dependency], moduleIdentities: [identity(dependency.module, "file:///dependency.luau")] });
  expect((await p.checkModules([top.module, unrelated.module])).diagnostics).toEqual([]);
  await p.reset(); expect((await p.checkModules([top.module, unrelated.module])).diagnostics).toEqual([]);
});

test("retarget/rename facts retrace unchanged ASTs atomically and reject conflicting labels before native mutation", async () => {
  const p = await project();
  const a = document("sparkdown-unit:a", 1, "return 1\n"), b = document("sparkdown-unit:b", 1, 'return "text"\n');
  await p.update({ projectVersion: 1, documents: [caller, a, b, unrelated], moduleIdentities: [identity(caller.module, "file:///caller.luau"), identity(a.module, "file:///a.luau"), identity(b.module, "file:///b.luau")], moduleResolutions: [edge(1, a.module, "file:///a.luau")] });
  expect((await p.checkModules([caller.module, unrelated.module])).diagnostics).toEqual([]);
  const changed = await p.update({ projectVersion: 2, moduleIdentities: [identity(b.module, "file:///renamed.luau", 2)], moduleResolutions: [edge(2, b.module, "file:///renamed.luau")] });
  expect(changed.status).toBe("ok"); expect(changed.work?.decodedInputs).toBe(0);
  const checked = await p.checkModules([caller.module, unrelated.module]);
  expect(checked.checkedModules).toBe(2); expect(checked.work?.parsedModules).toBe(0);
  expect(checked.diagnostics).toHaveLength(1); expect(checked.diagnostics[0]!.kind).toBe("TypeMismatch");
  await expect(p.update({ projectVersion: 3, moduleResolutions: [edge(3, b.module, "file:///wrong-label.luau")] })).rejects.toThrow("identity mismatch");
  expect(p.projectVersion).toBe(2); expect((await p.checkModules([caller.module, unrelated.module])).checkedModules).toBe(0);
  await p.update({ projectVersion: 3, removeDocuments: [b.module] });
  const missing = await p.check(caller.module);
  expect(missing.diagnostics.some(d => d.kind === "UnknownRequire" && d.message.includes("file:///renamed.luau"))).toBe(true);
  expect(missing.diagnostics.some(d => d.message.includes("sparkdown-unit:"))).toBe(false);
  await p.update({ projectVersion: 4, documents: [document(a.module, 2, 'return "changed a"\n')] });
  expect((await p.check(caller.module)).checkedModules).toBe(0); // Old edge was actually deleted.
});

test("native diagnostics retain exact symbol context and converter error ordinal independently of text", async () => {
  const p = await project();
  const source = 'local x: MissingType = MissingGlobal\nreturn x\n';
  await p.update({ projectVersion: 1, documents: [document("main", 1, source)] });
  const checked = await p.check("main");
  expect(checked.diagnostics.filter(d => d.kind === "UnknownSymbol").map(d => d.unknownSymbol)).toEqual(expect.arrayContaining([
    { name: "MissingType", context: "type" }, { name: "MissingGlobal", context: "binding" },
  ]));
  const malformed = luauFileUnit("local x: = 1\nreturn x\n", wrapped => compiler.documents.parser.parse(wrapped))!;
  expect(malformed.errors.length).toBeGreaterThan(0);
  await p.update({ projectVersion: 2, documents: [{ module: "main", version: 2, kind: "ast", ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(malformed)) }] });
  const errors = await p.check("main");
  expect(errors.diagnostics.some(d => d.kind === "SyntaxError" && d.parseErrorOrdinal === 0)).toBe(true);
});
