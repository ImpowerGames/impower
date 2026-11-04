import { expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      getFiles: async () => ({ "file:///p/a.png": {} }),
      getRelativePath: (_projectId: string, uri: string) =>
        uri.slice("file:///p/".length),
      getFileUri: (_projectId: string, rel: string) => `file:///p/${rel}`,
      deleteFiles: async () => undefined,
    },
  },
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it("prompts concurrent uploads with conflicts one at a time and completes both", async () => {
  const { conflictRequest, resolveUploadConflicts } = await import(
    "../../src/modules/spark-editor/utils/uploadConflicts"
  );
  const written: string[][] = [];
  let finishFirstWrite!: () => void;
  const firstWriteGate = new Promise<void>((resolve) => {
    finishFirstWrite = resolve;
  });
  const upload = (payload: string, gate: Promise<void>) =>
    resolveUploadConflicts("p", [{ rel: "a.png", payload }], async (r) => {
      await gate;
      written.push(r.survivors.map((s) => `${s.payload}:${s.uri}`));
      return payload;
    });

  const first = upload("first", firstWriteGate);
  const second = upload("second", Promise.resolve());

  await settle();
  const firstRequest = conflictRequest.peek();
  expect(firstRequest?.name).toBe("a.png");
  await settle();
  expect(conflictRequest.peek()).toBe(firstRequest);
  expect(written).toEqual([]);

  firstRequest!.resolve({ action: "keepboth", applyToAll: false });
  conflictRequest.value = null;
  await settle();
  await settle();
  expect(conflictRequest.peek()).toBeNull();

  finishFirstWrite();
  await settle();
  await settle();
  const secondRequest = conflictRequest.peek();
  expect(secondRequest).not.toBeNull();
  expect(secondRequest).not.toBe(firstRequest);
  expect(written).toEqual([["first:file:///p/a01.png"]]);

  secondRequest!.resolve({ action: "replace", applyToAll: false });
  conflictRequest.value = null;

  await expect(first).resolves.toBe("first");
  await expect(second).resolves.toBe("second");
  expect(written).toEqual([
    ["first:file:///p/a01.png"],
    ["second:file:///p/a.png"],
  ]);
});
