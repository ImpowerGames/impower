import "../../inkjs/engine/Container";
import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisDocument, AnalysisProject, AnalysisSourceFacts, AnalysisSourceQueryResult } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";
import { encodeSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisAst";
import { packSparkdownAnalysisAst } from "../../compiler/typecheck/SparkdownAnalysisCodec";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const projects: AnalysisProject[] = [];
afterEach(async () => { await Promise.all(projects.splice(0).map(project => project.dispose())); });
async function project() { const result = await createNodeAnalysisBackend().createProject({ mode: "strict" }); projects.push(result); return result; }
function document(module: string, version: number, source: string, kind: "ast" | "source"): AnalysisDocument {
  if (kind === "source") return { module, version, source };
  const unit = luauFileUnit(source, wrapped => compiler.documents.parser.parse(wrapped))!;
  expect(unit.errors).toEqual([]);
  return { module, version, kind, ast: packSparkdownAnalysisAst(encodeSparkdownAnalysisAst(unit)) };
}
function fields(facts: AnalysisSourceFacts | null) {
  expect(facts?.complete).toBe(true);
  return facts!.fields.map(({ sourceGeneration, ...field }) => field);
}
function ok(result: AnalysisSourceQueryResult) { expect(result.status, result.message).toBe("ok"); expect(result.supported).toBe(true); expect(result.truncated).toBe(false); return result; }

test.each(["\n", "\r\n"])("actual callable facts use target UTF16 coordinates for raw and AST inputs (%j)", async newline => {
  const line = 'local marker = "😀"; local function later(label: string, ...: number): string';
  const source = [line, "  return label", "end", "return later", ""].join(newline);
  const results: AnalysisSourceQueryResult[] = [];
  for (const kind of ["source", "ast"] as const) {
    const p = await project(); await p.update({ projectVersion: 1, documents: [document("target", 1, source, kind)] });
    const checked = await p.check("target"); expect(checked.status, checked.message).toBe("ok"); expect(checked.diagnostics).toEqual([]);
    const result = ok(await p.querySourceMetadata(checked.documents[0]!, { line: 3, column: 9 }));
    expect(result.effective).toEqual(result.origin); expect(Object.isFrozen(result.origin?.fields)).toBe(true);
    const range = (start: number, end: number) => ({ start: { line: 0, column: start }, end: { line: 0, column: end } });
    expect(fields(result.origin)).toEqual([
      { kind: "definition", name: "", index: 0, module: "target", range: { start: { line: 0, column: line.indexOf("local function") }, end: { line: 2, column: 3 } } },
      { kind: "name", name: "", index: 0, module: "target", range: range(line.indexOf("later"), line.indexOf("later") + 5) },
      { kind: "vararg", name: "", index: 0, module: "target", range: range(line.indexOf("..."), line.indexOf("...") + 3) },
      { kind: "parameter", name: "label", index: 0, module: "target", range: range(line.indexOf("label"), line.indexOf("label") + 5) },
    ]);
    const bounded = await p.querySourceMetadata(checked.documents[0]!, { line: 3, column: 9 }, 1);
    expect(bounded.origin?.fields).toHaveLength(1); expect(bounded.truncated).toBe(true); expect(bounded.origin?.complete).toBe(false);
    expect((await p.querySourceMetadata(checked.documents[0]!, { line: 1, column: 10 })).origin).toBeNull();
    results.push(result);
  }
  expect(fields(results[0]!.origin)).toEqual(fields(results[1]!.origin));
});

test.each(["|", "&"])("a callable %s explicitly reports unsupported scalar source selection", async operator => {
  const p = await project();
  const source = `local f: ((number) -> number) ${operator} ((string) -> string) = nil :: any\nreturn f\n`;
  await p.update({ projectVersion: 1, documents: [document("multiple", 1, source, "source")] });
  const checked = await p.check("multiple"); expect(checked.status, checked.message).toBe("ok"); expect(checked.diagnostics).toEqual([]);
  const result = await p.querySourceMetadata(checked.documents[0]!, { line: 1, column: 7 }, 1);
  expect(result.status, result.message).toBe("ok"); expect(result.supported).toBe(false);
  expect(result.origin).toBeNull(); expect(result.effective).toBeNull(); expect(result.truncated).toBe(false);
  expect((await p.queryType(checked.documents[0]!, { line: 1, column: 7 })).type).toContain(operator);
});

test("borrowed and instantiated callable facts retain the exact foreign origin and lexical shadowing", async () => {
  const p = await project();
  const prelude = "local function factory<T>(value: T)\n  return function(input: T): T return input end\nend\n";
  const caller = "local f = factory(1)\nlocal n = f(2)\ndo\n  local function f(other: string): string return other end\n  local s = f(\"x\")\nend\n";
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, prelude, "ast"), document("caller", 1, caller, "source")],
    scopeLinks: [{ module: "caller", version: 1, prelude: "prelude" }] });
  const checked = await p.check("caller"); expect(checked.status, checked.message).toBe("ok"); expect(checked.diagnostics).toEqual([]);
  const handle = checked.documents.find(document => document.module === "caller")!;
  const derived = ok(await p.querySourceMetadata(handle, { line: 1, column: 10 }));
  expect(fields(derived.origin).every(field => field.module === "prelude")).toBe(true);
  expect(fields(derived.origin)).toContainEqual({ kind: "parameter", name: "input", index: 0, module: "prelude",
    range: { start: { line: 1, column: 18 }, end: { line: 1, column: 23 } } });
  expect(fields(derived.origin).filter(field => field.kind === "name")).toEqual([]); // Anonymous definition has no invented name position.
  const shadow = ok(await p.querySourceMetadata(handle, { line: 4, column: 12 }));
  expect(fields(shadow.origin).every(field => field.module === "caller")).toBe(true);
  expect(fields(shadow.origin).find(field => field.kind === "parameter")?.name).toBe("other");
  expect((await p.queryType(handle, { line: 1, column: 13 })).type).toBe("number");
});

