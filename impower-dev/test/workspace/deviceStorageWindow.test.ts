import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {},
}));

const { default: WorkspaceWindow } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceWindow");
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { dismissSnackbar, snackbar } =
  await import("../../src/modules/spark-editor/utils/snackbar");
const { DEVICE_STORAGE_COPY } =
  await import("../../src/modules/spark-editor/workspace/saveStatus");

const browser = { persisted: false, permission: "prompt", grants: false };
const storage = {
  persisted: vi.fn(async () => browser.persisted),
  persist: vi.fn(async () => {
    if (browser.grants) {
      browser.persisted = true;
    }
    return browser.persisted;
  }),
};
const permissions = {
  query: vi.fn(async () => ({ state: browser.permission }) as PermissionStatus),
};

let win: InstanceType<typeof WorkspaceWindow> | undefined;

const open = () => {
  win = new WorkspaceWindow({} as ConstructorParameters<typeof WorkspaceWindow>[0]);
  return win;
};

beforeAll(() => {
  Object.defineProperty(navigator, "storage", { configurable: true, value: storage });
  Object.defineProperty(navigator, "permissions", { configurable: true, value: permissions });
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(browser, { persisted: false, permission: "prompt", grants: false });
});

afterEach(() => {
  win?.dispose();
  win = undefined;
  while (snackbar.value) {
    dismissSnackbar();
  }
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("the editor's storage state, read on load and when install changes", () => {
  it.each(["prompt", "granted", "denied", "unsupported"])(
    "shows no toast when read with the permission %s, now or a week later",
    async (permission) => {
      browser.permission = permission;
      const window = open();
      await window.refreshDeviceStorage();
      window.offerAppInstall(null);
      await vi.advanceTimersByTimeAsync(8 * 24 * 60 * 60 * 1000);
      await window.refreshDeviceStorage();
      expect(snackbar.value).toBeNull();
      expect(workspace.deviceStorage.value?.persisted).toBe(false);
    },
  );

  it("speaks only after the writer presses Keep and the browser says no", async () => {
    const window = open();
    await window.refreshDeviceStorage();
    expect(snackbar.value).toBeNull();
    await window.keepProjectOnDevice();
    expect(storage.persist).toHaveBeenCalledTimes(1);
    expect(snackbar.value?.message).toBe(DEVICE_STORAGE_COPY.keepRefused);
  });
});
