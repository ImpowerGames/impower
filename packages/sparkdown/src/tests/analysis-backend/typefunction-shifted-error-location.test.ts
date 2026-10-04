import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisCheckResult, AnalysisDocument, AnalysisProject } from "../../analysis-backend/contract";
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
const links = [{ module: "B", prelude: "A", version: 1 }, { module: "flow", prelude: "B", version: 1 }];
const ordinary = "local function earlier(): number\n  return 111\nend\n";
// Pinned TypeFunction.user.test.cpp udtf_user_error_is_reported confirms that
// the native runtime error includes the compiled function's source line.
const executable = 'type function make(arg)\n  if arg:is("string") then\n    error("bounded failure")\n  end\n  return arg\nend\n';
const borrower = "type Input = number\ntype Result = make<Input>\nlocal exported: Result = nil :: any\n";
const flow = "local required: number = exported\nreturn exported\n";
function document(kind: Kind, input: Input): AnalysisDocument {
  const unit = luauFileUnit(input.source, text => compiler.documents.parser.parse(text))!;
  expect(unit.errors, input.module).toEqual([]);
  return kind === "source" ? input : { module: input.module, version: input.version, kind,
    ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(check: AnalysisCheckResult) { expect(check.status, check.message).toBe("ok"); return check; }
async function query(p: AnalysisProject, check: AnalysisCheckResult) {
  const result = await p.queryType(check.documents.find(h => h.module === "flow")!, { line: 1, column: 7 });
  expect(result.status, result.message).toBe("ok");
  return { status: result.status, type: result.type, truncated: result.truncated };
}
async function parity(kind: Kind, p: AnalysisProject, check: AnalysisCheckResult, inputs: Input[]) {
  const scalar = await query(p, check);
  for (const freshKind of [kind, kind === "ast" ? "source" : "ast"] as Kind[]) {
    const fresh = await project();
    try {
      expect((await fresh.update({ projectVersion: 1, documents: inputs.map(i => document(freshKind, i)), scopeLinks: links })).status).toBe("ok");
      const cold = ok(await fresh.check("flow"));
      expect(check.diagnostics).toEqual(cold.diagnostics); expect(scalar).toEqual(await query(fresh, cold));
    } finally { await dispose(fresh); }
  }
  return scalar;
}

test.each(["ast", "source"] as const)("shifted owner then borrower-only runtime error keeps current native locations (%s)", async kind => {
  const p = await project();
  let inputs = [{ module: "A", version: 1, source: ordinary + executable },
    { module: "B", version: 1, source: borrower }, { module: "flow", version: 1, source: flow }];
  expect((await p.update({ projectVersion: 1, documents: inputs.map(i => document(kind, i)), scopeLinks: links })).status).toBe("ok");
  const cold = ok(await p.check("flow")); expect(cold.diagnostics).toEqual([]);
  expect((await parity(kind, p, cold, inputs)).type).toBe("number");
  const shifts: AnalysisCheckResult[] = [];
  for (let version = 2; version <= 3; version++) {
    inputs[0] = { ...inputs[0]!, version, source: inputs[0]!.source.replace("  return 111", "  local copy" + version + ": number = 111\n  return 111") };
    const updated = await p.update({ projectVersion: version, documents: [document(kind, inputs[0]!)] });
    expect(updated.status, updated.message).toBe("ok"); expect(updated.work?.changedInputs).toBe(1);
    const shifted = ok(await p.check("flow")); shifts.push(shifted);
    expect((await parity(kind, p, shifted, inputs)).type).toBe("number");
    console.log("Shifted runtime-error owner before reevaluation", { kind, version, checked: shifted.checkedModules,
      generations: shifted.scopeGenerations, diagnostics: shifted.diagnostics, retention: shifted.nativeRetention });
  }
  // Change ONLY the borrower, forcing evaluation of the original retained
  // definition if reuse is enabled. Do not put a reuse assertion before this.
  inputs[1] = { ...inputs[1]!, version: 2, source: borrower.replace("Input = number", "Input = string") };
  const updated = await p.update({ projectVersion: 4, documents: [document(kind, inputs[1]!)] });
  expect(updated.status, updated.message).toBe("ok"); expect(updated.work?.changedInputs).toBe(1);
  const errored = ok(await p.check("flow"));
  console.log("Shifted runtime-error owner actual native message", { kind, checked: errored.checkedModules,
    diagnostics: errored.diagnostics, retention: errored.nativeRetention });
  expect(errored.diagnostics.some(d => d.kind === "UserDefinedTypeFunctionError" && d.message.includes("bounded failure"))).toBe(true);
  // Complete diagnostic text AND primary locations must equal both fresh
  // paths. No regex rewriting or guessed line numbers from printed messages.
  await parity(kind, p, errored, inputs);
  expect((await p.reset()).status).toBe("ok");
  const reset = ok(await p.check("flow")); await parity(kind, p, reset, inputs);
  inputs[1] = { ...inputs[1]!, version: 3, source: borrower };
  expect((await p.update({ projectVersion: p.projectVersion + 1, documents: [document(kind, inputs[1]!)] })).status).toBe("ok");
  const restored = ok(await p.check("flow")); expect(restored.diagnostics).toEqual([]);
  expect((await parity(kind, p, restored, inputs)).type).toBe("number");
  // Only after every consumer/reset/restoration tail: known unsupported error
  // library provenance is separate from position-only correspondence. This is
  // a required final reuse target, not evidence that current eligibility exists.
  for (const shifted of shifts) {
    expect(shifted.checkedModules).toBe(1); expect(shifted.scopeGenerations).toEqual(cold.scopeGenerations);
  }
});
