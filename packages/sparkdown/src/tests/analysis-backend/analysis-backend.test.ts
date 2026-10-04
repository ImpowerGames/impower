import { afterEach, expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";
import type { AnalysisProject } from "../../analysis-backend/contract";

const projects: AnalysisProject[] = [];
async function project(mode: "strict" | "nonstrict" | "nocheck" = "strict", heap?: number) {
  const p = await createNodeAnalysisBackend().createProject({ mode, typeFunctionHeapBytes: heap });
  projects.push(p);
  return p;
}
afterEach(async () => { await Promise.all(projects.splice(0).map(p => p.dispose())); });
async function source(p: AnalysisProject, text: string) {
  expect((await p.update({ projectVersion: p.projectVersion + 1, documents: [{ module: "main.luau", version: p.projectVersion + 1, source: text }] })).status).toBe("ok");
  return p.check("main.luau");
}

test("public adapter uses official diagnostics and inferred types", async () => {
  const p = await project();
  const r = await source(p, 'local value = 42\nlocal bad: string = value\nreturn value');
  expect(r.status).toBe("ok");
  expect(r.diagnostics.length).toBe(1);
  expect(r.diagnostics[0]!).toMatchObject({ module: "main.luau", documentVersion: 1, code: expect.any(Number), range: { start: { line: 1, column: 20 } } });
  expect(r.diagnostics[0]!.message).toContain("number");
  const q = await p.queryType(r.documents[0]!, { line: 2, column: 8 });
  expect(q.status).toBe("ok");
  expect(q.type).toBe("number");
  expect(r.timings.checkingMs).toBeGreaterThan(0);
  expect(r.timings.totalMs).toBeGreaterThanOrEqual(r.timings.checkingMs);
});

test("definitions, imports, changed dependencies and no-op caches are persistent", async () => {
  const p = await project();
  expect((await p.update({ projectVersion: 1, definitions: [{ name: "host", version: 1, source: "declare hostNumber: number" }], documents: [
    { module: "dep.luau", version: 1, source: "return hostNumber" },
    { module: "main.luau", version: 1, source: 'local x: number = require("dep.luau")\nreturn x' },
  ] })).status).toBe("ok");
  const first = await p.check("main.luau");
  expect(first.diagnostics).toEqual([]);
  expect(first.checkedModules).toBe(2);
  expect(first.replacementDocuments.map(d => d.module)).toEqual(["dep.luau", "main.luau"]);
  expect((await p.check("main.luau")).checkedModules).toBe(0);
  expect((await p.update({ projectVersion: 2, documents: [{ module: "dep.luau", version: 2, source: "return hostNumber" }] })).status).toBe("ok");
  expect((await p.check("main.luau")).checkedModules).toBe(0);
  await p.update({ projectVersion: 3, documents: [{ module: "dep.luau", version: 3, source: 'return "changed"' }] });
  const changed = await p.check("main.luau");
  expect(changed.checkedModules).toBe(2);
  expect(changed.diagnostics.length).toBe(1);
  const fresh = await project();
  await fresh.update({ projectVersion: 3, documents: [{ module: "dep.luau", version: 3, source: 'return "changed"' }, { module: "main.luau", version: 1, source: 'local x: number = require("dep.luau")\nreturn x' }] });
  expect(changed.diagnostics).toEqual((await fresh.check("main.luau")).diagnostics);
  await p.update({ projectVersion: 4, definitions: [{ name: "host", version: 2, source: "declare hostNumber: string" }], documents: [{ module: "dep.luau", version: 4, source: "return hostNumber" }] });
  expect((await p.check("main.luau")).diagnostics.length).toBe(1);
  await p.update({ projectVersion: 5, removeDocuments: ["dep.luau"] });
  expect((await p.check("main.luau")).diagnostics.some(d => /module|require/i.test(d.message))).toBe(true);
});

test("all three modes, configuration changes, session identity and stale handles", async () => {
  const strict = await project(), loose = await project("nonstrict"), unchecked = await project("nocheck");
  const text = 'local function f(x) return x.missing end\nlocal bad: string = 1\nreturn f';
  const results = await Promise.all([strict, loose, unchecked].map(p => source(p, text)));
  expect(results[0]!.diagnostics.length).toBeGreaterThan(0);
  expect(results[1]!.status).toBe("ok");
  expect(results[2]!.diagnostics).toEqual([]);
  await expect(loose.queryType(results[0]!.documents[0]!, { line: 0, column: 15 })).rejects.toThrow("Stale");
  await strict.update({ projectVersion: 2, configuration: { mode: "nocheck" } });
  expect((await strict.check("main.luau")).diagnostics).toEqual([]);
  await expect(strict.queryType(results[0]!.documents[0]!, { line: 0, column: 15 })).rejects.toThrow("Stale");
  const handle = (await strict.check("main.luau")).documents[0]!;
  expect((await strict.reset()).status).toBe("ok");
  await expect(strict.queryType(handle, { line: 0, column: 15 })).rejects.toThrow("Stale");
});

test("real type functions use official types library, captured aliases and transitive calls", async () => {
  const p = await project();
  const r = await source(p, `type Captured = number
type function Wrap(t)
  return types.unionof(t, types.singleton(nil))
end
type function Optional(t)
  local result = types.copy(t)
  for key, property in t:properties() do
    result:setproperty(key, Wrap(assert(property.read or property.write)))
  end
  result:setindexer(types.string, types.boolean)
  return result
end
type function Capture()
  return Captured
end
type function Operations(t)
  assert(t:is("table"))
  local s = types.singleton("hello")
  assert(s:value() == "hello")
  local n = types.negationof(types.negationof(types.number))
  local f = types.newfunction({head = {types.number}}, {head = {types.string}})
  local out = types.newtable({[types.singleton("item")] = n})
  out:setproperty(types.singleton("call"), f)
  return out
end
local original: {x: number} = {x = 1}
local optional: Optional<{x: number}> = {x = nil}
local captured: Capture<> = 1
local untouched: number = original.x
local ops: Operations<{}>
return optional, captured, untouched, ops`);
  expect(r.status).toBe("ok");
  expect(r.diagnostics.map(d => d.message)).toEqual([]);
  expect((await p.queryType(r.documents.find(d => d.module === "main.luau")!, { line: 28, column: 28 })).type).toContain("number");
});

test("invalid return and runtime errors are real checker diagnostics", async () => {
  const p = await project();
  const invalid = await source(p, "type function Invalid() return 42 end\nlocal x: Invalid<>\nreturn x");
  expect(invalid.diagnostics.some(d => /type|return/i.test(d.message))).toBe(true);
  const runtime = await source(p, 'type function Fail() error("intentional-runtime-error") end\nlocal x: Fail<>\nreturn x');
  expect(runtime.diagnostics.some(d => d.message.includes("intentional-runtime-error"))).toBe(true);
});

test("infinite native work is interrupted and reset recovers committed inputs", async () => {
  const p = await project();
  await source(p, "return 1");
  await p.update({ projectVersion: 2, documents: [{ module: "main.luau", version: 2, source: "type function Infinite() while true do end return types.number end\nlocal x: Infinite<>\nreturn x" }] });
  const start = performance.now();
  const r = await p.check("main.luau", { deadlineMs: 100 });
  expect(r.status).toBe("deadline");
  expect(performance.now() - start).toBeLessThan(1500);
  expect((await p.check("main.luau")).status).toBe("requires-reset");
  expect((await p.reset()).status).toBe("ok");
  await p.update({ projectVersion: p.projectVersion + 1, documents: [{ module: "main.luau", version: 3, source: "return 1" }] });
  expect((await p.check("main.luau")).diagnostics).toEqual([]);
});

test("cancellation terminates a busy worker and project deletion frees it", async () => {
  const p = await project();
  await p.update({ projectVersion: 1, documents: [{ module: "main.luau", version: 1, source: "type function Infinite() while true do end return types.number end\nlocal x: Infinite<>\nreturn x" }] });
  const controller = new AbortController();
  const checking = p.check("main.luau", { deadlineMs: 5000, signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  expect((await checking).status).toBe("cancelled");
  expect((await p.reset()).status).toBe("ok");
  expect((await p.check("main.luau", { signal: AbortSignal.abort() })).status).toBe("cancelled");
  expect((await p.check("main.luau")).status).toBe("requires-reset");
  expect((await p.reset()).status).toBe("ok");
  await p.dispose();
  expect((await p.check("main.luau")).status).toBe("error");
});

test("cyclic imports terminate with structured results", async () => {
  const p = await project();
  await p.update({ projectVersion: 1, documents: [
    { module: "a.luau", version: 1, source: 'local b = require("b.luau")\nreturn {a = 1, b = b}' },
    { module: "b.luau", version: 1, source: 'local a = require("a.luau")\nreturn {b = 1, a = a}' },
  ] });
  const r = await p.check("a.luau");
  expect(r.status).toBe("ok");
  expect(r.checkedModules).toBe(2);
  expect(r.diagnostics.every(d => Number.isInteger(d.code))).toBe(true);
  expect((await p.check("a.luau")).diagnostics).toEqual(r.diagnostics);
  await p.update({ projectVersion: 2, documents: [{ module: "b.luau", version: 2, source: 'local a = require("a.luau")\nlocal invalid: string = 42\nreturn {b = 1, a = a}' }] });
  const invalid = await p.check("a.luau");
  expect(invalid.status).toBe("ok");
  expect(invalid.diagnostics.some(d => d.module === "b.luau" && d.message.includes("number"))).toBe(true);
});

test("official subtype, printing, graph operations and mutable input isolation execute", async () => {
  const p = await project();
  const text = `type Original = {x: number}
type function Change(t)
  assert(types.number:issubtypeof(types.unknown))
  assert(tostring(types.number) == "number")
  assert(#types.unionof(types.number, types.string):components() == 2)
  assert(types.intersectionof(types.unknown, types.number):is("number"))
  assert(types.negationof(types.string):inner():is("string"))
  assert(types.optional(types.number):is("union"))
  local copied = t
  local name = types.singleton("x")
  copied:setreadproperty(name, types.string)
  copied:setwriteproperty(name, types.string)
  copied:setindexer(types.string, types.boolean)
  assert(copied:readproperty(name):is("string"))
  assert(copied:writeproperty(name):is("string"))
  local read = copied:readindexer()
  local write = copied:writeindexer()
  assert(read and read.result:is("boolean"))
  assert(write and write.result:is("boolean"))
  local f = types.newfunction({head = {types.number}}, {head = {types.string}})
  local parameters = f:parameters().head
  local returns = f:returns().head
  assert(parameters and parameters[1]:is("number"))
  assert(returns and returns[1]:is("string"))
  return copied
end
local original: Original = {x = 42}
local changed: Change<Original> = {x = "changed"}
local untouched: number = original.x
return untouched`;
  const r = await source(p, text);
  expect(r.status).toBe("ok");
  expect(r.diagnostics.map(d => d.message)).toEqual([]);
  const lastLine = text.split("\n").length - 1;
  expect((await p.queryType(r.documents[0]!, { line: lastLine, column: 8 })).type).toBe("number");
});

test("queued updates snapshot caller inputs", async () => {
  const p = await project();
  const document = { module: "main.luau", version: 1, source: "local x: number = 42\nreturn x" };
  const updated = p.update({ projectVersion: 1, documents: [document] });
  document.source = 'local x: number = "mutated"\nreturn x';
  expect((await updated).status).toBe("ok");
  expect((await p.check("main.luau")).diagnostics).toEqual([]);
});

test("definition failure is structured and reset restores committed state", async () => {
  const p = await project();
  await p.update({ projectVersion: 1, definitions: [{ name: "host", version: 1, source: "declare hostNumber: number" }], documents: [{ module: "host", version: 41, source: "return 1" }] });
  const r = await p.update({ projectVersion: 2, configuration: { mode: "nocheck" }, definitions: [{ name: "host", version: 2, source: "declare hostNumber: !!!" }] });
  expect(r.status).toBe("error");
  expect(r.projectVersion).toBe(1);
  expect(r.diagnostics?.some(d => d.module === "host" && d.documentVersion === 2 && Number.isInteger(d.code))).toBe(true);
  expect(r.diagnostics?.some(d => d.range.start.line === 0 && d.range.start.column === 20)).toBe(true);
  expect((await p.reset()).status).toBe("ok");
  const checked = await source(p, "local x: number = hostNumber\nreturn x");
  expect(checked.diagnostics).toEqual([]);
  const strict = await source(p, 'local invalid: string = hostNumber\nreturn invalid');
  expect(strict.diagnostics.some(d => d.message.includes("number"))).toBe(true);
});

test("VM allocation limits fail explicitly and independent sessions recover", async () => {
  const limited = await project("strict", 1024 * 1024);
  const healthy = await project();
  const allocation = 'type function Allocate() local huge = string.rep("x", 2^22) return types.number end\nlocal x: Allocate<>\nreturn x';
  const r = await source(limited, allocation);
  expect(r.status).toBe("error");
  expect(r.diagnostics.some(d => d.message.includes("not enough memory"))).toBe(true);
  expect((await healthy.update({ projectVersion: 1, documents: [{ module: "main.luau", version: 1, source: "return 1" }] })).status).toBe("ok");
  expect((await healthy.check("main.luau")).diagnostics).toEqual([]);
  const largerBudget = await source(healthy, allocation);
  expect(largerBudget.status).toBe("ok");
  expect(largerBudget.diagnostics).toEqual([]);
  expect((await limited.check("main.luau")).status).toBe("requires-reset");
  expect((await limited.reset()).status).toBe("ok");
  const imitated = await source(limited, 'type function Imitate() error("not enough memory") end\nlocal x: Imitate<>\nreturn x');
  expect(imitated.status).toBe("error");
  expect(imitated.diagnostics.some(d => d.message.includes("not enough memory"))).toBe(true);
});

test("bounded queries map UTF-16 positions and reject initialization failure", async () => {
  const p = await project();
  const text = 'local x = "🌈"; local y = function(value: {longProperty: number}) return value.longProperty end; print(y)\nreturn y';
  const r = await source(p, text);
  const q = await p.queryType(r.documents[0]!, { line: 1, column: 7 }, 10);
  expect(q.type!.length).toBeLessThanOrEqual(10);
  const full = await p.queryType(r.documents[0]!, { line: 0, column: text.indexOf("print(y)") + 6 });
  expect(full.type).toContain("longProperty");
  expect(p.initialization.initializationMs).toBeGreaterThan(0);
  expect(p.initialization.linearMemoryBytes).toBeGreaterThan(0);
  await expect(createNodeAnalysisBackend().createProject({ mode: "strict" }, { signal: AbortSignal.abort() })).rejects.toThrow("initialization failed");
});

test("query truncation is truthful and never splits Unicode", async () => {
  const p = await project();
  const r = await source(p, 'local x: "🌈🌈🌈🌈" = "🌈🌈🌈🌈"\nreturn x');
  expect(r.diagnostics).toEqual([]);
  const full = await p.queryType(r.documents[0]!, { line: 1, column: 7 });
  expect(full.truncated).toBe(false);
  expect(full.type).toContain("🌈🌈🌈🌈");
  const small = await p.queryType(r.documents[0]!, { line: 1, column: 7 }, 4);
  expect(small.truncated).toBe(true);
  expect(small.type).not.toContain("�");
  expect(new TextEncoder().encode(small.type!).length).toBeLessThanOrEqual(4);
});
