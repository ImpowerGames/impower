import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisCheckResult, AnalysisDocument, AnalysisProject, AnalysisScopeSourceQueryResult } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const projects = new Set<AnalysisProject>();
afterEach(async () => { await Promise.all([...projects].map(dispose)); });
async function dispose(p: AnalysisProject) { projects.delete(p); await p.dispose(); }
async function project() { const p = await createNodeAnalysisBackend().createProject({ mode: "strict" }); projects.add(p); return p; }
type Kind = "ast" | "source";
type Input = { module: string; version: number; source: string };
const ordinary = "local function earlier(): number\n  return 111\nend\n";
const links = [{ module: "flow", version: 1, prelude: "prelude" }];
function document(kind: Kind, input: Input): AnalysisDocument {
  const unit = luauFileUnit(input.source, text => compiler.documents.parser.parse(text))!;
  expect(unit.errors, input.module).toEqual([]);
  return kind === "source" ? input : { module: input.module, version: input.version, kind,
    ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
async function update(p: AnalysisProject, kind: Kind, version: number, inputs: Input[], initial = false) {
  const result = await p.update({ projectVersion: version, documents: inputs.map(input => document(kind, input)),
    scopeLinks: initial ? links : undefined });
  expect(result.status, result.message).toBe("ok"); return result;
}
function ok(check: AnalysisCheckResult) { expect(check.status, check.message).toBe("ok"); return check; }
function handle(check: AnalysisCheckResult, module = "flow") { return check.documents.find(entry => entry.module === module)!; }
function generations(check: AnalysisCheckResult) { return check.scopeGenerations.map(({ module, generation }) => ({ module, generation })); }
function facts(result: AnalysisScopeSourceQueryResult) {
  return { supported: result.supported, truncated: result.truncated,
    effective: result.effective && { complete: result.effective.complete,
      fields: result.effective.fields.map(({ sourceGeneration, ...field }) => field) } };
}
async function observe(p: AnalysisProject, check: AnalysisCheckResult, flow: string, sourceModule = "flow") {
  const lines = flow.trimEnd().split("\n"), line = lines.length - 1, column = lines[line]!.indexOf("observed");
  expect(column).toBeGreaterThanOrEqual(0);
  const scalar = await p.queryType(handle(check), { line, column });
  expect(scalar.status, scalar.message).toBe("ok"); expect(scalar.type).not.toBeNull();
  const source = await p.queryScopeSourceMetadata(handle(check, sourceModule), { namespace: "alias", name: "View" });
  expect(source.status, source.message).toBe("ok"); expect(source.truncated).toBe(false);
  const borrower = await p.queryScopeSourceMetadata(handle(check), { namespace: "alias", name: "View" });
  expect(borrower.status, borrower.message).toBe("ok"); expect(borrower.truncated).toBe(false);
  return { scalar: { status: scalar.status, type: scalar.type, truncated: scalar.truncated }, source, borrower };
}
async function parity(kind: Kind, p: AnalysisProject, warm: AnalysisCheckResult, inputs: Input[], sourceModule = "flow") {
  const actual = await observe(p, warm, inputs[1]!.source, sourceModule);
  for (const freshKind of [kind, kind === "ast" ? "source" : "ast"] as Kind[]) {
    const fresh = await project();
    try {
      await update(fresh, freshKind, 1, inputs, true);
      const cold = ok(await fresh.check("flow")), expected = await observe(fresh, cold, inputs[1]!.source, sourceModule);
      expect(warm.diagnostics).toEqual(cold.diagnostics);
      expect(actual.scalar).toEqual(expected.scalar); expect(facts(actual.source)).toEqual(facts(expected.source));
      expect(facts(actual.borrower)).toEqual(facts(expected.borrower));
    } finally { await dispose(fresh); }
  }
  return actual;
}
type Mutation = { name: string; declaration: string; flow: string; change(source: string): string; type?: string; readonly?: boolean };
const base = "type View = {read [string]: number}\nlocal view: View = {} :: any\n";
const flow = 'local observed = view["key"]\nlocal required: number = observed\nview["key"] = 1\nreturn observed\n';
const mutations: Mutation[] = [
  { name: "key type", declaration: base, flow, change: s => s.replace("[string]", "[number]") },
  { name: "result type", declaration: base, flow, change: s => s.replace("[string]: number", "[string]: string"), type: "string" },
  { name: "read/write access", declaration: base, flow, change: s => s.replace("read [string]", "[string]"), type: "number", readonly: false },
  { name: "coexisting property birth", declaration: base.replace("{read [", "{read count: number, read ["),
    flow: 'local observed = view.count\nlocal required: number = observed\nview["key"] = 1\nreturn observed\n',
    change: s => s.replace("read [string]", "[string]"), type: "number", readonly: false },
];
for (const kind of ["ast", "source"] as const) test.each(mutations)(
  "own indexer birth/copies preserve shifts and invalidate $name (" + kind + ")", async fixture => {
    const p = await project();
    let inputs: Input[] = [{ module: "prelude", version: 1, source: ordinary + fixture.declaration },
      { module: "flow", version: 1, source: fixture.flow }];
    await update(p, kind, 1, inputs, true);
    const cold = ok(await p.check("flow")); expect(cold.checkedModules).toBe(2);
    expect(cold.diagnostics).toHaveLength(1); expect(cold.diagnostics[0]!.kind).toBe("PropertyAccessViolation");
    const initial = await parity(kind, p, cold, inputs, "prelude");
    console.log("Own indexer owner birth / writing borrower", { kind, fixture: fixture.name,
      owner: initial.source, borrower: initial.borrower });
    expect(initial.scalar.type).toBe("number"); expect(ok(await p.check("flow")).checkedModules).toBe(0);
    const shifts: { check: AnalysisCheckResult; observed: Awaited<ReturnType<typeof observe>> }[] = [];
    for (let version = 2; version <= 3; version++) {
      inputs[0] = { ...inputs[0]!, version, source: inputs[0]!.source.replace("  return 111",
        "  local copy" + version + ": number = 111\n  return 111") };
      const updated = await update(p, kind, version, [inputs[0]!]);
      expect(updated.work?.changedInputs).toBe(1); expect(updated.work?.decodedInputs).toBe(kind === "ast" ? 1 : 0);
      const warm = ok(await p.check("flow")), current = await parity(kind, p, warm, inputs, "prelude");
      expect(current.scalar).toEqual(initial.scalar); shifts.push({ check: warm, observed: current });
      console.log("Own indexer shift and source roles", { kind, fixture: fixture.name, version, work: warm.work,
        checked: warm.checkedModules, generations: generations(warm), facts: current.source, diagnostics: warm.diagnostics });
    }
    // Execute semantic negatives before reuse assertions: today's conservative
    // shift must not hide key/result/access/property invalidation behavior.
    inputs[0] = { ...inputs[0]!, version: 4, source: fixture.change(inputs[0]!.source) };
    await update(p, kind, 4, [inputs[0]!]);
    const changed = ok(await p.check("flow")), current = await parity(kind, p, changed, inputs, "prelude");
    console.log("Own indexer semantic mutation", { kind, fixture: fixture.name, checked: changed.checkedModules,
      generations: generations(changed), facts: current.source, scalar: current.scalar, diagnostics: changed.diagnostics });
    expect(changed.checkedModules).toBe(2); expect(generations(changed)).not.toEqual(generations(cold));
    expect(changed.diagnostics).not.toEqual(cold.diagnostics);
    if (fixture.type) expect(current.scalar.type).toBe(fixture.type);
    if (fixture.readonly === false) expect(changed.diagnostics).toEqual([]);
    else if (fixture.name === "result type") expect(changed.diagnostics.some(error => error.kind === "PropertyAccessViolation")).toBe(true);
    expect(ok(await p.check("flow")).checkedModules).toBe(0);

    // Owner queries observe its current unassigned birth; this writing borrower
    // deliberately has no complete imported-table provenance, even on rejected writes.
    expect(initial.source.supported).toBe(true); expect(initial.source.origin?.complete).toBe(true);
    expect(initial.source.effective?.complete).toBe(true);
    expect(current.source.supported).toBe(true); expect(current.source.origin?.complete).toBe(true);
    expect(current.source.effective?.complete).toBe(true);
    for (const observed of [initial, ...shifts.map(shift => shift.observed), current]) {
      expect(observed.borrower.supported).toBe(false);
      expect(observed.borrower.origin).toBeNull(); expect(observed.borrower.effective).toBeNull();
    }
    for (let i = 0; i < shifts.length; i++) {
      const { check, observed } = shifts[i]!;
      expect(observed.source.supported).toBe(true); expect(observed.source.origin?.complete).toBe(true);
      // A freshly checked owner has a current origin; retained-original copy
      // correspondence is asserted by the independent unassigned borrower below.
      expect(observed.source.effective?.complete).toBe(true);
      const old = initial.source.effective!.fields.find(field => field.kind === "table-definition")!;
      const latest = observed.source.effective!.fields.find(field => field.kind === "table-definition")!;
      expect(old).toBeDefined(); expect(latest).toBeDefined();
      expect(latest.range.start.line).toBe(old.range.start.line + i + 1);
      expect(latest.sourceGeneration).not.toBe(old.sourceGeneration);
      if (fixture.name === "coexisting property birth") {
        const property = observed.source.effective!.fields.find(field => field.kind === "property-type-location" && field.name === "count")!;
        expect(property).toBeDefined(); expect(property.range.start.line).toBe(latest.range.start.line);
      }
      expect(check.checkedModules).toBe(1); expect(generations(check)).toEqual(generations(cold));
      expect(check.work?.parsedModules).toBeLessThanOrEqual(kind === "ast" ? 0 : 1);
      expect(check.scopeMetadataGenerations.find(entry => entry.module === "prelude")!.generation)
        .toBeGreaterThan(cold.scopeMetadataGenerations.find(entry => entry.module === "prelude")!.generation);
    }
  });

for (const kind of ["ast", "source"] as const) test(
  "assigned own indexer remains unsupported across shifts and reset (" + kind + ")", async () => {
    const p = await project();
    const declaration = 'type View = {[string]: number}\nlocal view: View = {} :: any\nview["key"] = 1\n';
    let inputs: Input[] = [{ module: "prelude", version: 1, source: ordinary + declaration },
      { module: "flow", version: 1, source: 'local observed = view["key"]\nreturn observed\n' }];
    await update(p, kind, 1, inputs, true);
    const cold = ok(await p.check("flow")); expect(cold.diagnostics).toEqual([]);
    for (let version = 1; version <= 3; version++) {
      if (version > 1) {
        inputs[0] = { ...inputs[0]!, version, source: inputs[0]!.source.replace("  return 111", "  local copy" + version + " = 111\n  return 111") };
        await update(p, kind, version, [inputs[0]!]);
      }
      const warm = version === 1 ? cold : ok(await p.check("flow"));
      const actual = await parity(kind, p, warm, inputs);
      expect(actual.scalar.type).toBe("number"); expect(warm.diagnostics).toEqual([]);
      expect(actual.source.supported).toBe(false); expect(actual.source.origin).toBeNull(); expect(actual.source.effective).toBeNull();
      if (version > 1) {
        expect(warm.checkedModules).toBe(2); expect(generations(warm)).not.toEqual(generations(cold));
      }
      expect(ok(await p.check("flow")).checkedModules).toBe(0);
    }
    await p.reset();
    const reset = ok(await p.check("flow")), actual = await parity(kind, p, reset, inputs);
    expect(reset.diagnostics).toEqual([]); expect(actual.source.supported).toBe(false); expect(actual.scalar.type).toBe("number");
  });

for (const kind of ["ast", "source"] as const) test(
  "unassigned indexer borrower retains ORIGINAL facts through two owner shifts (" + kind + ")", async () => {
    const p = await project();
    const declaration = base.replace("{read [", "{read count: number, read [");
    let inputs: Input[] = [{ module: "prelude", version: 1, source: ordinary + declaration },
      { module: "flow", version: 1, source: 'local observed = view["key"]\nreturn observed\n' }];
    await update(p, kind, 1, inputs, true);
    const cold = ok(await p.check("flow")); expect(cold.checkedModules).toBe(2); expect(cold.diagnostics).toEqual([]);
    const initial = await parity(kind, p, cold, inputs);
    expect(initial.scalar.type).toBe("number");
    const shifts: { check: AnalysisCheckResult; current: Awaited<ReturnType<typeof observe>> }[] = [];
    for (let version = 2; version <= 3; version++) {
      inputs[0] = { ...inputs[0]!, version, source: inputs[0]!.source.replace("  return 111",
        "  local copy" + version + ": number = 111\n  return 111") };
      const updated = await update(p, kind, version, [inputs[0]!]);
      expect(updated.work?.changedInputs).toBe(1); expect(updated.work?.decodedInputs).toBe(kind === "ast" ? 1 : 0);
      const check = ok(await p.check("flow")), current = await parity(kind, p, check, inputs);
      expect(check.diagnostics).toEqual([]); expect(current.scalar.type).toBe("number");
      shifts.push({ check, current });
      console.log("Unassigned indexer copied origin", { kind, version, checked: check.checkedModules,
        generations: generations(check), facts: current.source });
    }
    inputs[0] = { ...inputs[0]!, version: 4, source: inputs[0]!.source.replace("[string]: number", "[string]: string") };
    await update(p, kind, 4, [inputs[0]!]);
    const changed = ok(await p.check("flow")), changedFacts = await parity(kind, p, changed, inputs);
    expect(changed.checkedModules).toBe(2); expect(changedFacts.scalar.type).toBe("string");
    expect(changed.diagnostics).toEqual([]); expect(generations(changed)).not.toEqual(generations(cold));
    await p.reset();
    const reset = ok(await p.check("flow")), resetFacts = await parity(kind, p, reset, inputs);
    expect(resetFacts.scalar.type).toBe("string"); expect(reset.diagnostics).toEqual([]);
    expect(initial.source.supported).toBe(true); expect(initial.source.origin?.complete).toBe(true);
    expect(initial.source.effective?.complete).toBe(true);
    for (const observed of [changedFacts, resetFacts]) {
      expect(observed.source.supported).toBe(true); expect(observed.source.origin?.complete).toBe(true);
      expect(observed.source.effective?.complete).toBe(true);
    }
    for (let i = 0; i < shifts.length; i++) {
      const { check, current } = shifts[i]!;
      expect(current.source.supported).toBe(true); expect(current.source.origin).toEqual(initial.source.origin);
      expect(current.source.effective?.complete).toBe(true);
      const before = initial.source.effective!.fields.find(field => field.kind === "table-definition")!;
      const latest = current.source.effective!.fields.find(field => field.kind === "table-definition")!;
      const property = current.source.effective!.fields.find(field => field.kind === "property-type-location" && field.name === "count")!;
      expect(before).toBeDefined(); expect(latest).toBeDefined(); expect(property).toBeDefined();
      expect(latest.range.start.line).toBe(before.range.start.line + i + 1);
      expect(property.range.start.line).toBe(latest.range.start.line);
      expect(latest.sourceGeneration).not.toBe(before.sourceGeneration);
      expect(check.checkedModules).toBe(1); expect(generations(check)).toEqual(generations(cold));
      expect(check.work?.parsedModules).toBeLessThanOrEqual(kind === "ast" ? 0 : 1);
      expect(check.scopeMetadataGenerations.find(entry => entry.module === "prelude")!.generation)
        .toBeGreaterThan(cold.scopeMetadataGenerations.find(entry => entry.module === "prelude")!.generation);
    }
  });
