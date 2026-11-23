import { afterEach, expect, it, vi } from "vitest";
import { releaseStorageWorker, storageWorkerHarness } from "./storageWorkerHarness";

const services = vi.hoisted(() => ({
  fs: null as any,
  window: {
    recordScriptChange: async () => undefined,
    recordAssetChange: async () => undefined,
    openFileEditor: () => undefined,
    getActiveEditorForFile: () => undefined,
  },
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: services }));

afterEach(releaseStorageWorker);

const freshProject = () => storageWorkerHarness(services, { ".layout": "1", ".folders": "1" });

it("duplicates the starter Main of a project that has never saved it", async () => {
  const h = await freshProject();
  const listing = await h.scripts.load();
  expect(Object.keys(listing!.files)).toEqual(["main.sd"]);
  const copy = await h.scripts.duplicate("main.sd");
  expect(await h.read(copy)).toBe("scene start_copy\n  \nend\n");
  const after = await h.scripts.load();
  expect(Object.keys(after!.files).sort()).toEqual(["main.sd", copy].sort());
});

it("rejects a failed storage read with an Error that carries the storage worker's reason", async () => {
  const h = await freshProject();
  await h.scripts.load();
  const failure = await h.fs.readFile({ file: { uri: h.uri("Scripts/missing.sd") } }).catch((e: unknown) => e);
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe(`${h.uri("Scripts/missing.sd")} was not found`);
  expect((failure as { code?: unknown }).code).toBe(-32603);
});
