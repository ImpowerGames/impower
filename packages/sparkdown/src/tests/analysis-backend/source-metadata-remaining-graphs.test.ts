import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisCheckResult, AnalysisDocument, AnalysisProject, AnalysisScopeLink,
  AnalysisScopeSourceSelector, AnalysisSourceFacts } from "../../analysis-backend/contract";
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
function document(kind: Kind, input: Input): AnalysisDocument {
  // Validate maintained ingestion for BOTH paths before attributing a failure to native checking.
  const unit = luauFileUnit(input.source, text => compiler.documents.parser.parse(text))!;
  expect(unit.errors).toEqual([]);
  return kind === "source" ? input : { module: input.module, version: input.version, kind,
    ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(check: AnalysisCheckResult) { expect(check.status, check.message).toBe("ok"); return check; }
function generation(check: AnalysisCheckResult, module = "prelude") {
  return check.scopeGenerations.find(entry => entry.module === module)!.generation;
}
function fields(facts: AnalysisSourceFacts | null) {
  return facts && { complete: facts.complete, fields: facts.fields.map(({ sourceGeneration, ...field }) => field) };
}
async function query(p: AnalysisProject, check: AnalysisCheckResult, source: string, token: string) {
  const lines = source.trimEnd().split("\n"), line = lines.length - 1;
  const column = lines[line]!.lastIndexOf(token); expect(column).toBeGreaterThanOrEqual(0);
  const result = await p.queryType(check.documents.find(entry => entry.module === "flow")!, { line, column });
  expect(result.status, result.message).toBe("ok"); expect(result.type).not.toBeNull();
  return { status: result.status, type: result.type, truncated: result.truncated };
}
async function sourceFacts(p: AnalysisProject, check: AnalysisCheckResult, selector: AnalysisScopeSourceSelector, module = "flow") {
  const result = await p.queryScopeSourceMetadata(check.documents.find(entry => entry.module === module)!, selector);
  expect(result.status, result.message).toBe("ok"); expect(result.truncated).toBe(false);
  // Unsupported provenance remains observable; no guessed indexer/metatable source role.
  return { supported: result.supported, effective: fields(result.effective), truncated: result.truncated };
}
async function parity(kind: Kind, p: AnalysisProject, warm: AnalysisCheckResult, inputs: Input[],
  links: AnalysisScopeLink[], token: string, selector?: AnalysisScopeSourceSelector, sourceModule = "flow") {
  const flow = inputs.find(input => input.module === "flow")!.source;
  const observed = await query(p, warm, flow, token);
  const metadata = selector ? await sourceFacts(p, warm, selector, sourceModule) : undefined;
  const writingBorrower = selector && sourceModule === "prelude" ? await sourceFacts(p, warm, selector) : undefined;
  for (const path of [kind, kind === "ast" ? "source" : "ast"] as Kind[]) {
    const fresh = await project();
    try {
      expect((await fresh.update({ projectVersion: 1, documents: inputs.map(input => document(path, input)), scopeLinks: links })).status).toBe("ok");
      const cold = ok(await fresh.check("flow"));
      expect(warm.diagnostics).toEqual(cold.diagnostics);
      expect(observed).toEqual(await query(fresh, cold, flow, token));
      if (selector) expect(metadata).toEqual(await sourceFacts(fresh, cold, selector, sourceModule));
      if (writingBorrower) expect(writingBorrower).toEqual(await sourceFacts(fresh, cold, selector!));
    } finally { await dispose(fresh); }
  }
  if (writingBorrower) expect(writingBorrower).toEqual({ supported: false, effective: null, truncated: false });
  return { observed, metadata };
}
const body = "local function earlier(): number\n  return 111\nend\n";
const cases = [
  { name: "generic type default", declaration: "type Box<T = number> = {value: T}\nlocal box: Box = {value = 1}\n",
    flow: "local required: number = box.value\nreturn box.value\n", token: "value", selector: { namespace: "alias", name: "Box" },
    changed: (source: string) => source.replace("T = number", "T = string").replace("value = 1", 'value = "one"'),
    initialErrors: 0, changedErrors: 1, changedType: "string", shiftedCount: 2 },
  // Pinned TypeInfer.aliases.test.cpp default_pack_parameter.
  { name: "generic pack default", declaration: "type T<A... = (number, string)> = {fn: (A...) -> ()}\nlocal value: T\n",
    flow: 'local fn = value.fn\nfn(1, "text")\nreturn fn\n', token: "fn", selector: { namespace: "alias", name: "T" },
    changed: (source: string) => source.replace("(number, string)", "(string, number)"),
    initialErrors: 0, changedErrors: 2, changedType: undefined, shiftedCount: 2 },
  // Pinned read_only_indexer_write_rejected / read_only_indexer_read_allowed.
  { name: "readonly indexer", declaration: "type View = {read [string]: number}\nlocal view: View = {} :: any\n",
    flow: 'local observed: number = view["key"]\nview["key"] = 1\nreturn observed\n', token: "observed", selector: { namespace: "alias", name: "View" },
    changed: (source: string) => source.replace("{read [string]: number}", "{[string]: number}"),
    initialErrors: 1, changedErrors: 0, changedType: "number", shiftedCount: 1 },
  { name: "metatable property", declaration: "local prototype = {value = 42}\nlocal object = setmetatable({}, {__index = prototype})\n",
    flow: "local required: number = object.value\nreturn object.value\n", token: "value", selector: { namespace: "value", name: "prototype" },
    changed: (source: string) => source.replace("value = 42", 'value = "x"'),
    initialErrors: 0, changedErrors: 1, changedType: "string", shiftedCount: undefined },
] satisfies { name: string; declaration: string; flow: string; token: string; selector: AnalysisScopeSourceSelector;
  changed(source: string): string; initialErrors: number; changedErrors: number; changedType: string | undefined; shiftedCount: number | undefined }[];

for (const kind of ["ast", "source"] as const) test.each(cases)("$name current source facts, defaults and semantic changes (" + kind + ")", async fixture => {
  const p = await project(), links = [{ module: "flow", version: 1, prelude: "prelude" }];
  // Observe readonly birth in its unassigned owner; keep the writing consumer
  // and its normal errors, and separately assert its conservative provenance.
  const sourceModule = fixture.name === "readonly indexer" ? "prelude" : "flow";
  let inputs = [{ module: "prelude", version: 1, source: body + fixture.declaration }, { module: "flow", version: 1, source: fixture.flow }];
  expect((await p.update({ projectVersion: 1, documents: inputs.map(input => document(kind, input)), scopeLinks: links })).status).toBe("ok");
  const cold = ok(await p.check("flow")); expect(cold.checkedModules).toBe(2);
  expect(cold.diagnostics).toHaveLength(fixture.initialErrors);
  if (fixture.name === "readonly indexer") expect(cold.diagnostics[0]?.kind).toBe("PropertyAccessViolation");
  const initial = await parity(kind, p, cold, inputs, links, fixture.token, fixture.selector, sourceModule);
  if (fixture.name === "readonly indexer") {
    expect(initial.metadata?.supported).toBe(true); expect(initial.metadata?.effective?.complete).toBe(true);
  }
  expect(ok(await p.check("flow")).checkedModules).toBe(0);
  inputs[0] = { ...inputs[0]!, version: 2, source: inputs[0]!.source.replace("111", "222") };
  const updated = await p.update({ projectVersion: 2, documents: [document(kind, inputs[0]!)] });
  expect(updated.work?.changedInputs).toBe(1); expect(updated.work?.decodedInputs).toBe(kind === "ast" ? 1 : 0);
  const reused = ok(await p.check("flow"));
  const sameSpan = await parity(kind, p, reused, inputs, links, fixture.token, fixture.selector, sourceModule);
  expect(sameSpan.observed).toEqual(initial.observed); expect(reused.checkedModules).toBe(1);
  expect(generation(reused)).toBe(generation(cold)); expect(reused.diagnostics).toEqual(cold.diagnostics);
  for (let version = 3; version <= 4; version++) {
    inputs[0] = { ...inputs[0]!, version, source: inputs[0]!.source.replace("  return 222", "  local copy" + version + ": number = 222\n  return 222") };
    const work = await p.update({ projectVersion: version, documents: [document(kind, inputs[0]!)] });
    expect(work.work?.changedInputs).toBe(1); expect(work.work?.decodedInputs).toBe(kind === "ast" ? 1 : 0);
    const warm = ok(await p.check("flow"));
    const current = await parity(kind, p, warm, inputs, links, fixture.token, fixture.selector, sourceModule);
    expect(current.observed).toEqual(initial.observed);
    // Generic source-role fallback still reparses the raw caller; supported
    // own indexer birth permits reuse. AST retains its decoded source.
    expect(warm.work?.parsedModules).toBe(kind === "ast" ? 0 : (fixture.shiftedCount ?? 1));
    console.log("Remaining graph source shift", { kind, name: fixture.name, version, checked: warm.checkedModules,
      generations: warm.scopeGenerations, metadata: current.metadata, diagnostics: warm.diagnostics, query: current.observed });
    // This documents SAFE STAGED invalidation, not final #999 source-shift acceptance.
    if (fixture.shiftedCount !== undefined) {
      expect(warm.checkedModules).toBe(fixture.shiftedCount);
      if (fixture.name === "readonly indexer") {
        expect(generation(warm)).toBe(generation(cold));
        expect(current.metadata?.supported).toBe(true); expect(current.metadata?.effective?.complete).toBe(true);
      } else expect(generation(warm)).not.toBe(generation(cold));
    }
    // Metatable shift counters are observations pending complete constituent provenance.
    expect(ok(await p.check("flow")).checkedModules).toBe(0);
  }
  inputs[0] = { ...inputs[0]!, version: 5, source: fixture.changed(inputs[0]!.source) };
  expect((await p.update({ projectVersion: 5, documents: [document(kind, inputs[0]!)] })).status).toBe("ok");
  const changed = ok(await p.check("flow"));
  const current = await parity(kind, p, changed, inputs, links, fixture.token, fixture.selector, sourceModule);
  expect(changed.checkedModules).toBe(2); expect(generation(changed)).not.toBe(generation(reused));
  expect(changed.diagnostics).toHaveLength(fixture.changedErrors);
  if (fixture.changedType !== undefined) expect(current.observed.type).toBe(fixture.changedType);
  if (fixture.name === "generic pack default") {
    expect(changed.diagnostics.every(error => error.kind === "TypeMismatch")).toBe(true);
    expect(current.observed.type).not.toBe(initial.observed.type);
  }
});

test.each(["ast", "source"] as const)("unchanged visible type functions retain callers after an ordinary private same-span body edit (%s)", async kind => {
  const p = await project();
  const a = body + "type Input = number\ntype function make(arg) return arg end\n";
  const b = "type function captured(arg) return make(arg) end\ntype Result = captured<Input>\nlocal exported: Result = nil :: any\n";
  const flow = "local required: number = exported\nreturn exported\n";
  const links = [{ module: "B", prelude: "A", version: 1 }, { module: "flow", prelude: "B", version: 1 }];
  let inputs = [{ module: "A", version: 1, source: a }, { module: "B", version: 1, source: b }, { module: "flow", version: 1, source: flow }];
  expect((await p.update({ projectVersion: 1, documents: inputs.map(input => document(kind, input)), scopeLinks: links })).status).toBe("ok");
  const cold = ok(await p.check("flow")); expect(cold.checkedModules).toBe(3); expect(cold.diagnostics).toEqual([]);
  expect((await parity(kind, p, cold, inputs, links, "exported")).observed.type).toBe("number");
  expect(ok(await p.check("flow")).checkedModules).toBe(0);
  inputs[0] = { ...inputs[0]!, version: 2, source: a.replace("111", "222") };
  const work = await p.update({ projectVersion: 2, documents: [document(kind, inputs[0]!)] });
  expect(work.work?.changedInputs).toBe(1); expect(work.work?.decodedInputs).toBe(kind === "ast" ? 1 : 0);
  const warm = ok(await p.check("flow"));
  const current = await parity(kind, p, warm, inputs, links, "exported");
  expect(current.observed.type).toBe("number"); expect(warm.diagnostics).toEqual([]);
  console.log("Unchanged visible type-function private edit", { kind, checked: warm.checkedModules,
    before: cold.scopeGenerations, after: warm.scopeGenerations, work: work.work, query: current.observed });
  // Genuine remaining #999 target; blanket hasTypeFunctions invalidation must not become an accepted expectation.
  expect(warm.checkedModules).toBe(1); expect(generation(warm, "A")).toBe(generation(cold, "A"));
  expect(generation(warm, "B")).toBe(generation(cold, "B"));
  // The retained original definition must also match a second new allocator,
  // without relying on previous-to-next AST or callable pointer identity.
  inputs[0] = { ...inputs[0]!, version: 3, source: inputs[0]!.source.replace("222", "333") };
  expect((await p.update({ projectVersion: 3, documents: [document(kind, inputs[0]!)] })).status).toBe("ok");
  const repeated = ok(await p.check("flow"));
  expect((await parity(kind, p, repeated, inputs, links, "exported")).observed.type).toBe("number");
  expect(repeated.checkedModules).toBe(1); expect(generation(repeated, "A")).toBe(generation(cold, "A"));
  expect(generation(repeated, "B")).toBe(generation(cold, "B"));
  inputs[0] = { ...inputs[0]!, version: 4, source: inputs[0]!.source.replace("Input = number", "Input = string") };
  expect((await p.update({ projectVersion: 4, documents: [document(kind, inputs[0]!)] })).status).toBe("ok");
  const changed = ok(await p.check("flow"));
  expect((await parity(kind, p, changed, inputs, links, "exported")).observed.type).toBe("string");
  expect(changed.checkedModules).toBe(3); expect(generation(changed, "A")).not.toBe(generation(cold, "A"));
  expect(changed.diagnostics.some(error => error.kind === "TypeMismatch")).toBe(true);
});
