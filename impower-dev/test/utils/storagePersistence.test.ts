import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissSnackbar,
  snackbar,
} from "../../src/modules/spark-editor/utils/snackbar";
import {
  exportBackup,
  installOfferOf,
  keepOnDevice,
  persistAskOf,
  probeStorage,
  settleStorage,
  type PersistencePermission,
  type StorageProbe,
} from "../../src/modules/spark-editor/utils/storagePersistence";
import { DEVICE_STORAGE_COPY } from "../../src/modules/spark-editor/workspace/saveStatus";

const browser = (
  permission: PersistencePermission,
  options: { persisted?: boolean; grants?: boolean } = {},
) => {
  const calls: string[] = [];
  let persisted = options.persisted ?? false;
  const storage = {
    persisted: vi.fn(async () => {
      calls.push("persisted");
      return persisted;
    }),
    persist: vi.fn(async () => {
      calls.push("persist");
      if (options.grants) {
        persisted = true;
      }
      return persisted;
    }),
  };
  const permissions = {
    query: vi.fn(async (descriptor: { name: string }) => {
      calls.push(`query:${descriptor.name}`);
      if (permission === "unsupported") {
        throw new TypeError("not a valid permission name");
      }
      return { state: permission } as PermissionStatus;
    }),
  };
  return { calls, storage, permissions };
};

const probe = (
  permission: PersistencePermission,
  persisted = false,
  canPersist = true,
): StorageProbe => ({ persisted, permission, canPersist });

const clearSnackbars = () => {
  while (snackbar.value) {
    dismissSnackbar();
  }
};

describe("whether the app may ask the browser to keep the project", () => {
  it.each<[string, StorageProbe, ReturnType<typeof persistAskOf>]>([
    ["granted: the browser answers without a prompt", probe("granted"), "silent"],
    ["prompt: the browser would ask the writer", probe("prompt"), "on-press"],
    ["denied: asking changes nothing", probe("denied"), "none"],
    ["unsupported: no way to tell, so treated as a prompt", probe("unsupported"), "on-press"],
    ["already persisted", probe("granted", true), "none"],
    ["already persisted, prompt state", probe("prompt", true), "none"],
    ["no persist() to call", probe("prompt", false, false), "none"],
  ])("%s", (_case, input, expected) => {
    expect(persistAskOf(input)).toBe(expected);
  });
});

describe("reading the browser's storage state", () => {
  it("reads persisted() and the persistent-storage permission without asking", async () => {
    const { calls, storage, permissions } = browser("prompt");
    expect(await probeStorage(storage, permissions)).toEqual(probe("prompt"));
    expect(calls).toEqual(["persisted", "query:persistent-storage"]);
  });

  it("treats a missing, throwing or unknown permission query as unsupported", async () => {
    expect((await probeStorage({}, undefined)).permission).toBe("unsupported");
    const { storage, permissions } = browser("unsupported");
    expect((await probeStorage(storage, permissions)).permission).toBe(
      "unsupported",
    );
    expect(
      (
        await probeStorage(storage, {
          query: async () => ({ state: "maybe" }) as unknown as PermissionStatus,
        })
      ).permission,
    ).toBe("unsupported");
  });

  it("treats a missing or throwing storage manager as not persisted", async () => {
    expect(await probeStorage(undefined, undefined)).toEqual(
      probe("unsupported", false, false),
    );
    expect(
      (
        await probeStorage(
          {
            persisted: async () => {
              throw new DOMException("denied", "SecurityError");
            },
          },
          undefined,
        )
      ).persisted,
    ).toBe(false);
  });
});

describe("asking for persistent storage on load", () => {
  it.each<PersistencePermission>(["prompt", "unsupported", "denied"])(
    "never calls persist() when the permission is %s",
    async (permission) => {
      const { calls, storage, permissions } = browser(permission, {
        grants: true,
      });
      const settled = await settleStorage(storage, permissions);
      expect(storage.persist).not.toHaveBeenCalled();
      expect(calls).not.toContain("persist");
      expect(settled.persisted).toBe(false);
    },
  );

  it("asks silently where the browser has already granted the permission, then reads the result back", async () => {
    const { calls, storage, permissions } = browser("granted", {
      grants: true,
    });
    const settled = await settleStorage(storage, permissions);
    expect(storage.persist).toHaveBeenCalledTimes(1);
    expect(calls.indexOf("persist")).toBeLessThan(calls.lastIndexOf("persisted"));
    expect(settled.persisted).toBe(true);
  });

  it("does not ask when storage is already persisted", async () => {
    const { storage, permissions } = browser("granted", { persisted: true });
    expect((await settleStorage(storage, permissions)).persisted).toBe(true);
    expect(storage.persist).not.toHaveBeenCalled();
  });
});

describe("Keep on this device", () => {
  it("calls persist() from the press and reads the answer back", async () => {
    const { storage, permissions } = browser("prompt", { grants: true });
    const kept = await keepOnDevice(storage, permissions);
    expect(storage.persist).toHaveBeenCalledTimes(1);
    expect(kept.persisted).toBe(true);
  });

  it("reports a refusal as still not persisted", async () => {
    const { storage, permissions } = browser("prompt");
    expect((await keepOnDevice(storage, permissions)).persisted).toBe(false);
    expect(
      (
        await keepOnDevice(
          {
            persisted: async () => false,
            persist: async () => {
              throw new DOMException("denied", "SecurityError");
            },
          },
          permissions,
        )
      ).persisted,
    ).toBe(false);
  });
});

describe("which install route the popover offers", () => {
  it.each<[string, Parameters<typeof installOfferOf>[0], ReturnType<typeof installOfferOf>]>([
    ["installed already", { installed: true, promptReady: true, homeScreen: true }, null],
    ["the browser's install prompt", { installed: false, promptReady: true, homeScreen: false }, "prompt"],
    ["Safari on iOS or iPadOS", { installed: false, promptReady: false, homeScreen: true }, "home-screen"],
    ["neither", { installed: false, promptReady: false, homeScreen: false }, null],
  ])("%s", (_case, input, expected) => {
    expect(installOfferOf(input)).toBe(expected);
  });
});

describe("exporting a backup from the popover", () => {
  beforeEach(() => {
    clearSnackbars();
  });

  afterEach(() => {
    clearSnackbars();
  });

  it("says nothing when the export succeeds", async () => {
    expect(await exportBackup(async () => true)).toBe(true);
    expect(snackbar.value).toBeNull();
  });

  it.each<[string, () => Promise<boolean>]>([
    ["reports nothing exported", async () => false],
    ["throws", async () => {
      throw new Error("OPFS read failed");
    }],
  ])("reports a failed export when the export %s", async (_case, exportProject) => {
    expect(await exportBackup(exportProject)).toBe(false);
    expect(snackbar.value?.message).toBe(DEVICE_STORAGE_COPY.exportFailed);
  });
});
