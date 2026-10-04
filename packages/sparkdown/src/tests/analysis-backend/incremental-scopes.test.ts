import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisAstDocument, AnalysisCheckResult, AnalysisProject } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const projects: AnalysisProject[] = [];
const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
async function project() {
  const p = await createNodeAnalysisBackend().createProject({ mode: "strict" });
  projects.push(p); return p;
}
afterEach(async () => { await Promise.all(projects.splice(0).map(p => p.dispose())); });
function document(module: string, version: number, source: string): AnalysisAstDocument {
  const unit = luauFileUnit(source, wrapped => compiler.documents.parser.parse(wrapped))!;
  expect(unit.errors).toEqual([]);
  return { kind: "ast", module, version, ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(result: AnalysisCheckResult) {
  expect(result.status, result.message).toBe("ok");
  expect(result.work?.parsedModules).toBe(0);
  return result;
}
function generation(result: AnalysisCheckResult, name: string) {
  return result.scopeGenerations.find(g => g.module === name)!.generation;
}

test("unchanged aliases and function exports reuse flows while current prelude warnings are published", async () => {
  const p = await project();
  const base = 'type Alias = { value: number }\nlocal function increment(n: number): number\n  local body: number = 111\n  return n + 1\nend\n';
  const flows = [document("one", 1, 'local item: Alias = {value = increment(1)}\nreturn item\n'),
    document("two", 1, 'local result: number = increment(2)\nreturn result\n')];
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, base), ...flows],
    scopeLinks: flows.map(d => ({ module: d.module, prelude: "prelude", version: 1 })) });
  const cold = ok(await p.checkModules(["one", "two"]));
  expect(cold.checkedModules).toBe(3); expect(cold.diagnostics).toEqual([]);
  const initialGeneration = generation(cold, "prelude");
  const noop = ok(await p.checkModules(["one", "two"]));
  expect(noop.checkedModules).toBe(0);
  const changed = base.replace("111", '"x"'); // Same span, exported aliases/signatures unchanged.
  const update = await p.update({ projectVersion: 2, documents: [document("prelude", 2, changed)] });
  expect(update.work).toMatchObject({ changedInputs: 1, decodedInputs: 1 });
  const warm = ok(await p.checkModules(["one", "two"]));
  expect(warm.checkedModules).toBe(1); expect(generation(warm, "prelude")).toBe(initialGeneration);
  expect(warm.diagnostics).toHaveLength(1); expect(warm.diagnostics[0]!.module).toBe("prelude");
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("prelude", 2, changed), ...flows],
    scopeLinks: flows.map(d => ({ module: d.module, prelude: "prelude", version: 1 })) });
  expect(warm.diagnostics).toEqual(ok(await fresh.checkModules(["one", "two"])).diagnostics);
  expect((await p.update({ projectVersion: 3, documents: [document("prelude", 3, changed)] })).work)
    .toMatchObject({ changedInputs: 0, decodedInputs: 0 });
  expect(ok(await p.checkModules(["one", "two"])).checkedModules).toBe(0);
});

test("same-shape alias swaps, generic defaults and function signatures invalidate observed exports", async () => {
  const p = await project();
  const base = 'type Left = {value: number}\ntype Right = {value: number}\ntype Box<T = number> = {value: T}\nlocal item: Left = {value = 1}\nlocal function identity<T>(value: T): T return value end\n';
  const flow = document("flow", 1, 'local value: Box = {value = 1}\nlocal result: number = identity(item.value)\nreturn result\n');
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, base), flow],
    scopeLinks: [{ module: "flow", prelude: "prelude", version: 1 }] });
  const first = ok(await p.check("flow")); expect(first.diagnostics).toEqual([]);
  // An unrelated literal body edit must retain generic aliases/functions.
  const body = base.replace("{value = 1}", "{value = 2}");
  await p.update({ projectVersion: 2, documents: [document("prelude", 2, body)] });
  const reused = ok(await p.check("flow")); expect(reused.checkedModules).toBe(1);
  expect(generation(reused, "prelude")).toBe(generation(first, "prelude"));
  const swapped = body.replace("item: Left", "item: Right");
  await p.update({ projectVersion: 3, documents: [document("prelude", 3, swapped)] });
  const swap = ok(await p.check("flow")); expect(swap.checkedModules).toBe(2);
  expect(generation(swap, "prelude")).not.toBe(generation(reused, "prelude"));
  const defaults = swapped.replace("T = number", "T = string");
  await p.update({ projectVersion: 4, documents: [document("prelude", 4, defaults)] });
  const changed = ok(await p.check("flow")); expect(changed.checkedModules).toBe(2);
  expect(changed.diagnostics).toHaveLength(1);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("prelude", 4, defaults), flow],
    scopeLinks: [{ module: "flow", prelude: "prelude", version: 1 }] });
  expect(changed.diagnostics).toEqual(ok(await fresh.check("flow")).diagnostics);
});

