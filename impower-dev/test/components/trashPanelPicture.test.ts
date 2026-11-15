import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { edgeTreatment } from "../../../packages/impower-ui/test/fadeEdge";

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

const entry = (relPath: string, type = "image") => ({ relPath, originalUri: `file:///p/${relPath}`, type });

it("names a deleted stacked picture once, not by the count of its files", async () => {
  const P = "Assets/Images/Portraits";
  batches.value = [
    { batchId: "3", deletedAt: Date.now(), entries: [`${P}/imani.png`, `${P}/imani@night.png`, `${P}/imani~face.happy.png`].map((p) => entry(p)) },
    { batchId: "2", deletedAt: Date.now(), entries: [entry(`${P}/bunny.png`), entry(`${P}/kai.png`)] },
    { batchId: "1", deletedAt: Date.now(), entries: [entry("Scripts/a.sd", "script"), entry("Scripts/a@b.sd", "script")] },
  ];
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: "p" } };
  workspace.trashOpen.value = true;
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(TrashPanel, {}), host!));
  await vi.waitFor(() => expect(document.body.textContent).toContain("imani"));
  const text = document.querySelector('[role="dialog"]')!.textContent ?? "";
  expect(text).not.toContain("3 items");
  expect(text.match(/2 items/g)).toHaveLength(2);
});

it("fades its title at the edge instead of cutting it to an ellipsis", async () => {
  batches.value = [{ batchId: "1", deletedAt: Date.now(), entries: [entry("Assets/Images/Portraits/imani.png")] }];
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: "p" } };
  workspace.trashOpen.value = true;
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(TrashPanel, {}), host!));
  await vi.waitFor(() => expect(document.body.textContent).toContain("imani"));
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const title = document.getElementById(dialog.getAttribute("aria-labelledby")!)!;
  expect(await edgeTreatment([title])).toEqual([{ text: title.textContent, masked: true, ellipsis: false }]);
});