test("source observers reject cross-instance, stale and reset handles and preserve snapshot isolation", async () => {
  const a = await project(), b = await project(), source = "local function f(value: number): number return value end\nreturn f\n";
  const input = { projectVersion: 1, documents: [document("same", 1, source, "source")] };
  await a.update(input); await b.update(input);
  const first = await a.check("same"), second = await b.check("same");
  const handle = first.documents[0]!, position = { line: 1, column: 7 };
  expect(ok(await a.querySourceMetadata(handle, position)).origin?.fields.length).toBeGreaterThan(0);
  await expect(b.querySourceMetadata(handle, position)).rejects.toThrow("Stale");
  const pending = a.querySourceMetadata(handle, position); position.line = 999; handle.module = "mutated";
  expect(ok(await pending).origin?.fields.length).toBeGreaterThan(0);
  await expect(a.querySourceMetadata({ ...first.documents[0]!, module: "same" }, { line: 1, column: 7 }, 129)).rejects.toThrow("bounds");
  const old = second.documents[0]!; await b.reset();
  await expect(b.querySourceMetadata(old, { line: 1, column: 7 })).rejects.toThrow("Stale");
  const after = await b.check("same");
  expect(fields(ok(await b.querySourceMetadata(after.documents[0]!, { line: 1, column: 7 })).origin))
    .toEqual(fields(ok(await a.querySourceMetadata({ ...first.documents[0]!, module: "same" }, { line: 1, column: 7 })).origin));
});

test("same native anchor from a retained lexical graph and a newer require graph is explicitly ambiguous", async () => {
  const p = await project();
  const prelude = "local function f(value: number): number\n  return value + 0\nend\nreturn f\n";
  const caller = 'local inherited = f\nlocal required = require("prelude")\nreturn inherited\n';
  await p.update({ projectVersion: 1, documents: [document("prelude", 1, prelude, "source"), document("caller", 1, caller, "source")],
    scopeLinks: [{ module: "caller", version: 1, prelude: "prelude" }] });
  const cold = await p.check("caller"); expect(cold.status, cold.message).toBe("ok"); expect(cold.diagnostics).toEqual([]);
  const coldCaller = ok(await p.querySourceMetadata(cold.documents.find(handle => handle.module === "caller")!, { line: 2, column: 8 }));
  const oldOrigin = coldCaller.origin!;
  await p.update({ projectVersion: 2, documents: [document("prelude", 2, prelude.replace("+ 0", "+ 1"), "source")] });
  const warm = await p.check("caller"); expect(warm.status, warm.message).toBe("ok"); expect(warm.diagnostics).toEqual([]);
  // Equal exported shape retains the old lexical snapshot, while ordinary
  // require observes the newly checked module. The coordinate anchor is the
  // same, but the two real originating input revisions are different.
  expect(warm.scopeGenerations).toEqual(cold.scopeGenerations);
  const newOrigin = ok(await p.querySourceMetadata(warm.documents.find(handle => handle.module === "prelude")!, { line: 3, column: 7 })).origin!;
  expect(fields(newOrigin)).toEqual(fields(oldOrigin));
  expect(newOrigin.fields[0]!.sourceGeneration).not.toBe(oldOrigin.fields[0]!.sourceGeneration);
  const handle = warm.documents.find(handle => handle.module === "caller")!;
  const ambiguous = await p.querySourceMetadata(handle, { line: 2, column: 8 });
  expect(ambiguous.status, ambiguous.message).toBe("ok"); expect(ambiguous.supported).toBe(false);
  expect(ambiguous.origin).toBeNull(); expect(ambiguous.effective).toBeNull(); expect(ambiguous.truncated).toBe(false);
  expect((await p.queryType(handle, { line: 2, column: 8 })).type).toContain("number");
});
