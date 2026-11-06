import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ window: undefined as unknown }));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    get window() {
      return current.window;
    },
  },
}));

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: WorkspaceWindow } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceWindow");
const { SyncButton, SyncConflictDialog, SyncStatusLine } =
  await import("../../src/modules/spark-editor/components/drive-sync");

const fakeWorkspace = {
  fs: {},
  sync: { google: {} },
} as unknown as ConstructorParameters<typeof WorkspaceWindow>[0];

const win = new WorkspaceWindow(fakeWorkspace);
current.window = win;
const push = vi.spyOn(win, "resolveConflictWithPush").mockResolvedValue();
const pull = vi.spyOn(win, "resolveConflictWithPull").mockResolvedValue();
const sync = vi.spyOn(win, "syncProject").mockResolvedValue();

const setStatus = (status: "sync_conflict" | "syncing" | "synced") =>
  act(() => {
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: "drive-file" },
      sync: { ...workspace.current.sync, status },
    };
  });

const settle = async (ms = 30) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

const button = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent?.trim() === label,
  );

const hosts: HTMLElement[] = [];

const mount = async () => {
  const host = document.body.appendChild(document.createElement("div"));
  hosts.push(host);
  await act(async () => {
    render(
      h(
        "div",
        null,
        h(SyncStatusLine, null),
        h(SyncButton, null),
        h(SyncConflictDialog, null),
      ),
      host,
    );
  });
  return host;
};

beforeEach(async () => {
  push.mockClear();
  pull.mockClear();
  sync.mockClear();
  await setStatus("synced");
  workspace.syncConflictOpen.value = false;
});

afterEach(async () => {
  for (const host of hosts.splice(0)) {
    await act(async () => render(null, host));
    host.remove();
  }
  await settle(250);
});

describe("the sync conflict dialog", () => {
  it("opens once when the store detects a conflict", async () => {
    await mount();
    expect(dialog()).toBeNull();

    await setStatus("sync_conflict");
    await settle();
    expect(dialog()?.textContent).toContain(
      "This project changed on Google Drive",
    );

    await act(async () => button("Cancel")!.click());
    await settle(250);
    expect(dialog()).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();

    await setStatus("sync_conflict");
    await settle();
    expect(dialog()).toBeNull();

    await setStatus("syncing");
    await setStatus("sync_conflict");
    await settle();
    expect(dialog()).not.toBeNull();
  });

  it("reopens from the status line while the conflict stands", async () => {
    await mount();
    await setStatus("sync_conflict");
    await settle();
    await act(async () => button("Cancel")!.click());
    await settle(250);
    expect(dialog()).toBeNull();

    const caption = button("Sync conflict")!;
    expect(caption.dataset.action).toBe("conflict");
    await act(async () => caption.click());
    await settle();
    expect(dialog()).not.toBeNull();
  });

  it("links a failed save from the status line to Settings at Save & sync", async () => {
    const navigate = vi.spyOn(win, "navigateTo").mockImplementation(() => {});
    try {
      await mount();
      await act(() => {
        workspace.current = {
          ...workspace.current,
          sync: { ...workspace.current.sync, status: "sync_error" },
        };
      });
      const caption = button("Could not sync project")!;
      expect(caption.dataset.action).toBe("settings");
      await act(async () => caption.click());
      await settle();
      expect(navigate).toHaveBeenCalledWith("project", "save-settings");
    } finally {
      navigate.mockRestore();
    }
  });

  it("reopens from the sync button while the conflict stands, without syncing", async () => {
    const host = await mount();
    await setStatus("sync_conflict");
    await settle();
    await act(async () => button("Cancel")!.click());
    await settle(250);
    expect(dialog()).toBeNull();

    const resolve = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Resolve sync conflict"]',
    )!;
    expect(host.querySelector('button[aria-label="Sync now"]')).toBeNull();
    await act(async () => resolve.click());
    await settle();
    expect(dialog()).not.toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });

  it("closes on Escape without resolving", async () => {
    await mount();
    await setStatus("sync_conflict");
    await settle();
    await act(async () => {
      dialog()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await settle(250);
    expect(dialog()).toBeNull();
    expect(workspace.syncConflictOpen.value).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
  });

  it("keeps this device's version through the old toolbar's push", async () => {
    await mount();
    await setStatus("sync_conflict");
    await settle();
    await act(async () => button("Keep this device's version")!.click());
    await settle(250);
    expect(push).toHaveBeenCalledTimes(1);
    expect(pull).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("keeps the Drive version through the old toolbar's pull", async () => {
    await mount();
    await setStatus("sync_conflict");
    await settle();
    await act(async () => button("Keep the Drive version")!.click());
    await settle(250);
    expect(pull).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});
