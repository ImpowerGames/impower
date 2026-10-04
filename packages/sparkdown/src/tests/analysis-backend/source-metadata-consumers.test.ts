import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisCheckResult, AnalysisDocument, AnalysisProject, AnalysisSourceFacts } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const projects: AnalysisProject[] = [];
afterEach(async () => { await Promise.all(projects.splice(0).map(p => p.dispose())); });
async function project() { const p = await createNodeAnalysisBackend().createProject({ mode: "strict" }); projects.push(p); return p; }
function document(module: string, version: number, source: string, kind: "ast" | "source"): AnalysisDocument {
  if (kind === "source") return { module, version, source };
  const unit = luauFileUnit(source, text => compiler.documents.parser.parse(text))!;
  expect(unit.errors).toEqual([]);
  return { module, version, kind, ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function ok(check: AnalysisCheckResult) { expect(check.status, check.message).toBe("ok"); return check; }
function handle(check: AnalysisCheckResult, module: string) { return check.documents.find(entry => entry.module === module)!; }
function generation(check: AnalysisCheckResult, metadata = false) {
  return (metadata ? check.scopeMetadataGenerations : check.scopeGenerations).find(entry => entry.module === "prelude")!.generation;
}
function fields(facts: AnalysisSourceFacts | null) { return facts?.fields.map(({ sourceGeneration, ...field }) => field); }
async function shape(p: AnalysisProject, check: AnalysisCheckResult, module = "caller") {
  const result = await p.queryScopeSourceMetadata(handle(check, module), { namespace: "alias", name: "Shape" });
  expect(result.status, result.message).toBe("ok"); expect(result.supported).toBe(true);
  expect(result.truncated).toBe(false); expect(result.origin?.complete).toBe(true); expect(result.effective?.complete).toBe(true);
  return result;
}

test.each(["\n", "\r\n"].flatMap(newline => (["ast", "source"] as const).map(kind => ({ newline, kind }))))(
  "native duplicate-declaration secondary line and primary range stay current while table borrowers reuse ($kind/$newline)", async ({ newline, kind }) => {
    const p = await project();
    const firstAlias = "  type BodyAlias = number", duplicateAlias = "  type BodyAlias = string";
    let source = ["local function earlier(x: number): number", firstAlias, duplicateAlias, "  return x", "end",
      "type Shape = {count: number}", "local value: Shape = {count = 1}", ""].join(newline);
    const caller = document("caller", 1, "local required: string = value.count\nreturn value\n", kind);
    const links = [{ module: "caller", version: 1, prelude: "prelude" }];
    await p.update({ projectVersion: 1, documents: [document("prelude", 1, source, kind), caller], scopeLinks: links });
    const cold = ok(await p.check("caller")); expect(cold.checkedModules).toBe(2);
    const original = await shape(p, cold);
    const assertDiagnostics = (check: AnalysisCheckResult, shift: number) => {
      expect(check.diagnostics).toHaveLength(2);
      const duplicate = check.diagnostics.find(d => d.module === "prelude" && d.kind === "DuplicateTypeDefinition")!;
      expect(duplicate).toBeDefined(); expect(duplicate.message).toContain("BodyAlias");
      expect(duplicate.message).toContain("previously defined at line " + (2 + shift));
      expect(duplicate.range).toEqual({ start: { line: 2 + shift, column: 2 }, end: { line: 2 + shift, column: duplicateAlias.length } });
      expect(check.diagnostics.find(d => d.module === "caller" && d.kind === "TypeMismatch")).toBeDefined();
    };
    assertDiagnostics(cold, 0); expect(ok(await p.check("caller")).checkedModules).toBe(0);
    let previous = cold;
    for (let version = 2; version <= 3; version++) {
      source = source.replace(firstAlias, "  local copy" + version + ": number = x" + newline + firstAlias);
      const update = await p.update({ projectVersion: version, documents: [document("prelude", version, source, kind)] });
      expect(update.work?.changedInputs).toBe(1); expect(update.work?.decodedInputs).toBe(kind === "ast" ? 1 : 0);
      const warm = ok(await p.check("caller")); assertDiagnostics(warm, version - 1);
      const observed = await shape(p, warm); expect(observed.origin).toEqual(original.origin);
      const fresh = await project();
      await fresh.update({ projectVersion: 1, documents: [document("prelude", version, source, kind), caller], scopeLinks: links });
      const freshCheck = ok(await fresh.check("caller"));
      expect(warm.diagnostics).toEqual(freshCheck.diagnostics);
      expect(fields(observed.effective)).toEqual(fields((await shape(fresh, freshCheck)).effective));
      expect((await p.queryType(handle(warm, "caller"), { line: 0, column: 31 })).type).toBe("number");
      console.log("Native secondary diagnostic source shift", { kind, newline, version, checked: warm.checkedModules,
        diagnostics: warm.diagnostics, semanticGeneration: generation(warm), metadataGeneration: generation(warm, true) });
      expect(warm.checkedModules).toBe(1); expect(warm.work?.parsedModules).toBe(kind === "ast" ? 0 : 1);
      expect(generation(warm)).toBe(generation(cold)); expect(generation(warm, true)).toBeGreaterThan(generation(previous, true));
      previous = warm;
    }
  });

test.each((["ast", "source"] as const).flatMap(kind => [
  { kind, operation: "missing", source: "return value.unavailableKey\n", diagnostic: "UnknownProperty" },
  { kind, operation: "readonly", source: "value.count = 2\nreturn value.count\n", diagnostic: "PropertyAccessViolation" },
]))("native $operation property error message/range survives repeated retained-table shifts ($kind)", async fixture => {
  const p = await project();
  let source = "local function earlier(x: number): number\n  return x\nend\ntype Shape = {read count: number}\nlocal value: Shape = {} :: any\n";
  const caller = document("caller", 1, fixture.source, fixture.kind), links = [{ module: "caller", version: 1, prelude: "prelude" }];
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, source, fixture.kind), caller], scopeLinks: links });
  const cold = ok(await p.check("caller")); expect(cold.checkedModules).toBe(2); expect(cold.diagnostics).toHaveLength(1);
  expect(cold.diagnostics[0]!.module).toBe("caller"); expect(cold.diagnostics[0]!.kind).toBe(fixture.diagnostic);
  const origin = await shape(p, cold, "prelude");
  for (let version = 2; version <= 3; version++) {
    source = source.replace("  return x", "  local copy" + version + ": number = x\n  return x");
    await p.update({ projectVersion: version, documents: [document("prelude", version, source, fixture.kind)] });
    const warm = ok(await p.check("caller")); expect(warm.diagnostics).toEqual(cold.diagnostics);
    const fresh = await project();
    await fresh.update({ projectVersion: 1, documents: [document("prelude", version, source, fixture.kind), caller], scopeLinks: links });
    const freshCheck = ok(await fresh.check("caller")); expect(warm.diagnostics).toEqual(freshCheck.diagnostics);
    if (fixture.operation === "missing") {
      const observed = await shape(p, warm); expect(observed.origin).toEqual(origin.origin);
      expect(fields(observed.effective)).toEqual(fields((await shape(fresh, freshCheck)).effective));
    } else {
      // Assignment is a distinct creation/mutation path, even when it reports
      // an error. Birth-only coordinates must remain explicitly unsupported.
      const unsupported = await p.queryScopeSourceMetadata(handle(warm, "caller"), { namespace: "value", name: "value" });
      expect(unsupported.status).toBe("ok"); expect(unsupported.supported).toBe(false);
      expect(unsupported.origin).toBeNull(); expect(unsupported.effective).toBeNull();
      expect((await p.queryType(handle(warm, "caller"), { line: 1, column: 15 })).type).toBe("number");
    }
    expect(warm.checkedModules).toBe(1); expect(generation(warm)).toBe(generation(cold));
  }
});

