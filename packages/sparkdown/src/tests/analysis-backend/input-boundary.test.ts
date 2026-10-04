import { expect, test } from "vitest";
import { createNodeAnalysisBackend } from "../../analysis-backend/node-loader";

test.each(["document", "definition"])("accepted 8 MiB %s uses real native checking", async kind => {
  const p = await createNodeAnalysisBackend().createProject({ mode: "strict" });
  const suffix = kind === "document" ? '\nlocal bad: number = "wrong"\nreturn bad' : "\ndeclare BoundaryNumber: number";
  const source = "--" + "x".repeat(8 * 1024 * 1024 - suffix.length - 2) + suffix;
  try {
    const updated = await p.update({ projectVersion: 1,
      documents: [{ module: "main.luau", version: 1, source: kind === "document" ? source : "local bad: string = BoundaryNumber\nreturn bad" }],
      ...(kind === "definition" ? { definitions: [{ name: "boundary", version: 1, source }] } : {}),
    }, { deadlineMs: 10000 });
    expect(updated.status, updated.message).toBe("ok");
    const checked = await p.check("main.luau", { deadlineMs: 10000 });
    expect(checked.status).toBe("ok");
    expect(checked.diagnostics).toHaveLength(1);
    expect(checked.diagnostics[0]?.message).toMatch(/number.*string|string.*number/);
    expect(checked.diagnostics[0]?.range.start.line).toBe(kind === "document" ? 1 : 0);
    expect((await p.check("main.luau")).checkedModules).toBe(0);
    expect((await p.reset({ deadlineMs: 10000 })).status).toBe("ok");
    expect((await p.check("main.luau", { deadlineMs: 10000 })).diagnostics).toEqual(checked.diagnostics);
  } finally { await p.dispose(); }
});

test("definition dependencies preserve registration order and batches replace atomically", async () => {
  const p = await createNodeAnalysisBackend().createProject({ mode: "strict" });
  try {
    expect((await p.update({ projectVersion: 1, definitions: [
      { name: "z-types", version: 1, source: "export type Shared = number" },
      { name: "a-values", version: 1, source: "declare BatchValue: Shared" },
    ], documents: [{ module: "main.luau", version: 1, source: "local value: number = BatchValue\nreturn value" }] })).status).toBe("ok");
    expect((await p.check("main.luau")).diagnostics).toEqual([]);
    // The old dependent references Shared; applying only z-types first would be invalid.
    expect((await p.update({ projectVersion: 2, definitions: [
      { name: "z-types", version: 2, source: "export type Replacement = string" },
      { name: "a-values", version: 2, source: "declare BatchValue: Replacement" },
    ] })).status).toBe("ok");
    const changed = await p.check("main.luau");
    expect(changed.diagnostics).toHaveLength(1);
    expect(changed.diagnostics[0]?.message).toContain("string");
    expect((await p.reset()).status).toBe("ok");
    expect((await p.check("main.luau")).diagnostics).toEqual(changed.diagnostics);
    expect((await p.update({ projectVersion: p.projectVersion + 1, removeDefinitions: ["z-types", "a-values"],
      documents: [{ module: "main.luau", version: 2, source: "return 1" }] })).status).toBe("ok");
    expect((await p.check("main.luau")).diagnostics).toEqual([]);
  } finally { await p.dispose(); }
});
