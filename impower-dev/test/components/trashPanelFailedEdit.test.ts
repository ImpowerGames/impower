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
  const dialog = () => document.querySelector('[role="dialog"]');
  await vi.waitFor(() => expect(dialog()?.textContent).toContain("Recycle bin ("));
  return [...dialog()!.querySelectorAll(".overflow-y-auto > *")].map((row) =>
    [...row.querySelectorAll("span, small")]
      .filter((part) => part.children.length === 0)
      .map((part) => part.textContent)
      .join(" | "),
  );
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
  expect(await openPanel()).toEqual([
    "other.sd | Copy kept when “Rename hero” failed · Scripts · just now",
    "2 items | Copies kept when “Rename villain” failed · Scripts · just now",
    "gone.sd | Scripts · just now",
  ]);
});

it("says an edit failed when the batch does not name its action", async () => {
  batches.value = [
    { batchId: "1", deletedAt: Date.now(), entries: [entry("other.sd")], reason: { kind: "failed-edit" } },
  ];
  expect(await openPanel()).toEqual(["other.sd | Copy kept when an edit failed · just now"]);
});