test("ordinary require-derived table source remains explicitly unsupported across dependency shifts", async () => {
  const p = await project();
  let target = "local function earlier(x: number): number\n  return x\nend\nreturn {count = 1}\n";
  const own = document("own", 1, 'local foreign = require("target")\nreturn foreign.count\n', "ast");
  await p.update({ projectVersion: 1, documents: [document("target", 1, target, "ast"), own] });
  const cold = ok(await p.check("own")); expect(cold.checkedModules).toBe(2); expect(cold.diagnostics).toEqual([]);
  for (let version = 1; version <= 3; version++) {
    if (version > 1) {
      target = target.replace("  return x", "  local copy" + version + ": number = x\n  return x");
      await p.update({ projectVersion: version, documents: [document("target", version, target, "ast")] });
    }
    const current = version === 1 ? cold : ok(await p.check("own"));
    expect(current.diagnostics).toEqual([]); expect(current.checkedModules).toBe(2);
    const result = await p.queryScopeSourceMetadata(handle(current, "own"), { namespace: "value", name: "foreign" });
    expect(result.status).toBe("ok"); expect(result.supported).toBe(false); expect(result.truncated).toBe(false);
    expect(result.origin).toBeNull(); expect(result.effective).toBeNull();
    expect((await p.queryType(handle(current, "own"), { line: 1, column: 17 })).type).toBe("number");
  }
});
