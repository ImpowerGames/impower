import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisCheckResult, AnalysisDocument, AnalysisProject, AnalysisUpdate } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const projects = new Set<AnalysisProject>();
afterEach(async () => { await Promise.all([...projects].map(dispose)); });
async function dispose(p: AnalysisProject) { projects.delete(p); await p.dispose(); }
async function project() {
  const p = await createNodeAnalysisBackend().createProject({ mode: "strict" }); projects.add(p); return p;
}
type Kind = "ast" | "source";
type Input = { module: string; version: number; source: string };
const ordinary = "local function earlier(): number\n  return 111\nend\n";
const B = "type function captured(arg) return make(arg) end\ntype Result = captured<Input>\nlocal exported: Result = nil :: any\n";
const FLOW = "local required: number = exported\nreturn exported\n";
const links = [{ module: "B", prelude: "A", version: 1 }, { module: "flow", prelude: "B", version: 1 }];
function document(kind: Kind, input: Input): AnalysisDocument {
  const unit = luauFileUnit(input.source, text => compiler.documents.parser.parse(text))!;
  expect(unit.errors).toEqual([]);
  return kind === "source" ? input : { module: input.module, version: input.version, kind,
    ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(check: AnalysisCheckResult) { expect(check.status, check.message).toBe("ok"); return check; }
async function update(p: AnalysisProject, input: AnalysisUpdate) {
  const result = await p.update(input); expect(result.status, result.message).toBe("ok"); return result;
}
function generation(check: AnalysisCheckResult, module: string) { return check.scopeGenerations.find(g => g.module === module)!.generation; }
async function query(p: AnalysisProject, check: AnalysisCheckResult) {
  const result = await p.queryType(check.documents.find(h => h.module === "flow")!, { line: 1, column: 7 });
  expect(result.status, result.message).toBe("ok"); expect(result.type).not.toBeNull();
  return { status: result.status, type: result.type, truncated: result.truncated };
}
async function parity(kind: Kind, p: AnalysisProject, warm: AnalysisCheckResult, inputs: Input[], activeLinks = links) {
  const observed = await query(p, warm);
  for (const freshKind of [kind, kind === "ast" ? "source" : "ast"] as Kind[]) {
    const fresh = await project();
    try {
      expect((await fresh.update({ projectVersion: 1, documents: inputs.map(i => document(freshKind, i)), scopeLinks: activeLinks })).status).toBe("ok");
      const cold = ok(await fresh.check("flow")); expect(warm.diagnostics).toEqual(cold.diagnostics);
      expect(observed).toEqual(await query(fresh, cold));
    } finally { await dispose(fresh); }
  }
  return observed;
}
const cases: { name: string; executable: string; changed(s: string): string; changedType?: string }[] = [
  { name: "paired local declarations and references", executable: "type function make(arg) local one = arg local two = arg return one end\n",
    changed: (s: string) => s.replace("return one end", "return two end") },
  { name: "same-result operator change", executable: "type function make(arg) if 1 == 1 then return arg else return arg end end\n",
    changed: (s: string) => s.replace("1 == 1", "1 ~= 1") },
  { name: "same-result captured helper selection", executable: "type function first(arg) return arg end\ntype function other(arg) return arg end\ntype function make(arg) return first(arg) end\n",
    changed: (s: string) => s.replace("return first(arg)", "return other(arg)") },
  { name: "owned captured primitive alias", executable: "type function make(arg) return Input end\n",
    changed: (s: string) => s.replace("Input = number", "Input = string"), changedType: "string" },
];

for (const kind of ["ast", "source"] as const) test.each(cases)("$name keeps only truly unchanged executable captures (" + kind + ")", async fixture => {
  const p = await project();
  let inputs = [{ module: "A", version: 1, source: ordinary + "type Input = number\n" + fixture.executable },
    { module: "B", version: 1, source: B }, { module: "flow", version: 1, source: FLOW }];
  expect((await p.update({ projectVersion: 1, documents: inputs.map(i => document(kind, i)), scopeLinks: links })).status).toBe("ok");
  const cold = ok(await p.check("flow")); expect(cold.checkedModules).toBe(3); expect(cold.diagnostics).toEqual([]);
  expect((await parity(kind, p, cold, inputs)).type).toBe("number");
  for (let version = 2; version <= 3; version++) {
    inputs[0] = { ...inputs[0]!, version, source: inputs[0]!.source.replace(version === 2 ? "111" : "222", version === 2 ? "222" : "333") };
    const work = await p.update({ projectVersion: version, documents: [document(kind, inputs[0]!)] });
    expect(work.work?.changedInputs).toBe(1); expect(work.work?.decodedInputs).toBe(kind === "ast" ? 1 : 0);
    const warm = ok(await p.check("flow"));
    expect((await parity(kind, p, warm, inputs)).type).toBe("number"); expect(warm.diagnostics).toEqual([]);
    expect(warm.checkedModules).toBe(1); expect(generation(warm, "A")).toBe(generation(cold, "A"));
    expect(generation(warm, "B")).toBe(generation(cold, "B")); expect(ok(await p.check("flow")).checkedModules).toBe(0);
  }
  inputs[0] = { ...inputs[0]!, version: 4, source: fixture.changed(inputs[0]!.source) };
  expect((await p.update({ projectVersion: 4, documents: [document(kind, inputs[0]!)] })).status).toBe("ok");
  const changed = ok(await p.check("flow"));
  expect((await parity(kind, p, changed, inputs)).type).toBe(fixture.changedType ?? "number");
  expect(changed.checkedModules).toBe(3); expect(generation(changed, "A")).not.toBe(generation(cold, "A"));
  expect(generation(changed, "B")).not.toBe(generation(cold, "B"));
  if (fixture.changedType) expect(changed.diagnostics.some(d => d.kind === "TypeMismatch")).toBe(true);
  else expect(changed.diagnostics).toEqual([]);
});

test.each(["ast", "source"] as const)("derived inputs and executable source shifts remain conservative (%s)", async kind => {
  const p = await project();
  const derived = ordinary + "local seed: number = 1\ntype Input = typeof(seed)\ntype function make(arg) return arg end\n";
  let inputs = [{ module: "A", version: 1, source: derived }, { module: "B", version: 1, source: B }, { module: "flow", version: 1, source: FLOW }];
  expect((await p.update({ projectVersion: 1, documents: inputs.map(i => document(kind, i)), scopeLinks: links })).status).toBe("ok");
  const cold = ok(await p.check("flow")); expect((await parity(kind, p, cold, inputs)).type).toBe("number");
  inputs[0] = { ...inputs[0]!, version: 2, source: derived.replace("seed: number = 1", "seed: number = 2") };
  await update(p, { projectVersion: 2, documents: [document(kind, inputs[0]!)] });
  const unknown = ok(await p.check("flow")); expect((await parity(kind, p, unknown, inputs)).type).toBe("number");
  expect(unknown.checkedModules).toBe(3); expect(generation(unknown, "A")).not.toBe(generation(cold, "A"));
  // Strict executable positions are a disclosed remaining #999 limitation.
  const direct = ordinary + "type Input = number\ntype function make(arg) return arg end\n";
  inputs[0] = { ...inputs[0]!, version: 3, source: direct };
  await update(p, { projectVersion: 3, documents: [document(kind, inputs[0]!)] });
  const origin = ok(await p.check("flow"));
  inputs[0] = { ...inputs[0]!, version: 4, source: direct.replace("  return 111", "  local copy = 111\n  return copy") };
  await update(p, { projectVersion: 4, documents: [document(kind, inputs[0]!)] });
  const shifted = ok(await p.check("flow")); expect((await parity(kind, p, shifted, inputs)).type).toBe("number");
  expect(shifted.checkedModules).toBe(3); expect(generation(shifted, "A")).not.toBe(generation(origin, "A"));
});

test.each(["ast", "source"] as const)("retained executable borrowers survive recheck, failure, reset and collection (%s)", async kind => {
  const p = await project();
  let inputs = [{ module: "A", version: 1, source: ordinary + "type Input = number\ntype function make(arg) return arg end\n" },
    { module: "B", version: 1, source: B }, { module: "flow", version: 1, source: FLOW },
    { module: "unrelated", version: 1, source: "return 42\n" }];
  await update(p, { projectVersion: 1, documents: inputs.map(i => document(kind, i)), scopeLinks: links });
  const baseline = ok(await p.check("unrelated")).nativeRetention;
  const cold = ok(await p.check("flow")); expect(cold.checkedModules).toBe(3);
  inputs[0] = { ...inputs[0]!, version: 2, source: inputs[0]!.source.replace("111", "222") };
  await update(p, { projectVersion: 2, documents: [document(kind, inputs[0]!)] });
  const reused = ok(await p.check("flow")); expect(reused.checkedModules).toBe(1);
  expect((await parity(kind, p, reused, inputs)).type).toBe("number");
  inputs[1] = { ...inputs[1]!, version: 2, source: B + "local borrower: Result = exported\n" };
  await update(p, { projectVersion: 3, documents: [document(kind, inputs[1]!)] });
  const borrower = ok(await p.check("flow")); expect(borrower.checkedModules).toBe(2);
  expect((await parity(kind, p, borrower, inputs)).type).toBe("number");
  const failure: Input = { module: "failure", version: 1,
    source: 'type function explode() error("not enough memory") end\ntype Result = explode<>\nlocal value: Result = nil\nreturn value\n' };
  inputs[0] = { ...inputs[0]!, version: 3, source: inputs[0]!.source.replace("222", "333") };
  await update(p, { projectVersion: 4, documents: [document(kind, inputs[0]!), document(kind, failure)] });
  const beforeFailure = ok(await p.check("flow")); expect(beforeFailure.checkedModules).toBe(1);
  expect((await parity(kind, p, beforeFailure, inputs)).type).toBe("number");
  const validHandle = beforeFailure.documents.find(h => h.module === "flow")!;
  const version = p.projectVersion;
  // The existing ambiguous-allocation-message policy is a backend failure;
  // this is not evidence of real OOM or an ordinary TF diagnostic status.
  const failed = await p.checkModules(["flow", "failure"]); expect(failed.status).toBe("error"); expect(failed.documents).toEqual([]);
  expect(failed.diagnostics.some(d => d.kind === "UserDefinedTypeFunctionError")).toBe(true);
  expect(p.projectVersion).toBe(version); await expect(p.queryType(validHandle, { line: 1, column: 7 })).rejects.toThrow("Stale");
  expect((await p.reset()).status).toBe("ok");
  await update(p, { projectVersion: p.projectVersion + 1, removeDocuments: ["failure"] });
  const reset = ok(await p.check("flow")); expect(reset.checkedModules).toBe(3);
  expect((await parity(kind, p, reset, inputs)).type).toBe("number");
  expect(ok(await p.check("unrelated")).checkedModules).toBe(1);
  await update(p, { projectVersion: p.projectVersion + 1, removeDocuments: ["A"], removeScopeLinks: ["B"] });
  const unlinkedInputs = inputs.filter(i => i.module !== "A");
  const unlinked = ok(await p.check("flow")); expect(unlinked.checkedModules).toBe(2);
  expect(unlinked.diagnostics.length).toBeGreaterThan(0);
  await parity(kind, p, unlinked, unlinkedInputs, links.filter(l => l.module !== "B"));
  inputs[0] = { ...inputs[0]!, version: 4 };
  await update(p, { projectVersion: p.projectVersion + 1, documents: [document(kind, inputs[0]!)], scopeLinks: [{ module: "B", prelude: "A", version: 2 }] });
  const restored = ok(await p.check("flow")); expect(restored.checkedModules).toBe(3);
  expect((await parity(kind, p, restored, inputs)).type).toBe("number");
  await update(p, { projectVersion: p.projectVersion + 1, removeDocuments: ["flow", "B", "A"] });
  const collected = ok(await p.check("unrelated")); expect(collected.checkedModules).toBe(0);
  expect(collected.nativeRetention).toEqual({ ...baseline, installedInputs: 1, retainedAstInputs: kind === "ast" ? 1 : 0 });
});
