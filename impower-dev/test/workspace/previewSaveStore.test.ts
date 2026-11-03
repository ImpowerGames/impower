import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { describe, expect, it } from "vitest";
import {
  PreviewSaveStore,
  type PreviewSaveFiles,
} from "../../src/modules/spark-editor/workspace/PreviewSaveStore";

const memoryFiles = () => {
  const files = new Map<string, string>();
  const store: PreviewSaveFiles = {
    read: async (name) => files.get(name) ?? null,
    write: async (name, text) => {
      files.set(name, text);
    },
  };
  return { files, store };
};

const save = (id: string, kind: PreviewSave["kind"] = "saved"): PreviewSave => ({
  id,
  kind,
  name: `save ${id}`,
  scene: "interrogation",
  uri: "file:///local/main.sd",
  line: 10,
  time: 1,
  data: "{}",
  ...(kind === "lastRun"
    ? { entry: { values: { "store:trust": "2" }, frames: [] } }
    : { edits: [["store:trust", "2"] as [string, string]] }),
});

describe("the editor's preview saves", () => {
  it("keeps each project's saves in its own file outside the project", async () => {
    const { files, store } = memoryFiles();
    const saves = new PreviewSaveStore(store);
    await saves.write("project/one", save("a"));
    await saves.write("two", save("b", "lastRun"));
    expect([...files.keys()]).toEqual(["project%2Fone.json", "two.json"]);
    expect((await saves.list("project/one")).map((s) => s.id)).toEqual(["a"]);
    expect((await saves.list("two")).map((s) => s.id)).toEqual(["b"]);
    expect(await saves.list("three")).toEqual([]);
  });

  it("replaces a save written again, renames it and deletes it", async () => {
    const saves = new PreviewSaveStore(memoryFiles().store);
    await saves.write("p", save("a"));
    await saves.write("p", { ...save("a"), line: 12 });
    await saves.write("p", save("b"));
    expect((await saves.list("p")).map((s) => [s.id, s.line])).toEqual([
      ["a", 12],
      ["b", 10],
    ]);
    await saves.rename("p", "a", "Before the lie");
    expect((await saves.list("p"))[0]!.name).toBe("Before the lie");
    await saves.delete("p", ["a"]);
    expect((await saves.list("p")).map((s) => s.id)).toEqual(["b"]);
  });

  it("refuses a rename of a save it does not keep and a save it cannot read", async () => {
    const saves = new PreviewSaveStore(memoryFiles().store);
    await expect(saves.rename("p", "missing", "x")).rejects.toThrow();
    await expect(
      saves.write("p", { id: "c" } as unknown as PreviewSave),
    ).rejects.toThrow();
    await saves.write("p", save("a"));
    expect((await saves.list("p")).map((s) => s.id)).toEqual(["a"]);
  });

  it("applies writes in the order they were asked for", async () => {
    const saves = new PreviewSaveStore(memoryFiles().store);
    await Promise.all([
      saves.write("p", save("a")),
      saves.write("p", save("b")),
      saves.delete("p", ["a"]),
    ]);
    expect((await saves.list("p")).map((s) => s.id)).toEqual(["b"]);
  });
});
