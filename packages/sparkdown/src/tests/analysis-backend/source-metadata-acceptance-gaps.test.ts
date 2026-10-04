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
const ordinary = "local function earlier(): number\n  return 111\nend\n";
const captured = "type function captured(arg) return make(arg) end\ntype Result = captured<Input>\nlocal exported: Result = nil :: any\n";
const exportedFlow = "local required: number = exported\nreturn exported\n";
function document(kind: Kind, input: Input): AnalysisDocument {
  const unit = luauFileUnit(input.source, text => compiler.documents.parser.parse(text))!;
  expect(unit.errors, input.module).toEqual([]);
  return kind === "source" ? input : { module: input.module, version: input.version, kind,
    ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(check: AnalysisCheckResult) { expect(check.status, check.message).toBe("ok"); return check; }
async function update(p: AnalysisProject, kind: Kind, version: number, documents: Input[], links?: AnalysisScopeLink[]) {
  const result = await p.update({ projectVersion: version, documents: documents.map(i => document(kind, i)), scopeLinks: links });
  expect(result.status, result.message).toBe("ok"); return result;
}
function handle(check: AnalysisCheckResult) { return check.documents.find(h => h.module === "flow")!; }
function generations(check: AnalysisCheckResult) { return check.scopeGenerations.map(({ module, generation }) => ({ module, generation })); }
function fields(facts: AnalysisSourceFacts | null) {
  return facts && { complete: facts.complete, fields: facts.fields.map(({ sourceGeneration, ...field }) => field) };
}
async function observe(p: AnalysisProject, check: AnalysisCheckResult, flow: string, token: string, selector: AnalysisScopeSourceSelector) {
  const lines = flow.trimEnd().split("\n"), line = lines.length - 1, column = lines[line]!.lastIndexOf(token);
  expect(column).toBeGreaterThanOrEqual(0);
  const scalar = await p.queryType(handle(check), { line, column });
  expect(scalar.status, scalar.message).toBe("ok"); expect(scalar.type).not.toBeNull();
  const source = await p.queryScopeSourceMetadata(handle(check), selector);
  expect(source.status, source.message).toBe("ok"); expect(source.truncated).toBe(false);
  return { scalar: { status: scalar.status, type: scalar.type, truncated: scalar.truncated },
    source: { supported: source.supported, effective: fields(source.effective), truncated: source.truncated }, rawSource: source };
}
async function parity(kind: Kind, p: AnalysisProject, warm: AnalysisCheckResult, inputs: Input[], links: AnalysisScopeLink[],
  token: string, selector: AnalysisScopeSourceSelector) {
  const flow = inputs.find(i => i.module === "flow")!.source;
  const actual = await observe(p, warm, flow, token, selector);
  for (const freshKind of [kind, kind === "ast" ? "source" : "ast"] as Kind[]) {
    const fresh = await project();
    try {
      await update(fresh, freshKind, 1, inputs, links);
      const cold = ok(await fresh.check("flow"));
      const expected = await observe(fresh, cold, flow, token, selector);
      expect(warm.diagnostics).toEqual(cold.diagnostics);
      expect(actual.scalar).toEqual(expected.scalar); expect(actual.source).toEqual(expected.source);
    } finally { await dispose(fresh); }
  }
  return actual;
}
type Fixture = { name: string; declaration: string; flow: string; token: string; selector: AnalysisScopeSourceSelector;
  lexical: boolean; shift: boolean; initialErrors: number; changedErrors: number; changedType?: string;
  change(source: string): string; unsupported?: boolean };
const fixtures: Fixture[] = [
  { name: "shifted unchanged executable type function", declaration: "type Input = number\ntype function make(arg) return arg end\n",
    flow: exportedFlow, token: "exported", selector: { namespace: "alias", name: "Input" }, lexical: true, shift: true,
    initialErrors: 0, changedErrors: 1, changedType: "string", change: s => s.replace("Input = number", "Input = string") },
  { name: "shifted generic type default", declaration: "type Box<T = number> = {value: T}\nlocal box: Box = {value = 1}\n",
    flow: "local required: number = box.value\nreturn box.value\n", token: "value", selector: { namespace: "alias", name: "Box" }, lexical: false, shift: true,
    initialErrors: 0, changedErrors: 1, changedType: "string", change: s => s.replace("T = number", "T = string").replace("value = 1", 'value = "one"') },
  { name: "shifted generic pack default", declaration: "type T<A... = (number, string)> = {fn: (A...) -> ()}\nlocal value: T\n",
    flow: 'local fn = value.fn\nfn(1, "text")\nreturn fn\n', token: "fn", selector: { namespace: "alias", name: "T" }, lexical: false, shift: true,
    initialErrors: 0, changedErrors: 2, change: s => s.replace("(number, string)", "(string, number)") },
  { name: "shifted readonly indexer", declaration: "type View = {read [string]: number}\nlocal view: View = {} :: any\n",
    flow: 'local observed: number = view["key"]\nview["key"] = 1\nreturn observed\n', token: "observed", selector: { namespace: "alias", name: "View" }, lexical: false, shift: true,
    initialErrors: 1, changedErrors: 0, changedType: "number", change: s => s.replace("{read [string]: number}", "{[string]: number}") },
  // Same prior legal typeof fixture, but the edited function is unrelated to seed.
  // The separate seed mutation below must still invalidate executable captures.
  { name: "unrelated private edit with derived typeof export", declaration: "local seed: number = 1\ntype Input = typeof(seed)\ntype function make(arg) return arg end\n",
    flow: exportedFlow, token: "exported", selector: { namespace: "alias", name: "Input" }, lexical: true, shift: false,
    initialErrors: 0, changedErrors: 1, changedType: "string", change: s => s.replace("seed: number = 1", 'seed: string = "one"') },
  { name: "shifted metatable property positive", declaration: "local prototype = {value = 42}\nlocal object = setmetatable({}, {__index = prototype})\n",
    flow: "local required: number = object.value\nreturn object.value\n", token: "value", selector: { namespace: "value", name: "prototype" }, lexical: false, shift: true,
    initialErrors: 0, changedErrors: 1, changedType: "string", change: s => s.replace("value = 42", 'value = "x"') },
];

for (const kind of ["ast", "source"] as const) test.each(fixtures)("$name meets unchanged export reuse (" + kind + ")", async fixture => {
  const p = await project(), owner = fixture.lexical ? "A" : "prelude";
  const links: AnalysisScopeLink[] = fixture.lexical
    ? [{ module: "B", prelude: "A", version: 1 }, { module: "flow", prelude: "B", version: 1 }]
    : [{ module: "flow", prelude: "prelude", version: 1 }];
  let inputs: Input[] = [{ module: owner, version: 1, source: ordinary + fixture.declaration },
    ...(fixture.lexical ? [{ module: "B", version: 1, source: captured }] : []), { module: "flow", version: 1, source: fixture.flow }];
  await update(p, kind, 1, inputs, links);
  const cold = ok(await p.check("flow")); expect(cold.checkedModules).toBe(fixture.lexical ? 3 : 2);
  expect(cold.diagnostics).toHaveLength(fixture.initialErrors);
  if (fixture.name === "shifted readonly indexer") expect(cold.diagnostics[0]?.kind).toBe("PropertyAccessViolation");
  const initial = await parity(kind, p, cold, inputs, links, fixture.token, fixture.selector);
  if (fixture.unsupported) expect(initial.source.supported).toBe(false);
  if (fixture.name === "shifted readonly indexer") {
    expect(initial.source.supported).toBe(true); expect(initial.source.effective?.complete).toBe(true);
  }
  expect(ok(await p.check("flow")).checkedModules).toBe(0);
  let prior = cold;
  for (let version = 2; version <= 3; version++) {
    inputs[0] = { ...inputs[0]!, version, source: fixture.shift
      ? inputs[0]!.source.replace("  return 111", "  local copy" + version + ": number = 111\n  return 111")
      : inputs[0]!.source.replace(version === 2 ? "111" : "222", version === 2 ? "222" : "333") };
    const updated = await update(p, kind, version, [inputs[0]!]);
    expect(updated.work?.changedInputs).toBe(1); expect(updated.work?.decodedInputs).toBe(kind === "ast" ? 1 : 0);
    const warm = ok(await p.check("flow"));
    const actual = await parity(kind, p, warm, inputs, links, fixture.token, fixture.selector);
    expect(actual.scalar).toEqual(initial.scalar);
    console.log("Remaining unchanged-export acceptance", { kind, fixture: fixture.name, version,
      requiredChecked: 1, actualChecked: warm.checkedModules, before: generations(cold), after: generations(warm),
      changedInputWork: updated.work, nativeWork: warm.work, diagnostics: warm.diagnostics,
      current: actual.source, rawOrigins: actual.rawSource, scalar: actual.scalar });
    // Current facts and complete fresh parity are observed BEFORE the required
    // reuse assertion. Unsupported origins cannot silently become guessed facts.
    if (fixture.unsupported) expect(actual.source.supported).toBe(false);
    if (fixture.name === "shifted readonly indexer") {
      expect(actual.source.supported).toBe(true); expect(actual.source.effective?.complete).toBe(true);
    }
    if (fixture.shift && actual.source.supported) {
      const original = initial.source.effective!.fields.find(f => f.kind === "alias-definition" || f.kind === "table-definition");
      const current = actual.source.effective!.fields.find(f => f.kind === original?.kind && f.name === original?.name);
      expect(original).toBeDefined(); expect(current).toBeDefined();
      expect(current!.range.start.line).toBe(original!.range.start.line + version - 1);
    }
    expect(warm.checkedModules).toBe(1);
    expect(generations(warm)).toEqual(generations(cold));
    // No unchanged dependent may be reparsed. The changed raw input may have
    // been parsed during installation or checking; do not require extra work.
    expect(warm.work?.parsedModules).toBeLessThanOrEqual(kind === "ast" ? 0 : 1);
    if (fixture.shift) expect(warm.scopeMetadataGenerations.find(g => g.module === owner)!.generation)
      .toBeGreaterThan(prior.scopeMetadataGenerations.find(g => g.module === owner)!.generation);
    expect(ok(await p.check("flow")).checkedModules).toBe(0); prior = warm;
  }
  inputs[0] = { ...inputs[0]!, version: 4, source: fixture.change(inputs[0]!.source) };
  await update(p, kind, 4, [inputs[0]!]);
  const changed = ok(await p.check("flow"));
  const current = await parity(kind, p, changed, inputs, links, fixture.token, fixture.selector);
  expect(changed.checkedModules).toBe(fixture.lexical ? 3 : 2);
  expect(generations(changed)).not.toEqual(generations(cold)); expect(changed.diagnostics).toHaveLength(fixture.changedErrors);
  if (fixture.changedType) expect(current.scalar.type).toBe(fixture.changedType);
  if (fixture.name === "shifted generic pack default") {
    expect(changed.diagnostics.every(d => d.kind === "TypeMismatch")).toBe(true);
    expect(current.scalar.type).not.toBe(initial.scalar.type);
  }
});
