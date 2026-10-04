import { expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";

test.each([
  ['type mismatch', 'local bad: string = 42\nreturn 1'],
  ['syntax error', 'local bad: = 42\nreturn 1'],
  ['type-function runtime error', 'type function Bad(t) error("cached runtime control") end\ntype X = Bad<number>\nreturn 1'],
])("root-only edits retain cached dependency diagnostics (%s)", async (_kind, source) => {
  const backend = createNodeAnalysisBackend();
  const p = await backend.createProject({ mode: "strict" });
  const fresh = await backend.createProject({ mode: "strict" });
  const dep = { module: "dep.luau", version: 1, source: source! };
  const middle = { module: "middle.luau", version: 1, source: 'return require("dep.luau")' };
  const root = { module: "main.luau", version: 2, source: 'local value = require("middle.luau")\nlocal bad: string = 42\nreturn value' };
  try {
    expect((await p.update({ projectVersion: 1, documents: [dep, middle, { ...root, version: 1, source: 'return require("middle.luau")' }] })).status).toBe("ok");
    const initial = await p.check("main.luau");
    expect(initial.status).toBe("ok");
    expect(initial.diagnostics.some(d => d.module === "dep.luau")).toBe(true);
    expect(initial.checkedModules).toBe(3);
    expect((await p.update({ projectVersion: 2, documents: [root] })).status).toBe("ok");
    const edited = await p.check("main.luau");
    const cached = await p.check("main.luau");
    expect((await fresh.update({ projectVersion: 2, documents: [dep, middle, root] })).status).toBe("ok");
    const expected = await fresh.check("main.luau");
    expect(expected.diagnostics.some(d => d.module === "main.luau")).toBe(true);
    expect(expected.diagnostics.some(d => d.module === "dep.luau")).toBe(true);
    expect(edited.status).toBe("ok");
    expect(edited.checkedModules).toBe(1);
    expect(cached.checkedModules).toBe(0);
    expect(edited.replacementDocuments.map(d => d.module)).toEqual(["dep.luau", "main.luau", "middle.luau"]);
    expect(edited.diagnostics).toEqual(expected.diagnostics);
    expect(edited.diagnostics).toEqual(cached.diagnostics);
    expect(new Set(edited.diagnostics.map(d => JSON.stringify(d))).size).toBe(edited.diagnostics.length);
    expect((await p.reset()).status).toBe("ok");
    expect((await p.check("main.luau")).diagnostics).toEqual(expected.diagnostics);
  } finally { await Promise.all([p.dispose(), fresh.dispose()]); }
});

test("removed native graphs are reusable across distinct module names", async () => {
  const source = "export type T = {" + Array.from({ length: 2000 }, (_, i) => `property${i}: number`).join(",") + "}\nreturn {}";
  async function churn(unique: boolean) {
    const p = await createNodeAnalysisBackend().createProject({ mode: "strict" });
    const samples: number[] = [];
    try {
      for (let i = 0; i < 32; i++) {
        const module = unique ? `module${i}.luau` : "module.luau";
        expect((await p.update({ projectVersion: p.projectVersion + 1, documents: [{ module, version: 1, source }] })).status).toBe("ok");
        const checked = await p.check(module);
        expect(checked.status).toBe("ok");
        expect(checked.diagnostics).toEqual([]);
        samples.push(checked.timings.linearMemoryBytes);
        expect((await p.update({ projectVersion: p.projectVersion + 1, removeDocuments: [module] })).status).toBe("ok");
      }
      return samples;
    } finally { await p.dispose(); }
  }
  const reused = await churn(false), unique = await churn(true);
  console.log(JSON.stringify({ sourceBytes: source.length, reused, unique }));
  // Linear memory need not shrink after a free. Compare capacity needed by equal work
  // with distinct IDs versus reuse; allow 4 MiB for allocation/layout variation.
  expect(Math.max(...unique)).toBeLessThanOrEqual(Math.max(...reused) + 4 * 1024 * 1024);
}, 60000);

test("cycle deletion and restoration preserve invalidation and unrelated caches", async () => {
  const backend = createNodeAnalysisBackend();
  const p = await backend.createProject({ mode: "strict" });
  const fresh = await backend.createProject({ mode: "strict" });
  const a = { module: "a.luau", version: 1, source: 'return require("b.luau")' };
  const b = { module: "b.luau", version: 2, source: 'return require("a.luau")' };
  const unrelated = { module: "unrelated.luau", version: 1, source: "return 1" };
  try {
    await p.update({ projectVersion: 1, documents: [a, { ...b, version: 1 }, unrelated] });
    await p.check("unrelated.luau");
    const initial = await p.check("a.luau");
    expect(initial.diagnostics.length).toBeGreaterThan(0);
    expect(initial.diagnostics.some(d => /cycle|cyclic/i.test(d.message))).toBe(true);
    await p.update({ projectVersion: 2, removeDocuments: ["b.luau"] });
    const missing = await p.check("a.luau");
    expect(missing.diagnostics.some(d => /require|module/i.test(d.message))).toBe(true);
    expect(missing.replacementDocuments.map(d => d.module)).toEqual(["a.luau"]);
    await p.update({ projectVersion: 3, documents: [b] });
    const restored = await p.check("a.luau");
    await fresh.update({ projectVersion: 3, documents: [a, b, unrelated] });
    const expected = await fresh.check("a.luau");
    expect(expected.diagnostics.length).toBeGreaterThan(0);
    expect(restored.diagnostics).toEqual(expected.diagnostics);
    expect(restored.checkedModules).toBe(2);
    expect((await p.check("unrelated.luau")).checkedModules).toBe(0);
    expect((await p.check("a.luau")).checkedModules).toBe(0);
  } finally { await Promise.all([p.dispose(), fresh.dispose()]); }
});
