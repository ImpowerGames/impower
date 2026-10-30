import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissSnackbar,
  showSnackbar,
  snackbar,
} from "../../src/modules/spark-editor/utils/snackbar";
import {
  STORAGE_NOT_PERSISTED_MESSAGE,
  isStoragePersisted,
  warnIfStorageNotPersisted,
} from "../../src/modules/spark-editor/utils/storagePersistence";

const storage = (persisted: boolean, granted: boolean) => ({
  persisted: vi.fn(async () => persisted),
  persist: vi.fn(async () => granted),
});

describe("storage persistence warning", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dismissSnackbar();
  });

  afterEach(() => {
    dismissSnackbar();
    vi.useRealTimers();
  });

  it("warns with an export action that stays until dismissed when the browser denies persistence", async () => {
    const denied = storage(false, false);
    const exportProject = vi.fn();

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
    expect(exportProject).toHaveBeenCalledTimes(1);
  });

  it("stays silent when storage is already persisted or the grant succeeds", async () => {
    const already = storage(true, false);
    const granted = storage(false, true);

    expect(
      await warnIfStorageNotPersisted({
        storage: already,
        projectId: "local",
        exportProject: vi.fn(),
      }),
    ).toBe(false);
    expect(already.persist).not.toHaveBeenCalled();
    expect(
      await warnIfStorageNotPersisted({
        storage: granted,
        projectId: "local",
        exportProject: vi.fn(),
      }),
    ).toBe(false);
    expect(snackbar.value).toBeNull();
  });

  it("requests persistence but does not warn for a project synced to Google Drive", async () => {
    const denied = storage(false, false);

    const warned = await warnIfStorageNotPersisted({
      storage: denied,
      projectId: "drive-file-id",
      exportProject: vi.fn(),
    });

    expect(warned).toBe(false);
    expect(denied.persist).toHaveBeenCalledTimes(1);
    expect(snackbar.value).toBeNull();
  });

  it("warns when no project id is cached, since the editor then loads the local project", async () => {
    const warned = await warnIfStorageNotPersisted({
      storage: storage(false, false),
      projectId: undefined,
      exportProject: vi.fn(),
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
