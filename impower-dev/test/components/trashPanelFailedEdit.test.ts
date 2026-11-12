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

const uri = (relPath: string) => `file:///p/${relPath}`;
const entry = (relPath: string) => ({ relPath, originalUri: uri(relPath), type: "script" });

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

it.each([
  {
    action: { kind: "rename", targets: [uri("Assets/ada.png")] },
    row: "other.sd | Copy kept when renaming ada.png failed · Scripts · just now",
  },
  {
    action: { kind: "rename", targets: [uri("Assets/imani.png"), uri("Assets/imani@night.png"), uri("Assets/imani~face.png")] },
    row: "other.sd | Copy kept when renaming imani.png and 2 more failed · Scripts · just now",
  },
  {
    action: { kind: "put-back", targets: [uri("Scripts/other.sd")] },
    row: "other.sd | Copy kept when putting back other.sd failed · Scripts · just now",
  },
  {
    action: { kind: "replace", targets: [uri("Scripts/other.sd"), uri("main.sd")] },
    row: "other.sd | Copy kept when replacing text in other.sd and 1 more failed · Scripts · just now",
  },
  {
    action: { kind: "rename-symbol", targets: [uri("Scripts/other.sd")] },
    row: "other.sd | Copy kept when renaming references in other.sd failed · Scripts · just now",
  },
  { action: undefined, row: "other.sd | Copy kept when an edit failed · Scripts · just now" },
  {
    action: { kind: "merge", targets: [uri("Scripts/other.sd")] },
    row: "other.sd | Copy kept when an edit failed · Scripts · just now",
  },
  { action: { kind: "rename", targets: [] }, row: "other.sd | Copy kept when an edit failed · Scripts · just now" },
])("says which failed $action.kind left a kept copy, from the batch's data", async ({ action, row }) => {
  batches.value = [
    { batchId: "1", deletedAt: Date.now(), entries: [entry("Scripts/other.sd")], reason: { kind: "failed-edit", action } },
  ];
  expect(await openPanel()).toEqual([row]);
});

it("marks only the kept copies, beside an ordinary delete", async () => {
  batches.value = [
    {
      batchId: "2",
      deletedAt: Date.now(),
      entries: [entry("Scripts/a.sd"), entry("Scripts/b.sd")],
      reason: { kind: "failed-edit", action: { kind: "rename", targets: [uri("Assets/ada.png")] } },
    },
    { batchId: "1", deletedAt: Date.now(), entries: [entry("Scripts/gone.sd")] },
  ];
  expect(await openPanel()).toEqual([
    "2 items | Copies kept when renaming ada.png failed · Scripts · just now",
    "gone.sd | Scripts · just now",
  ]);
});
