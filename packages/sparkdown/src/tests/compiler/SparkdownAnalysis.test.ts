import "../../inkjs/engine/Container";
import { afterEach, expect, test, vi } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { AstStatLocalFunction, AstTypeReference } from "../../compiler/typecheck/Ast";
import { SparkdownAnalysis, type SparkdownAnalysisDocument } from "../../compiler/typecheck/SparkdownAnalysis";
import { luauFileUnit, sparkdownUnits } from "../../compiler/typecheck/LuauDocumentChecker";

const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
const facades: SparkdownAnalysis[] = [];
async function facade() { const f = new SparkdownAnalysis(await createNodeAnalysisBackend().createProject({ mode: "strict" })); facades.push(f); return f; }
afterEach(async () => { await Promise.all(facades.splice(0).map(f => f.dispose())); });
function read(uri: string, version: number, text: string, mode: "strict" | "nocheck" = "strict"): SparkdownAnalysisDocument {
  const tree = compiler.documents.parser.parse(text);
  const units = uri.endsWith(".luau") ? [luauFileUnit(text, wrapped => compiler.documents.parser.parse(wrapped))!] : (() => {
    const units = sparkdownUnits(tree, text); return [units.prelude, ...units.flows];
  })();
  return { uri, version, text, tree, units, mode };
}

test("real flow parameter query owns the shared header and story shifts reuse every AST/check", async () => {
  const f = await facade(), text = "scene alpha(n: number)\r\n  local value: number = n\r\n  😀 Narrative.\r\nend\r\n";
  const cold = await f.analyze({ documents: [read("main.sd", 1, text)], programNames: ["alpha"] });
  expect(cold.outcome.status, cold.outcome.message).toBe("ok"); expect(cold.diagnostics.get("main.sd")).toEqual([]);
  expect(cold.stats).toEqual({ encoded: 2, reused: 0, checked: 2 });
  const map = cold.documents[0]!;
  expect((await f.queryType(map, 0, 12))?.type).toBe("number");
  expect(await f.queryType(map, 0, 2)).toBeUndefined(); expect(await f.queryType(map, 2, 5)).toBeUndefined();
  const shifted = await f.analyze({ documents: [read("main.sd", 2, "More story.\r\n" + text)], programNames: ["alpha"] });
  expect(shifted.stats).toEqual({ encoded: 0, reused: 2, checked: 0 });
  await expect(f.queryType(map, 0, 12)).rejects.toThrow("Stale");
  expect((await f.queryType(shifted.documents[0]!, 1, 12))?.type).toBe("number");
  await f.reset();
  const reset = await f.analyze({ documents: [read("main.sd", 2, "More story.\r\n" + text)], programNames: ["alpha"] });
  expect(reset.stats.encoded).toBe(0); expect((await f.queryType(reset.documents[0]!, 1, 12))?.type).toBe("number");
});

test("queued converter mutation cannot change checked parameter types or the captured map", async () => {
  const f = await facade(), text = "scene alpha(n: number)\n  local value: number = n\nend\n";
  const doc = read("main.sd", 1, text);
  const pending = f.analyze({ documents: [doc], programNames: ["alpha"] });
  const localFunction = doc.units[1]!.root.body[0] as AstStatLocalFunction;
  expect(localFunction.kind).toBe("StatLocalFunction");
  (localFunction.func.args[0]!.annotation as AstTypeReference).name = "string";
  doc.units[1]!.lines[0] = 99;
  const result = await pending;
  expect(result.outcome.status, result.outcome.message).toBe("ok"); expect(result.diagnostics.get("main.sd")).toEqual([]);
  expect((await f.queryType(result.documents[0]!, 0, 12))?.type).toBe("number");
  const next = await f.analyze({ documents: [read("main.sd", 2, text.replace("n: number", "n: string"))], programNames: ["alpha"] });
  expect(next.diagnostics.get("main.sd")?.some(d => d.code === "TypeMismatch")).toBe(true);
  expect((await f.queryType(next.documents[0]!, 0, 12))?.type).toBe("string");
});

