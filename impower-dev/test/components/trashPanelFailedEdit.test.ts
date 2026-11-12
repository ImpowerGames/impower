import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it, vi } from "vitest";

const batches = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { fs: { listTrash: async () => batches.value } },
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: TrashPanel } = await import("../../src/modules/spark-editor/components/trash-panel/TrashPanel");

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  workspace.trashOpen.value = false;
});

const entry = (relPath: string) => ({ relPath, originalUri: `file:///p/${relPath}`, type: "script" });

const openPanel = async () => {
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: "p" } };
  workspace.trashOpen.value = true;
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(TrashPanel, {}), host!));
  const dialog = () => document.querySelector('[role="dialog"]')?.textContent ?? "";
  await vi.waitFor(() => expect(dialog()).toContain("Recycle bin ("));
  return dialog();
};

it("says a failed edit's batch is a kept copy and names the action that failed, beside an ordinary delete", async () => {
  batches.value = [
    {
      batchId: "3",
      deletedAt: Date.now(),
      entries: [entry("Scripts/other.sd")],
      reason: { kind: "failed-edit", action: "Rename hero" },
    },
    {
      batchId: "2",
      deletedAt: Date.now(),
      entries: [entry("Scripts/a.sd"), entry("Scripts/b.sd")],
      reason: { kind: "failed-edit", action: "Rename villain" },
    },
    { batchId: "1", deletedAt: Date.now(), entries: [entry("Scripts/gone.sd")] },
  ];
  const text = await openPanel();
  expect(text).toContain("Copy of other.sd kept when “Rename hero” failed");
  expect(text).toContain("Copies of 2 files kept when “Rename villain” failed");
  expect(text).toContain("gone.sd");
  expect(text.match(/kept when/g)).toHaveLength(2);
});

it("says an edit failed when the batch does not name its action", async () => {
  batches.value = [
    { batchId: "1", deletedAt: Date.now(), entries: [entry("other.sd")], reason: { kind: "failed-edit" } },
  ];
  expect(await openPanel()).toContain("Copy of other.sd kept when an edit failed");
});
