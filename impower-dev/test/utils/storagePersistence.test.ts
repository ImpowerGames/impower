import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissSnackbar,
  showSnackbar,
  snackbar,
} from "../../src/modules/spark-editor/utils/snackbar";
import {
  STORAGE_EXPORT_FAILED_MESSAGE,
  STORAGE_NOT_PERSISTED_MESSAGE,
  isStoragePersisted,
  warnIfStorageNotPersisted,
} from "../../src/modules/spark-editor/utils/storagePersistence";

const storage = (persisted: boolean, granted: boolean) => ({
  persisted: vi.fn(async () => persisted),
  persist: vi.fn(async () => granted),
});

const clearSnackbars = () => {
  while (snackbar.value) {
    dismissSnackbar();
  }
};

const warnDenied = (exportProject = vi.fn(async () => true)) =>
  warnIfStorageNotPersisted({
    storage: storage(false, false),
    projectId: "local",
    exportProject,
  });

describe("storage persistence warning", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearSnackbars();
  });

  afterEach(() => {
    clearSnackbars();
    vi.useRealTimers();
  });

  it("warns with an export action that stays until dismissed when the browser denies persistence", async () => {
    const denied = storage(false, false);
    const exportProject = vi.fn(async () => true);

    const warned = await warnIfStorageNotPersisted({
      storage: denied,
      projectId: "local",
      exportProject,
    });

    expect(warned).toBe(true);
    expect(denied.persist).toHaveBeenCalledTimes(1);
    expect(snackbar.value?.message).toBe(STORAGE_NOT_PERSISTED_MESSAGE);
    expect(snackbar.value?.actionLabel).toBe("Export");

    vi.advanceTimersByTime(60_000);
    expect(snackbar.value?.message).toBe(STORAGE_NOT_PERSISTED_MESSAGE);

    snackbar.value?.onAction?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(exportProject).toHaveBeenCalledTimes(1);
    expect(snackbar.value).toBeNull();
  });

  it("comes back after an ordinary snackbar shown over it expires or is acted on", async () => {
    await warnDenied();

    showSnackbar({ message: "Deleted scene.sd", actionLabel: "Undo" });
    expect(snackbar.value?.message).toBe("Deleted scene.sd");
    vi.advanceTimersByTime(6000);
    expect(snackbar.value?.message).toBe(STORAGE_NOT_PERSISTED_MESSAGE);

    const undo = { message: "Deleted art.png", actionLabel: "Undo" };
    showSnackbar(undo);
    dismissSnackbar(undo);
    expect(snackbar.value?.message).toBe(STORAGE_NOT_PERSISTED_MESSAGE);
  });

  it("keeps the warning and reports the failure when the export produces nothing or throws", async () => {
    const exportProject = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("OPFS read failed"));
    await warnDenied(exportProject);

    for (let attempt = 0; attempt < 2; attempt++) {
      snackbar.value?.onAction?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(snackbar.value?.message).toBe(STORAGE_EXPORT_FAILED_MESSAGE);
      vi.advanceTimersByTime(6000);
      expect(snackbar.value?.message).toBe(STORAGE_NOT_PERSISTED_MESSAGE);
    }
    expect(exportProject).toHaveBeenCalledTimes(2);
  });

  it("goes away for good when the author dismisses it", async () => {
    await warnDenied();
    const warning = snackbar.value;

    dismissSnackbar(warning);
    expect(snackbar.value).toBeNull();
    showSnackbar({ message: "Deleted scene.sd" });
    vi.advanceTimersByTime(6000);
    expect(snackbar.value).toBeNull();
  });

  it("stays silent when storage is already persisted or the grant succeeds", async () => {
    const already = storage(true, false);
    const granted = storage(false, true);

    expect(
      await warnIfStorageNotPersisted({
        storage: already,
        projectId: "local",
        exportProject: vi.fn(async () => true),
      }),
    ).toBe(false);
    expect(already.persist).not.toHaveBeenCalled();
    expect(
      await warnIfStorageNotPersisted({
        storage: granted,
        projectId: "local",
        exportProject: vi.fn(async () => true),
      }),
    ).toBe(false);
    expect(snackbar.value).toBeNull();
  });

  it("requests persistence but does not warn for a project synced to Google Drive", async () => {
    const denied = storage(false, false);

    const warned = await warnIfStorageNotPersisted({
      storage: denied,
      projectId: "drive-file-id",
      exportProject: vi.fn(async () => true),
    });

    expect(warned).toBe(false);
    expect(denied.persist).toHaveBeenCalledTimes(1);
    expect(snackbar.value).toBeNull();
  });

  it("warns when no project id is cached, since the editor then loads the local project", async () => {
    const warned = await warnIfStorageNotPersisted({
      storage: storage(false, false),
      projectId: undefined,
      exportProject: vi.fn(async () => true),
    });

    expect(warned).toBe(true);
    expect(snackbar.value?.message).toBe(STORAGE_NOT_PERSISTED_MESSAGE);
  });

  it("treats a missing or throwing storage manager as not persisted", async () => {
    expect(await isStoragePersisted(undefined)).toBe(false);
    expect(await isStoragePersisted({})).toBe(false);
    expect(
      await isStoragePersisted({
        persisted: async () => false,
        persist: async () => {
          throw new DOMException("denied", "SecurityError");
        },
      }),
    ).toBe(false);
  });

  it("still auto-dismisses an ordinary snackbar", () => {
    showSnackbar({ message: "Deleted" });
    vi.advanceTimersByTime(6000);
    expect(snackbar.value).toBeNull();
  });
});
