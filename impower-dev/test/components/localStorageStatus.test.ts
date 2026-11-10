import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const intents = vi.hoisted(() => ({
  keepProjectOnDevice: vi.fn(async () => {}),
  installApp: vi.fn(async () => {}),
  saveProjectToDrive: vi.fn(async () => {}),
  signInToGoogleDrive: vi.fn(async () => {}),
  setAppMenuOpen: vi.fn(),
}));
const exportZip = vi.hoisted(() => vi.fn(async () => true));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: intents },
}));
vi.mock("../../src/modules/spark-editor/utils/downloadProjectZip", () => ({
  downloadProjectZip: exportZip,
}));

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { SyncStatusLine } =
  await import("../../src/modules/spark-editor/components/drive-sync");

let host: HTMLElement | undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

const setProject = (id: string, status: "cached" | "synced") =>
  act(() => {
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id },
      sync: { ...workspace.current.sync, status },
    };
  });

const setDevice = (
  persisted: boolean,
  permission: "granted" | "prompt" | "denied" | "unsupported" = "prompt",
  install: "prompt" | "home-screen" | null = null,
) =>
  act(() => {
    workspace.deviceStorage.value = {
      persisted,
      permission,
      canPersist: true,
      install,
    };
  });

const trigger = () =>
  host?.querySelector<HTMLButtonElement>("[data-local-storage-status]") ??
  null;
const statusButton = () =>
  host?.querySelector<HTMLButtonElement>('[role="status"] button') ?? null;
const popover = () =>
  document.querySelector<HTMLElement>("[data-local-storage-popover]");
const rows = () =>
  Array.from(
    popover()?.querySelectorAll<HTMLElement>("[data-storage-action]") ?? [],
  ).map((row) => row.dataset.storageAction);
const row = (action: string) =>
  popover()?.querySelector<HTMLElement>(`[data-storage-action="${action}"]`);

const open = async () => {
  await act(async () => {
    trigger()!.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    trigger()!.click();
  });
  await settle();
};

beforeEach(async () => {
  await setProject("local", "cached");
  await setDevice(false);
  workspace.account.value = null;
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(SyncStatusLine, null), host!));
});

afterEach(async () => {
  await act(async () => render(null, host!));
  host?.remove();
  host = undefined;
  document.body.innerHTML = "";
  workspace.deviceStorage.value = null;
  vi.clearAllMocks();
});

describe("the local project's storage status", () => {
  it("says where the work lives, with a marker while the browser has not agreed to keep it", async () => {
    expect(trigger()?.textContent?.trim()).toBe("Saved on this device");
    expect(trigger()?.querySelector("[data-storage-marker]")).not.toBeNull();
  });

  it("drops the marker once storage is persistent", async () => {
    await setDevice(true, "granted");
    expect(trigger()?.textContent?.trim()).toBe("Saved on this device");
    expect(trigger()?.querySelector("[data-storage-marker]")).toBeNull();
  });

  it("opens a popover that says where the work lives and lists only the ways that apply", async () => {
    await open();
    expect(popover()?.textContent).toContain("Stored in this browser only.");
    expect(rows()).toEqual(["keep", "drive", "export"]);
  });

  it("offers no Keep on this device once storage is persistent, or where the browser has said no", async () => {
    await setDevice(true, "granted");
    await open();
    expect(rows()).toEqual(["drive", "export"]);
    await act(async () => render(null, host!));
    document.body.innerHTML = "";
    host = document.body.appendChild(document.createElement("div"));
    await setDevice(false, "denied");
    await act(async () => render(h(SyncStatusLine, null), host!));
    await open();
    expect(rows()).toEqual(["drive", "export"]);
  });

  it("asks the browser to keep the project only from the press", async () => {
    await open();
    expect(intents.keepProjectOnDevice).not.toHaveBeenCalled();
    await act(async () => row("keep")!.querySelector("button")!.click());
    await settle();
    expect(intents.keepProjectOnDevice).toHaveBeenCalledTimes(1);
  });

  it("offers the browser's install prompt where there is one", async () => {
    await setDevice(false, "prompt", "prompt");
    await open();
    expect(rows()).toEqual(["keep", "install", "drive", "export"]);
    await act(async () => row("install")!.querySelector("button")!.click());
    await settle();
    expect(intents.installApp).toHaveBeenCalledTimes(1);
  });

  it("tells Safari on iOS to add the editor to the Home Screen, and why", async () => {
    await setDevice(false, "unsupported", "home-screen");
    await open();
    expect(rows()).toEqual(["keep", "home-screen", "drive", "export"]);
    const instruction = row("home-screen")!;
    expect(instruction.querySelector("button")).toBeNull();
    expect(instruction.textContent).toContain("Add to Home Screen");
    expect(instruction.textContent).toContain("Share");
    expect(instruction.textContent).toContain("keeps");
  });

  it("connects Drive from the Drive row, or saves to Drive when already signed in", async () => {
    await open();
    expect(row("drive")?.textContent).toContain("Sync with Google Drive");
    await act(async () => row("drive")!.querySelector("button")!.click());
    await settle();
    expect(intents.signInToGoogleDrive).toHaveBeenCalledTimes(1);

    await act(() => {
      workspace.account.value = {
        uid: "u",
        consented: true,
      } as typeof workspace.account.value;
    });
    await open();
    expect(row("drive")?.textContent).toContain("Save to Google Drive");
    await act(async () => row("drive")!.querySelector("button")!.click());
    await settle();
    expect(intents.saveProjectToDrive).toHaveBeenCalledTimes(1);
  });

  it("exports a backup from the Export row", async () => {
    await open();
    await act(async () => row("export")!.querySelector("button")!.click());
    expect(exportZip).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and returns focus to the status", async () => {
    await open();
    expect(popover()).not.toBeNull();
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await settle();
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});

describe("a project synced to Drive", () => {
  it("shows its sync status and none of the local status, marker or popover", async () => {
    await setProject("drive-file", "synced");
    expect(trigger()).toBeNull();
    expect(statusButton()?.textContent).toContain("Saved to Google Drive");
    expect(host?.querySelector("[data-storage-marker]")).toBeNull();
    await act(async () => statusButton()!.click());
    await settle();
    expect(popover()).toBeNull();
    expect(intents.setAppMenuOpen).toHaveBeenCalledWith(true);
  });
});
