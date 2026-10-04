import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisCheckResult, AnalysisConfiguration, AnalysisDefinition, AnalysisDocument, AnalysisHandle, AnalysisRange,
  AnalysisModuleResolution, AnalysisProgramEnvironment, AnalysisProject, AnalysisScopeLink, AnalysisUpdate } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const projects = new Set<AnalysisProject>();
afterEach(async () => { await Promise.all([...projects].map(dispose)); });
async function dispose(p: AnalysisProject) { projects.delete(p); await p.dispose(); }
async function project(configuration: AnalysisConfiguration = { mode: "strict" }) {
  const p = await createNodeAnalysisBackend().createProject(configuration); projects.add(p); return p;
}
type Kind = "ast" | "source";
type Source = { module: string; version: number; source: string; malformed?: boolean;
  expectedReaderError?: { message: string; range: AnalysisRange } };
type State = { kind: Kind; sources: Map<string, Source>; links: Map<string, AnalysisScopeLink>;
  definitions: Map<string, AnalysisDefinition>; resolutions: Map<string, AnalysisModuleResolution>;
  configuration: AnalysisConfiguration; environment?: AnalysisProgramEnvironment };
type Fixture = { p: AnalysisProject; state: State; unrelatedBaseline: AnalysisCheckResult["nativeRetention"] };
type Patch = Omit<AnalysisUpdate, "projectVersion" | "documents"> & { documents?: Source[] };
const A = "type Input = number\ntype function make(arg) return arg end\n";
const B = "type function captured(arg) return make(arg) end\ntype Result = captured<Input>\nlocal exported: Result = nil :: any\n";
const FLOW = "local expected: number = exported\nreturn exported\n";
const LINKS = [{ module: "B", prelude: "A", version: 1 }, { module: "flow", prelude: "B", version: 1 }];
function document(kind: Kind, source: Source): AnalysisDocument {
  if (kind === "source") return { module: source.module, version: source.version, source: source.source };
  const unit = luauFileUnit(source.source, text => compiler.documents.parser.parse(text))!;
  if (source.expectedReaderError) {
    expect(unit.errors.map(error => ({ message: error.message, range: {
      start: { line: error.location.begin.line, column: error.location.begin.column },
      end: { line: error.location.end.line, column: error.location.end.column },
    } }))).toEqual([source.expectedReaderError]);
  } else if (source.malformed) expect(unit.errors.length).toBeGreaterThan(0); else expect(unit.errors).toEqual([]);
  return { module: source.module, version: source.version, kind, ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(check: AnalysisCheckResult) { expect(check.status, check.message).toBe("ok"); return check; }
function handle(check: AnalysisCheckResult, module = "flow"): AnalysisHandle {
  const result = check.documents.find(d => d.module === module); expect(result).toBeDefined(); return result!;
}
function generation(check: AnalysisCheckResult, module: string) { return check.scopeGenerations.find(g => g.module === module)?.generation; }
async function query(p: AnalysisProject, check: AnalysisCheckResult, source: string) {
  const lines = source.trimEnd().split("\n"), line = lines.length - 1;
  const column = lines[line]!.indexOf("exported"); expect(column).toBeGreaterThanOrEqual(0);
  const result = await p.queryType(handle(check), { line, column });
  expect(result.status, result.message).toBe("ok");
  return { status: result.status, type: result.type, truncated: result.truncated };
}
function snapshot(state: State, kind = state.kind): AnalysisUpdate {
  return { projectVersion: 1, documents: [...state.sources.values()].map(s => document(kind, s)),
    scopeLinks: [...state.links.values()], definitions: [...state.definitions.values()],
    moduleResolutions: [...state.resolutions.values()], programEnvironment: state.environment };
}
async function fixture(kind: Kind, a = A, additions: Patch = {}): Promise<Fixture> {
  const configuration = additions.configuration ?? { mode: "strict" };
  const state: State = { kind, sources: new Map([
    ["A", { module: "A", version: 1, source: a }], ["B", { module: "B", version: 1, source: B }],
    ["flow", { module: "flow", version: 1, source: FLOW }],
    ["unrelated", { module: "unrelated", version: 1, source: "return 42\n" }],
  ]), links: new Map(LINKS.map(l => [l.module, { ...l }])), definitions: new Map(), resolutions: new Map(), configuration };
  for (const s of additions.documents ?? []) state.sources.set(s.module, s);
  for (const d of additions.definitions ?? []) state.definitions.set(d.name, d);
  for (const l of additions.scopeLinks ?? []) state.links.set(l.module, l);
  for (const r of additions.moduleResolutions ?? []) state.resolutions.set(r.module, r);
  state.environment = additions.programEnvironment;
  const p = await project(configuration); expect((await p.update(snapshot(state))).status).toBe("ok");
  const unrelated = ok(await p.check("unrelated")); expect(unrelated.checkedModules).toBe(1);
  return { p, state, unrelatedBaseline: unrelated.nativeRetention };
}
async function update(f: Fixture, patch: Patch) {
  const result = await f.p.update({ ...patch, projectVersion: f.p.projectVersion + 1,
    documents: patch.documents?.map(s => document(f.state.kind, s)) });
  expect(result.status, result.message).toBe("ok");
  for (const s of patch.documents ?? []) f.state.sources.set(s.module, s);
  for (const module of patch.removeDocuments ?? []) { f.state.sources.delete(module); f.state.links.delete(module); f.state.resolutions.delete(module); }
  for (const l of patch.scopeLinks ?? []) f.state.links.set(l.module, l);
  for (const module of patch.removeScopeLinks ?? []) f.state.links.delete(module);
  for (const d of patch.definitions ?? []) f.state.definitions.set(d.name, d);
  for (const name of patch.removeDefinitions ?? []) f.state.definitions.delete(name);
  for (const r of patch.moduleResolutions ?? []) f.state.resolutions.set(r.module, r);
  if (patch.configuration) f.state.configuration = { ...patch.configuration };
  if (patch.programEnvironment) f.state.environment = patch.programEnvironment;
  return result;
}
function changed(f: Fixture, module: string, source: string, malformed = false): Source {
  return { module, source, version: (f.state.sources.get(module)?.version ?? 0) + 1, malformed };
}
async function parity(f: Fixture, warm: AnalysisCheckResult, label: string) {
  const observed = await query(f.p, warm, f.state.sources.get("flow")!.source);
  // Malformed recovery compares its own input path's exact fresh state.
  // Both raw and AST native parse errors can carry parseErrorOrdinal; valid
  // and explicit expected-reader-error fixtures also compare the other path.
  const kinds = [...f.state.sources.values()].some(s => s.malformed) ? [f.state.kind] : [f.state.kind, f.state.kind === "ast" ? "source" : "ast"] as Kind[];
  for (const kind of kinds) {
    const fresh = await project(f.state.configuration);
    try {
      expect((await fresh.update(snapshot(f.state, kind))).status).toBe("ok");
      const cold = ok(await fresh.check("flow")); expect(warm.diagnostics).toEqual(cold.diagnostics);
      expect(observed).toEqual(await query(fresh, cold, f.state.sources.get("flow")!.source));
    } finally { await dispose(fresh); }
  }
  console.log("Type-function environment state", { kind: f.state.kind, label, checked: warm.checkedModules,
    diagnostics: warm.diagnostics, query: observed, generations: warm.scopeGenerations, retention: warm.nativeRetention });
  return observed;
}
async function checked(f: Fixture, label: string, count: number, type?: string) {
  const warm = ok(await f.p.check("flow")); const observed = await parity(f, warm, label);
  expect(warm.checkedModules).toBe(count); if (type !== undefined) expect(observed.type).toBe(type);
  if (f.state.kind === "ast") expect(warm.work?.parsedModules).toBe(0);
  expect(ok(await f.p.check("flow")).checkedModules).toBe(0);
  return warm;
}
async function unrelated(f: Fixture, count = 0) {
  expect(ok(await f.p.check("unrelated")).checkedModules).toBe(count);
  expect(ok(await f.p.check("unrelated")).checkedModules).toBe(0);
}

test.each(["ast", "source"] as const)("captured aliases, same-result helpers and lexical shadows invalidate transitively (%s)", async kind => {
  const privateHelper = "local function private()\n  type function make(arg) return types.boolean end\n  type Hidden = make<number>\n  local hidden: Hidden = true\n  return hidden\nend\n";
  const f = await fixture(kind, A + privateHelper);
  let previous = await checked(f, "cold visible outer helper", 3, "number"); expect(previous.diagnostics).toEqual([]);
  for (const [label, source, type] of [
    ["alias string", A.replace("Input = number", "Input = string") + privateHelper, "string"],
    ["same-result closure", A.replace("Input = number", "Input = string").replace("return arg end", "local copy = arg return copy end") + privateHelper, "string"],
    ["alias restored", A + privateHelper, "number"],
  ]) {
    const work = await update(f, { documents: [changed(f, "A", source!)] }); expect(work.work?.changedInputs).toBe(1);
    const warm = await checked(f, label!, 3, type!);
    expect(generation(warm, "A")).not.toBe(generation(previous, "A"));
    expect(generation(warm, "B")).not.toBe(generation(previous, "B")); await unrelated(f); previous = warm;
  }
  await update(f, { documents: [changed(f, "B", "type function make(arg) return types.string end\n" + B)] });
  const shadow = await checked(f, "B-local helper wins", 2, "string"); expect(shadow.diagnostics.some(d => d.kind === "TypeMismatch")).toBe(true);
});

test.each(["ast", "source"] as const)("ordinary value-derived input is legal but direct VM upvalues remain illegal (%s)", async kind => {
  const source = "local seed: number = 1\ntype Input = typeof(seed)\ntype function make(arg) return arg end\n";
  const f = await fixture(kind, source); await checked(f, "value-derived number", 3, "number");
  const string = source.replace("seed: number = 1", 'seed: string = "first"');
  await update(f, { documents: [changed(f, "A", string)] }); await checked(f, "value-derived string", 3, "string");
  await update(f, { documents: [changed(f, "A", string.replace('"first"', '"second"'))] });
  await checked(f, "same-type value edit", 3, "string");
  const illegal = "local var\ntype Input = number\ntype function make(arg) var = 1 return arg end\n";
  const expectedReaderError = { message: "Type function cannot reference outer local 'var'",
    range: { start: { line: 2, column: 28 }, end: { line: 2, column: 29 } } };
  await update(f, { documents: [{ ...changed(f, "A", illegal), expectedReaderError }] });
  const bad = await checked(f, "illegal ordinary upvalue", 3);
  const syntax = bad.diagnostics.filter(d => d.module === "A" && d.kind === "SyntaxError"); expect(syntax).toHaveLength(1);
  expect(syntax[0]).toMatchObject({ module: "A", kind: "SyntaxError", code: 1014, parseErrorOrdinal: 0, ...expectedReaderError });
  await update(f, { documents: [changed(f, "A", source)] });
  expect((await checked(f, "legal input restored", 3, "number")).diagnostics).toEqual([]); await unrelated(f);
});

test.each(["ast", "source"] as const)("ordinary require inputs invalidate the lexical helper chain on change/deletion/restore/retarget (%s)", async kind => {
  const a = 'local imported = require("target")\ntype Input = typeof(imported)\ntype function make(arg) return arg end\n';
  const f = await fixture(kind, a, { documents: [{ module: "target", version: 1, source: "return 1\n" },
    { module: "target2", version: 1, source: 'return "alternate"\n' }] });
  await checked(f, "require number", 4, "number");
  await update(f, { documents: [changed(f, "target", 'return "changed"\n')] });
  await checked(f, "require string", 4, "string");
  await update(f, { removeDocuments: ["target"] });
  const missing = await checked(f, "real missing require", 3);
  expect(missing.diagnostics.some(d => d.module === "A" && d.kind === "UnknownRequire")).toBe(true);
  await update(f, { documents: [{ module: "target", version: 3, source: "return 1\n" }] });
  await checked(f, "require restored", 4, "number");
  await update(f, { moduleResolutions: [{ module: "A", version: 1,
    resolutions: [{ specifier: "target", targetModule: "target2", targetSourceUri: "inmemory:///target2.luau" }] }] });
  await checked(f, "explicit require retarget", 4, "string"); await unrelated(f);
});

test.each(["ast", "source"] as const)("host definition changes/removal/restoration rebuild captured type inputs (%s)", async kind => {
  const a = "type Input = typeof(HostValue)\ntype function make(arg) return arg end\n";
  const f = await fixture(kind, a, { definitions: [{ name: "host", version: 1, source: "declare HostValue: number" }] });
  let prior = await checked(f, "host number", 3, "number");
  const changes: { label: string; patch: Patch; type?: string }[] = [
    { label: "host string", patch: { definitions: [{ name: "host", version: 2, source: "declare HostValue: string" }] }, type: "string" },
    { label: "host removed", patch: { removeDefinitions: ["host"] } },
    { label: "host restored", patch: { definitions: [{ name: "host", version: 3, source: "declare HostValue: number" }] }, type: "number" },
  ];
  for (const { label, patch, type } of changes) {
    const old = handle(prior); await update(f, patch);
    await expect(f.p.queryType(old, { line: 1, column: 7 })).rejects.toThrow("Stale");
    prior = await checked(f, label, 3, type);
    if (label === "host removed") expect(prior.diagnostics.some(d => d.kind === "UnknownSymbol" && d.unknownSymbol?.name === "HostValue")).toBe(true);
    await unrelated(f, 1);
  }
});

test.each(["ast", "source"] as const)("program environment names invalidate captures but content-identical versions preserve native cache (%s)", async kind => {
  const a = "type Input = ProgramAlias\nlocal ordinary = ProgramValue\ntype function make(arg) return arg end\n";
  const present = { version: 1, values: ["ProgramValue"], types: ["ProgramAlias"] };
  const f = await fixture(kind, a, { programEnvironment: present });
  const cold = await checked(f, "program any aliases", 3, "any"); expect(cold.diagnostics).toEqual([]);
  await update(f, { programEnvironment: { ...present, version: 2 } });
  await checked(f, "new version same program names", 0, "any"); await unrelated(f);
  await update(f, { programEnvironment: { version: 3, values: [], types: [] } });
  const missing = await checked(f, "program names removed", 3);
  for (const name of ["ProgramAlias", "ProgramValue"]) expect(missing.diagnostics.some(d => d.kind === "UnknownSymbol" && d.unknownSymbol?.name === name)).toBe(true);
  await unrelated(f, 1);
  await update(f, { programEnvironment: { ...present, version: 4 } });
  expect((await checked(f, "program names restored", 3, "any")).diagnostics).toEqual([]); await unrelated(f, 1);
});

test.each(["ast", "source"] as const)("configuration rebuild and authored mode precedence preserve official nocheck query behavior (%s)", async kind => {
  const f = await fixture(kind, A.replace("Input = number", "Input = string"));
  const cold = await checked(f, "strict mismatch", 3, "string"); expect(cold.diagnostics.some(d => d.kind === "TypeMismatch")).toBe(true);
  await update(f, { configuration: { mode: "nocheck" } });
  const unchecked = await checked(f, "nocheck exact fresh query parity", 3); expect(unchecked.diagnostics).toEqual([]); await unrelated(f, 1);
  // No type is promised in nocheck: query() preserves the official null/any/
  // retained-map outcome and parity() compares it without a forced strict check.
  await update(f, { documents: [changed(f, "flow", '--!strict\nlocal authoredMismatch: number = "wrong"\n' + FLOW)] });
  const authored = await checked(f, "authored strict overrides nocheck", 1);
  expect(authored.diagnostics.some(d => d.kind === "TypeMismatch")).toBe(true);
  await update(f, { configuration: { mode: "strict" } });
  await checked(f, "strict rebuilt", 3, "string"); await unrelated(f, 1);
  await update(f, { configuration: { mode: "strict", typeFunctionHeapBytes: 16 * 1024 * 1024 } });
  await checked(f, "explicit generous VM budget", 3, "string"); await unrelated(f, 1);
  await update(f, { configuration: { mode: "strict", typeFunctionHeapBytes: 16 * 1024 * 1024 } });
  // The current adapter always hydrates when configuration is supplied,
  // even when content is identical. Ordinary edits must not resend it.
  await checked(f, "identical supplied configuration still rebuilds", 3, "string"); await unrelated(f, 1);
});

test.each(["ast", "source"] as const)("atomic lexical unlink/delete/restore and dangling-link failure retain exact owner lifetimes (%s)", async kind => {
  const f = await fixture(kind, A, { documents: [{ module: "A2", version: 1, source: A.replace("Input = number", "Input = string") }] });
  await checked(f, "original owner", 3, "number");
  await update(f, { scopeLinks: [{ module: "B", version: 2, prelude: "A2" }] });
  await checked(f, "alternate lexical owner", 3, "string");
  await update(f, { scopeLinks: [{ module: "B", version: 3, prelude: "A" }] });
  await checked(f, "original cached owner restored", 2, "number");
  await update(f, { removeDocuments: ["A"], removeScopeLinks: ["B"] });
  const unlinked = await checked(f, "valid atomic unlink plus delete", 2);
  expect(unlinked.diagnostics.length).toBeGreaterThan(0);
  await update(f, { documents: [{ module: "A", version: 2, source: A }], scopeLinks: [{ module: "B", version: 4, prelude: "A" }] });
  const restored = await checked(f, "valid atomic restore plus link", 3, "number"); expect(restored.diagnostics).toEqual([]);
  // Deliberately invalid input, distinct from valid atomic document deletion:
  // this leaves B's explicit lexical link targeting a missing A.
  await update(f, { removeDocuments: ["A"] });
  const validUnrelated = ok(await f.p.check("unrelated")); expect(validUnrelated.checkedModules).toBe(0);
  const sameVersionHandle = handle(validUnrelated, "unrelated");
  expect((await f.p.queryType(sameVersionHandle, { line: 0, column: 7 })).type).not.toBeNull();
  const failed = await f.p.check("flow"); expect(failed.status).toBe("error");
  expect(failed.message).toContain("Missing linked prelude module: A"); expect(failed.documents).toEqual([]);
  // This handle was valid in the SAME project version before the failure.
  await expect(f.p.queryType(sameVersionHandle, { line: 0, column: 7 })).rejects.toThrow("Stale");
  expect((await f.p.reset()).status).toBe("ok");
  await update(f, { documents: [{ module: "A", version: 3, source: A }] });
  expect((await checked(f, "invalid dangling link recovered", 3, "number")).diagnostics).toEqual([]);
  // Reset rehydrates unrelated too: establish its actual live baseline before
  // removal, then compare the owner counts from that same retained-only state.
  await unrelated(f, 1);
  await update(f, { removeDocuments: ["flow", "B", "A", "A2"] });
  const retained = ok(await f.p.check("unrelated")); expect(retained.checkedModules).toBe(0);
  expect(retained.nativeRetention).toEqual({ ...f.unrelatedBaseline, installedInputs: 1, retainedAstInputs: kind === "ast" ? 1 : 0 });
});

test.each(["ast", "source"] as const)("unchanged environments reuse while malformed/fixed/reset/independent sessions remain isolated (%s)", async kind => {
  const f = await fixture(kind); await checked(f, "cold chain", 3, "number");
  await update(f, {}); await checked(f, "empty version update", 0, "number");
  await update(f, { documents: [changed(f, "flow", 'local bodyWarning: number = "wrong"\n' + FLOW)] });
  const body = await checked(f, "flow body edit", 1, "number"); expect(body.diagnostics).toHaveLength(1);
  await update(f, { documents: [changed(f, "A", A.replace("return arg end", "local same = arg return same end"))] });
  await checked(f, "same printed result changed TF environment", 3, "number");
  await update(f, { documents: [changed(f, "A", "type Input = number\ntype function make(arg) return types.singleton( end\n", true)] });
  const malformed = await checked(f, "malformed predecessor normal diagnostic", 3);
  expect(malformed.diagnostics.some(d => d.module === "A" && d.kind === "SyntaxError")).toBe(true);
  await update(f, { documents: [changed(f, "A", A + 'local warning: number = "wrong"\n')] });
  const ordinary = await checked(f, "ordinary predecessor type error", 3, "number");
  expect(ordinary.diagnostics.some(d => d.module === "A" && d.kind === "TypeMismatch")).toBe(true);
  await update(f, { documents: [changed(f, "A", A)] });
  const fixed = await checked(f, "fixed predecessor", 3, "number");
  const independent = await fixture(kind, A.replace("Input = number", "Input = string"));
  const other = await checked(independent, "independent captured string", 3, "string");
  await expect(f.p.queryType(handle(other), { line: 1, column: 7 })).rejects.toThrow("Stale");
  const beforeReset = handle(fixed); expect((await f.p.reset()).status).toBe("ok");
  await expect(f.p.queryType(beforeReset, { line: 2, column: 7 })).rejects.toThrow("Stale");
  await checked(f, "reset latest input environment", 3, "number");
  await checked(independent, "independent session stayed cached", 0, "string");
});
