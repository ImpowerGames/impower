import { expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";

test.each([false, true])("missing dependency creation/restoration matches fresh checks (initially present: %s)", async initiallyPresent => {
  const backend = createNodeAnalysisBackend();
  const p = await backend.createProject({ mode: "strict" });
  const fresh = await backend.createProject({ mode: "strict" });
  const retained = [
    { module: "middle.luau", version: 1, source: 'return require("leaf.luau")' },
    { module: "root.luau", version: 1, source: 'local value: number = require("middle.luau")\nreturn value' },
    { module: "unrelated.luau", version: 1, source: "return 42" },
  ];
  try {
    await p.update({ projectVersion: 1, documents: [...retained, ...(initiallyPresent ? [{ module: "leaf.luau", version: 1, source: "return 1" }] : [])] });
    expect((await p.check("unrelated.luau")).diagnostics).toEqual([]);
    const initial = await p.check("root.luau");
    if (initiallyPresent) {
      expect(initial.diagnostics).toEqual([]);
      await p.update({ projectVersion: 2, removeDocuments: ["leaf.luau"] });
    }
    const missing = await p.check("root.luau");
    expect(missing.diagnostics.some(d => d.module === "middle.luau" && /require|module/i.test(d.message))).toBe(true);
    const leaf = { module: "leaf.luau", version: 2, source: 'return "restored"' };
    await p.update({ projectVersion: p.projectVersion + 1, documents: [leaf] });
    const restored = await p.check("root.luau");
    await fresh.update({ projectVersion: p.projectVersion, documents: [...retained, leaf] });
    const expected = await fresh.check("root.luau");
    expect(expected.diagnostics.some(d => d.module === "root.luau" && d.message.includes("number"))).toBe(true);
    expect(restored.diagnostics).toEqual(expected.diagnostics);
    expect(restored.checkedModules).toBe(3);
    expect((await p.check("unrelated.luau")).checkedModules).toBe(0);
    await p.update({ projectVersion: p.projectVersion + 1, documents: [{ ...leaf, version: 3 }] });
    expect((await p.check("root.luau")).checkedModules).toBe(0);
  } finally { await Promise.all([p.dispose(), fresh.dispose()]); }
});