test("scope chains publish in dependency order and propagate through cached downstream modules", async () => {
  const p = await project();
  const a = 'local exported: number = 1\n';
  const b = 'local forwarded = exported\n';
  const c = 'local observed: number = forwarded\nreturn observed\n';
  await p.update({ projectVersion: 1, documents: [document("A", 1, a), document("B", 1, b), document("C", 1, c), document("unrelated", 1, "return true\n")],
    scopeLinks: [{ module: "B", prelude: "A", version: 1 }, { module: "C", prelude: "B", version: 1 }] });
  expect(ok(await p.check("C")).checkedModules).toBe(3);
  await p.check("unrelated");
  await p.update({ projectVersion: 2, documents: [document("A", 2, 'local exported: string = "x"\n')] });
  const warm = ok(await p.check("C")); expect(warm.checkedModules).toBe(3); expect(warm.diagnostics).toHaveLength(1);
  expect(warm.replacementDocuments.map(d => d.module)).toEqual(["A", "B", "C"]);
  expect(ok(await p.check("unrelated")).checkedModules).toBe(0);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("A", 2, 'local exported: string = "x"\n'), document("B", 1, b), document("C", 1, c)],
    scopeLinks: [{ module: "B", prelude: "A", version: 1 }, { module: "C", prelude: "B", version: 1 }] });
  expect(warm.diagnostics).toEqual(ok(await fresh.check("C")).diagnostics);
});

test("program environments, mode precedence and definition batches survive reset without stale checks", async () => {
  const p = await project();
  const source = 'local result: number = Host\nlocal story: ProgramAlias = ProgramValue\nreturn result\n';
  await p.update({ projectVersion: 1, documents: [document("main", 1, source)],
    definitions: [{ name: "host", version: 1, source: "declare Host: number" }],
    programEnvironment: { version: 1, values: ["ProgramValue", "math"], types: ["ProgramAlias"] } });
  expect(ok(await p.check("main")).diagnostics).toEqual([]);
  await p.update({ projectVersion: 2, programEnvironment: { version: 2, values: [], types: [] },
    definitions: [{ name: "host", version: 2, source: "declare Host: string" }] });
  const removed = ok(await p.check("main")); expect(removed.diagnostics).toHaveLength(3);
  expect((await p.reset()).status).toBe("ok");
  expect(ok(await p.check("main")).diagnostics).toEqual(removed.diagnostics);
  await p.update({ projectVersion: p.projectVersion + 1, documentModes: [{ module: "main", version: 1, mode: "nocheck" }] });
  const unchecked = ok(await p.check("main"));
  expect(unchecked.checkedModules).toBe(1); expect(unchecked.diagnostics).toEqual([]);
  expect(ok(await p.check("main")).checkedModules).toBe(0);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("main", 1, source)],
    definitions: [{ name: "host", version: 2, source: "declare Host: string" }],
    documentModes: [{ module: "main", version: 1, mode: "nocheck" }] });
  expect(unchecked.diagnostics).toEqual(ok(await fresh.check("main")).diagnostics);
  const raw = await project();
  await raw.update({ projectVersion: 1, documents: [{ module: "main", version: 1, source }],
    definitions: [{ name: "host", version: 2, source: "declare Host: string" }] });
  const rawStrict = await raw.check("main");
  expect(rawStrict.status).toBe("ok"); expect(rawStrict.diagnostics).toEqual(removed.diagnostics);
  await raw.update({ projectVersion: 2, documentModes: [{ module: "main", version: 1, mode: "nocheck" }] });
  const rawUnchecked = await raw.check("main");
  expect(rawUnchecked.status).toBe("ok"); expect(rawUnchecked.diagnostics).toEqual(unchecked.diagnostics);
  expect((await p.reset()).status).toBe("ok");
  expect(ok(await p.check("main")).diagnostics).toEqual([]);
  await p.update({ projectVersion: p.projectVersion + 1, removeDocumentModes: ["main"] });
  expect(ok(await p.check("main")).diagnostics).toEqual(removed.diagnostics);
  await p.update({ projectVersion: p.projectVersion + 1, documentModes: [{ module: "main", version: 2, mode: "nocheck" }] });
  expect(ok(await p.check("main")).diagnostics).toEqual([]);
  await p.update({ projectVersion: p.projectVersion + 1, documents: [document("main", 2, "--!strict\n" + source)] });
  expect(ok(await p.check("main")).diagnostics).toHaveLength(3);
  expect((await p.reset()).status).toBe("ok");
  expect(ok(await p.check("main")).diagnostics).toHaveLength(3);
});

