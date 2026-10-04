import "../../inkjs/engine/Container";
import { expect, test } from "vitest";
import type { AnalysisCheckResult, AnalysisDocument, AnalysisHandle, AnalysisOutcome, AnalysisProject, AnalysisScopeSourceSelector, AnalysisUpdate } from "../../analysis-backend/contract";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownAnalysis } from "../../compiler/typecheck/SparkdownAnalysis";
import { luauFileUnit } from "../../compiler/typecheck/LuauDocumentChecker";

// Controlled backend lifecycle, not a native checker simulation. Real artifact
// retention cleanup is a separate production test after the new ABI is built.
class LifecycleProject implements AnalysisProject {
  projectVersion = 0;
  initialization = { initializationMs: 0, checkingMs: 0, encodingMs: 0, transferMs: 0, totalMs: 0, inputBytes: 0, outputBytes: 0, linearMemoryBytes: 0 };
  installed = new Map<string, AnalysisDocument>();
  updates: AnalysisUpdate[] = [];
  failCheck = false; failUpdate = false;
  private result(status: "ok" | "error" = "ok"): AnalysisOutcome {
    return { sessionId: "controlled-lifecycle", projectVersion: this.projectVersion, status, timings: this.initialization };
  }
  async update(update: AnalysisUpdate) {
    this.updates.push(update);
    if (this.failUpdate) { this.failUpdate = false; return this.result("error"); }
    for (const doc of update.documents ?? []) this.installed.set(doc.module, doc);
    for (const module of update.removeDocuments ?? []) this.installed.delete(module);
    this.projectVersion = update.projectVersion;
    return this.result();
  }
  async check(module: string) { return this.checkModules([module]); }
  async checkModules(modules: readonly string[]): Promise<AnalysisCheckResult> {
    const status = this.failCheck ? "error" : "ok"; this.failCheck = false;
    const documents = modules.map(module => ({ sessionId: "controlled-lifecycle", module,
      documentVersion: this.installed.get(module)!.version, projectVersion: this.projectVersion }));
    return { ...this.result(status), diagnostics: [], documents, replacementDocuments: documents,
      checkedModules: modules.length, scopeGenerations: [], scopeMetadataGenerations: [], nativeRetention: { installedInputs: this.installed.size,
        retainedAstInputs: [...this.installed.values()].filter(doc => "ast" in doc).length, snapshots: 0, flowOwners: 0, leases: 0 } };
  }
  async queryType(_handle: AnalysisHandle) { return { ...this.result(), type: "number", truncated: false }; }
  async querySourceMetadata(_handle: AnalysisHandle) { return { ...this.result(), origin: null, effective: null, supported: true, truncated: false }; }
  async queryScopeSourceMetadata(_handle: AnalysisHandle, selector: AnalysisScopeSourceSelector) {
    return { ...this.result(), selector: { ...selector }, origin: null, effective: null, supported: false, truncated: false };
  }
  async reset() { this.projectVersion++; return this.result(); }
  async dispose() { this.installed.clear(); }
}
const compiler = new SparkdownCompiler(); compiler.configure({ files: [] });
function document(uri: string, version: number, text = "return 1\n") {
  const tree = compiler.documents.parser.parse(text), unit = luauFileUnit(text, wrapped => compiler.documents.parser.parse(wrapped))!;
  expect(unit.errors).toEqual([]);
  return { uri, version, text, tree, units: [unit], mode: "strict" as const };
}

test.each(["changed", "omitted"])("failed initial check/reset/%s retry removes unpublished installed modules", async retry => {
  const backend = new LifecycleProject(), facade = new SparkdownAnalysis(backend);
  try {
    backend.failCheck = true;
    const failed = await facade.analyze({ documents: [document("a.luau", 1)], programNames: [] });
    expect(failed.outcome.status).toBe("error"); expect(failed.documents).toEqual([]);
    expect(backend.installed.size).toBe(1);
    const unpublished = [...backend.installed.keys()][0]!;
    await facade.reset();
    const result = await facade.analyze({ documents: [retry === "changed" ? document("a.luau", 2, "return 2\n") : document("b.luau", 1)], programNames: [] });
    expect(result.outcome.status).toBe("ok"); expect(result.documents).toHaveLength(1);
    const published = result.documents[0]!.units[0]!.module;
    expect(published).not.toBe(unpublished);
    expect(backend.installed.has(unpublished)).toBe(false);
    expect([...backend.installed.keys()]).toEqual([published]);
    expect(backend.updates.at(-1)!.removeDocuments).toContain(unpublished);
  } finally { await facade.dispose(); }
});

test("successful maps survive a failed check until retry succeeds, and failed update does not become installed state", async () => {
  const backend = new LifecycleProject(), facade = new SparkdownAnalysis(backend);
  try {
    const first = await facade.analyze({ documents: [document("a.luau", 1)], programNames: [] });
    const firstMap = first.documents[0]!, firstModule = firstMap.units[0]!.module;
    backend.failCheck = true;
    const failed = await facade.analyze({ documents: [document("b.luau", 1)], programNames: [] });
    expect(failed.documents).toEqual([]); expect(firstMap.uri).toBe("a.luau");
    await expect(facade.queryType(firstMap, 0, 7)).rejects.toThrow("Stale");
    const failedModule = [...backend.installed.keys()][0]!;
    await facade.reset();
    backend.failUpdate = true;
    const rejected = await facade.analyze({ documents: [document("c.luau", 1)], programNames: [] });
    expect(rejected.outcome.status).toBe("error"); expect(backend.installed.has(failedModule)).toBe(true);
    expect(backend.installed.size).toBe(1);
    const neverInstalled = backend.updates.at(-1)!.documents![0]!.module;
    await facade.reset();
    const good = await facade.analyze({ documents: [document("a.luau", 2, "return 3\n")], programNames: [] });
    expect(good.documents[0]!.units[0]!.module).toBe(firstModule);
    expect([...backend.installed.keys()]).toEqual([firstModule]);
    expect(backend.updates.at(-1)!.removeDocuments).toContain(failedModule);
    expect(backend.updates.at(-1)!.removeDocuments).not.toContain(neverInstalled);
    await expect(facade.queryType(firstMap, 0, 7)).rejects.toThrow("Stale");
    expect((await facade.queryType(good.documents[0]!, 0, 7))?.type).toBe("number");
  } finally { await facade.dispose(); }
});