test("normal diagnostic kinds and unknown globals are native facts while syntax publication stays converter-owned", async () => {
  const f = await facade();
  const checked = await f.analyze({ documents: [read("main.luau", 1, "local n: MissingType = MissingGlobal\nreturn n\n")], programNames: [] });
  const diagnostics = checked.diagnostics.get("main.luau")!;
  expect(diagnostics.some(d => d.code === "UnknownSymbol" && d.unknownGlobal === "MissingGlobal")).toBe(true);
  expect(diagnostics.some(d => d.code === "UnknownSymbol" && !d.unknownGlobal && d.message.includes("MissingType"))).toBe(true);
  const malformed = read("main.luau", 2, "local n: = 1\nreturn n\n", "nocheck");
  expect(malformed.units[0]!.errors.some(e => e.malformed)).toBe(true);
  const syntax = await f.analyze({ documents: [malformed], programNames: [] });
  expect(syntax.outcome.status, syntax.outcome.message).toBe("ok");
  expect(syntax.diagnostics.get("main.luau")?.some(d => d.code === "SyntaxError" && d.syntax)).toBe(true);
  expect(syntax.diagnostics.get("main.luau")?.every(d => d.syntax)).toBe(true);
});

test("host-selected file return modules preserve missing target paths and fresh/warm require results", async () => {
  const f = await facade(), main = read("main.luau", 1, 'local value: number = require("./dep")\nreturn value\n');
  const dep = read("dep.luau", 1, "return 42\n");
  const resolutions = [{ contextUri: "main.luau", contextUnit: 0, specifier: "./dep", targetUri: "dep.luau", targetUnit: 0 }];
  const cold = await f.analyze({ documents: [main, dep], programNames: [], resolutions });
  expect(cold.diagnostics.get("main.luau")).toEqual([]);
  const deleted = await f.analyze({ documents: [main], programNames: [], resolutions });
  expect(deleted.diagnostics.get("main.luau")?.some(d => d.code === "UnknownRequire" && d.message.includes("dep.luau"))).toBe(true);
  expect([...deleted.diagnostics.values()].flat().some(d => d.message.includes("sparkdown-unit:") || d.message.includes("sparkdown-missing:"))).toBe(false);
  const fresh = await facade();
  expect((await fresh.analyze({ documents: [main], programNames: [], resolutions })).diagnostics).toEqual(deleted.diagnostics);
  const restored = await f.analyze({ documents: [main, dep], programNames: [], resolutions });
  expect(restored.diagnostics.get("main.luau")).toEqual([]);
  expect((await f.queryType(restored.documents[0]!, 1, 8))?.type).toBe("number");
});

test.each(["changed", "omitted"])("real native failed check/reset/%s retry removes unpublished ASTs", async retry => {
  const backend = await createNodeAnalysisBackend().createProject({ mode: "strict" });
  const updates = vi.spyOn(backend, "update"), f = new SparkdownAnalysis(backend); facades.push(f);
  // Official user error text can imitate an allocation failure; the backend
  // explicitly treats this as an ambiguous native error requiring reset.
  const bad = 'type function explode() error("not enough memory") end\ntype Result = explode<>\nlocal value: Result = nil\nreturn value\n';
  const failed = await f.analyze({ documents: [read("a.luau", 1, bad)], programNames: [] });
  expect(failed.outcome.status).toBe("error"); expect(failed.documents).toEqual([]);
  const unpublished = updates.mock.calls[0]![0].documents![0]!.module;
  expect((await f.reset()).status).toBe("ok");
  const good = await f.analyze({ documents: [read(retry === "changed" ? "a.luau" : "b.luau", 2, "return 42\n")], programNames: [] });
  expect(good.outcome.status, good.outcome.message).toBe("ok");
  expect(good.diagnostics.values().next().value).toEqual([]);
  // Assert native cache cleanup before adapter-side missing-root rejection.
  expect(good.check!.nativeRetention).toEqual({ installedInputs: 1, retainedAstInputs: 1, snapshots: 0, flowOwners: 0, leases: 0 });
  expect(updates.mock.calls.at(-1)![0].removeDocuments).toContain(unpublished);
  const missing = await backend.check(unpublished);
  expect(missing.status).toBe("error"); expect(missing.message).toBe("Missing root module");
  expect((await f.queryType(good.documents[0]!, 0, 8))?.type).toBe("number");
});