test("cyclic require borrowers retain their old scope through recheck, unlink and deletion", async () => {
  const p = await project();
  const a = 'local other = require("B")\nlocal value: number = inherited\nreturn value\n';
  const b = 'local other = require("A")\nreturn other\n';
  const prelude = 'local inherited: number = 1\n';
  await p.update({ projectVersion: 1, documents: [document("P", 1, prelude), document("A", 1, a), document("B", 1, b)],
    scopeLinks: [{ module: "A", prelude: "P", version: 1 }] });
  const cold = ok(await p.check("A")); expect(cold.nativeRetention.flowOwners).toBe(1);
  await p.update({ projectVersion: 2, documents: [document("P", 2, 'local inherited: string = "x"\n')] });
  const warm = ok(await p.check("A"));
  expect(warm.diagnostics.some(d => d.module === "A" && /string.*number|number.*string/.test(d.message))).toBe(true);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("P", 2, 'local inherited: string = "x"\n'), document("A", 1, a), document("B", 1, b)],
    scopeLinks: [{ module: "A", prelude: "P", version: 1 }] });
  expect(warm.diagnostics).toEqual(ok(await fresh.check("A")).diagnostics);
  await p.update({ projectVersion: 3, removeScopeLinks: ["A"] });
  const unlinked = ok(await p.check("A")); expect(unlinked.nativeRetention.flowOwners).toBe(0);
  expect(unlinked.diagnostics.some(d => /inherited/.test(d.message))).toBe(true);
  await p.update({ projectVersion: 4, removeDocuments: ["A", "B", "P"] });
  await p.update({ projectVersion: 5, documents: [document("probe", 1, "return true\n")] });
  expect(ok(await p.check("probe")).nativeRetention).toEqual({ installedInputs: 1, retainedAstInputs: 1, snapshots: 0, flowOwners: 0, leases: 0 });
});

test("captured type-function environments invalidate consumers even when printed exports remain equal", async () => {
  const p = await project();
  const prelude = 'type function getnil()\n  local ty = types.singleton(nil)\n  if ty:is("nil") then return ty end\n  return types.string\nend\ntype function captured() return getnil() end\ntype Result = captured<>\n';
  const flow = document("flow", 1, 'local result: Result = nil\nreturn result\n');
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, prelude), flow],
    scopeLinks: [{ module: "flow", prelude: "prelude", version: 1 }] });
  const first = ok(await p.check("flow")); expect(first.diagnostics).toEqual([]);
  const equalResult = prelude.replace("return types.string", "return types.number");
  await p.update({ projectVersion: 2, documents: [document("prelude", 2, equalResult)] });
  const equal = ok(await p.check("flow")); expect(equal.checkedModules).toBe(2); expect(equal.diagnostics).toEqual([]);
  expect(generation(equal, "prelude")).not.toBe(generation(first, "prelude"));
  const changed = equalResult.replace("then return ty", "then return types.string");
  await p.update({ projectVersion: 3, documents: [document("prelude", 3, changed)] });
  const warm = ok(await p.check("flow")); expect(warm.checkedModules).toBe(2); expect(warm.diagnostics).toHaveLength(1);
  const fresh = await project();
  await fresh.update({ projectVersion: 1, documents: [document("prelude", 3, changed), flow],
    scopeLinks: [{ module: "flow", prelude: "prelude", version: 1 }] });
  expect(warm.diagnostics).toEqual(ok(await fresh.check("flow")).diagnostics);
});

test("repeated cyclic borrower deletion collects arenas and transitive importers update independently", async () => {
  const p = await project();
  let version = 0;
  for (let iteration = 1; iteration <= 8; iteration++) {
    const names = ["P" + iteration, "A" + iteration, "B" + iteration];
    const [prelude, consumer, importer] = names;
    await p.update({ projectVersion: ++version, documents: [
      document(prelude!, 1, 'local exported = {nested = {value = 42}}\n'),
      document(consumer!, 1, `local other = require("${importer}")\nreturn exported\n`),
      document(importer!, 1, `local result = require("${consumer}")\nreturn result\n`),
    ], scopeLinks: [{ module: consumer!, prelude: prelude!, version: 1 }] });
    const before = ok(await p.check(importer!)); expect(before.nativeRetention.snapshots).toBeGreaterThan(0);
    await p.update({ projectVersion: ++version, removeDocuments: [consumer!, prelude!] });
    // The importer is still alive; checking it replaces its old borrowing
    // graph with the real missing-module error rather than a tombstone AST.
    const missing = ok(await p.check(importer!)); expect(missing.diagnostics.some(d => /require|module/i.test(d.message))).toBe(true);
    await p.update({ projectVersion: ++version, removeDocuments: [importer!] });
    await p.update({ projectVersion: ++version, documents: [document("probe", iteration, "return true\n")] });
    expect(ok(await p.check("probe")).nativeRetention).toEqual({ installedInputs: 1, retainedAstInputs: 1, snapshots: 0, flowOwners: 0, leases: 0 });
  }
});
