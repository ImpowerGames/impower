import { expect, it, vi } from "vitest";
import { readSettledDiagnostics } from "../../src/modules/spark-editor/workspace/readSettledDiagnostics";

it("waits for a fresh server reply on every call, including after edits", async () => {
  const request = vi.fn().mockResolvedValueOnce({ kind: "full", resultId: "1", items: [] })
    .mockResolvedValueOnce({ kind: "full", resultId: "2", items: [{ message: "new error" }] });
  const params = { textDocument: { uri: "file://project/main.sd" } };
  expect((await readSettledDiagnostics(params, request)).diagnostics).toEqual([]);
  expect((await readSettledDiagnostics({ ...params, version: 2 }, request)).diagnostics).toEqual([{ message: "new error" }]);
  expect(request).toHaveBeenCalledTimes(2);
});
it("does not label an older revision or unchanged reply as settled", async () => {
  const params = { textDocument: { uri: "file://project/main.sd" }, version: 3 };
  await expect(readSettledDiagnostics(params, async () => ({ kind: "full", resultId: "2", items: [] }))).rejects.toThrow("version 3");
  await expect(readSettledDiagnostics(params, async () => ({ kind: "unchanged", resultId: "3" }))).rejects.toThrow("full diagnostic report");
});
