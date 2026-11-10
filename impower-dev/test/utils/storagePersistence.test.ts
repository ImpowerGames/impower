import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissSnackbar,
  snackbar,
} from "../../src/modules/spark-editor/utils/snackbar";
import {
  BACKUP_REMINDER_AFTER_MS,
  BACKUP_REMINDER_SNOOZE_MS,
  DAY_MS,
  backupReminderDue,
  installOfferOf,
  keepOnDevice,
  persistAskOf,
  probeStorage,
  recordBackup,
  remindBackupIfDue,
  settleStorage,
  type BackupFacts,
  type BackupField,
  type PersistencePermission,
  type ProjectBackupRecord,
  type ProjectFileFacts,
  type StorageProbe,
  projectFingerprint,
} from "../../src/modules/spark-editor/utils/storagePersistence";
import { DEVICE_STORAGE_COPY } from "../../src/modules/spark-editor/workspace/saveStatus";

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);

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

const STORY: ProjectFileFacts[] = [
  { path: "main.sd", size: 24, text: "scene start Hello. end" },
  { path: "scenes/intro.sd", size: 11, text: "scene intro" },
  { path: "art/forest.png", size: 2048 },
];

const project = (initial: Partial<Record<BackupField, string>> = {}) => {
  const files = new Map<BackupField, string>(
    Object.entries(initial) as [BackupField, string][],
  );
  let scripts = [...STORY];
  if (files.has("createdAt") && !files.has("backedUpFiles")) {
    files.set("backedUpFiles", projectFingerprint(scripts));
  }
  const record: ProjectBackupRecord = {
    read: async (field) => files.get(field) ?? "",
    write: async (field, value) => {
      files.set(field, value);
    },
    fingerprint: async () => projectFingerprint(scripts),
  };
  return {
    files,
    record,
    edit: () => {
      scripts = scripts.map((file) =>
        file.path === "main.sd"
          ? { ...file, text: "scene start Hello! end" }
          : file,
      );
    },
    remove: (path: string) => {
      scripts = scripts.filter((file) => file.path !== path);
    },
  };
};

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

describe("the project fingerprint a backup is compared against", () => {
  it("depends only on what the files hold, not on order or modification times", () => {
    const base = projectFingerprint(STORY);
    expect(projectFingerprint([...STORY].reverse())).toBe(base);
    expect(projectFingerprint(STORY.map((file) => ({ ...file })))).toBe(base);
  });

  it("changes with an edit, a deletion, an addition, a rename or a resized asset", () => {
    const [main, intro, art] = STORY as [
      ProjectFileFacts,
      ProjectFileFacts,
      ProjectFileFacts,
    ];
    const base = projectFingerprint(STORY);
    for (const changed of [
      [{ ...main, text: "scene start Hello! end" }, intro, art],
      [main, art],
      [...STORY, { path: "notes.sd", size: 1, text: "x" }],
      [main, { ...intro, path: "scenes/opening.sd" }, art],
      [main, intro, { ...art, size: 4096 }],
      [main, { ...intro, text: "" }, art],
    ]) {
      expect(projectFingerprint(changed)).not.toBe(base);
    }
  });
});

describe("when the backup reminder is due", () => {
  const due: BackupFacts = {
    local: true,
    persistent: false,
    changed: true,
    ageMs: 9 * DAY_MS,
    sinceRemindedMs: null,
  };

  it("names seven days for the age and a snooze period", () => {
    expect(BACKUP_REMINDER_AFTER_MS).toBe(7 * DAY_MS);
    expect(BACKUP_REMINDER_SNOOZE_MS).toBeGreaterThan(0);
  });

  it.each<[string, Partial<BackupFacts>, boolean]>([
    ["all four hold", {}, true],
    ["synced to Drive", { local: false }, false],
    ["storage persistent", { persistent: true }, false],
    ["no change since the backup", { changed: false }, false],
    ["backup exactly seven days old", { ageMs: BACKUP_REMINDER_AFTER_MS }, false],
    ["backup six days old", { ageMs: 6 * DAY_MS }, false],
    ["reminded inside the snooze period", { sinceRemindedMs: BACKUP_REMINDER_SNOOZE_MS - 1 }, false],
    ["reminded a snooze period ago", { sinceRemindedMs: BACKUP_REMINDER_SNOOZE_MS }, true],
  ])("%s", (_case, change, expected) => {
    expect(backupReminderDue({ ...due, ...change })).toBe(expected);
  });
});

describe("the backup reminder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    clearSnackbars();
  });

  afterEach(() => {
    clearSnackbars();
    vi.useRealTimers();
  });

  const remind = (
    record: ProjectBackupRecord,
    options: {
      local?: boolean;
      persisted?: boolean;
      now?: number;
      exportProject?: () => Promise<boolean>;
    } = {},
  ) =>
    remindBackupIfDue({
      local: options.local ?? true,
      persisted: options.persisted ?? false,
      project: record,
      now: options.now ?? NOW,
      exportProject: options.exportProject ?? vi.fn(async () => true),
    });

  it("shows nothing on load for a new project, and starts its clock", async () => {
    const { files, record } = project();
    expect(await remind(record)).toBe(false);
    expect(snackbar.value).toBeNull();
    expect(files.get("createdAt")).toBe(String(NOW));
  });

  it("never reminds about a project with no edits, however old", async () => {
    const created = NOW - 30 * DAY_MS;
    const { record, edit } = project({ createdAt: String(created) });
    expect(await remind(record)).toBe(false);
    expect(snackbar.value).toBeNull();
  });

  it("reminds with the fact, an Export action and Remind me later, once the four conditions hold", async () => {
    const created = NOW - 9 * DAY_MS;
    const { files, record, edit } = project({ createdAt: String(created) });
    edit();
    expect(await remind(record)).toBe(true);
    expect(snackbar.value?.message).toBe("9 days and no backup yet.");
    expect(snackbar.value?.actionLabel).toBe("Export");
    expect(snackbar.value?.dismissLabel).toBe("Remind me later");
    expect(files.get("remindedAt")).toBe(String(NOW));
  });

  it("counts a deleted script as a change, with no other file edited", async () => {
    const { record, remove } = project({
      createdAt: String(NOW - 30 * DAY_MS),
    });
    await recordBackup(record, NOW - 9 * DAY_MS);
    expect(await remind(record)).toBe(false);
    remove("scenes/intro.sd");
    expect(await remind(record)).toBe(true);
    expect(snackbar.value?.message).toBe("9 days since your last backup.");
  });

  it("starts an existing project's baseline at its first check, without reminding", async () => {
    const { files, record, edit } = project({
      createdAt: String(NOW - 30 * DAY_MS),
      backedUpFiles: "",
    });
    files.delete("backedUpFiles");
    expect(await remind(record)).toBe(false);
    expect(files.get("backedUpFiles")).toBe(projectFingerprint(STORY));
    edit();
    expect(await remind(record)).toBe(true);
  });

  it("counts from the last backup when there is one", async () => {
    const { record, edit } = project({
      createdAt: String(NOW - 40 * DAY_MS),
      backedUpAt: String(NOW - 12 * DAY_MS),
    });
    edit();
    expect(await remind(record)).toBe(true);
    expect(snackbar.value?.message).toBe("12 days since your last backup.");
  });

  it.each<[string, { local?: boolean; persisted?: boolean }]>([
    ["synced to Drive", { local: false }],
    ["persistent storage", { persisted: true }],
  ])("stays silent for a project %s", async (_case, options) => {
    const { files, record, edit } = project({
      createdAt: String(NOW - 30 * DAY_MS),
    });
    edit();
    expect(await remind(record, options)).toBe(false);
    expect(snackbar.value).toBeNull();
    expect(files.has("remindedAt")).toBe(false);
  });

  it("stays silent when nothing changed since the last backup", async () => {
    const { record, edit } = project({
      createdAt: String(NOW - 30 * DAY_MS),
      backedUpAt: String(NOW - 10 * DAY_MS),
    });
    expect(await remind(record)).toBe(false);
  });

  it("stays silent within seven days of the last backup", async () => {
    const { record, edit } = project({
      createdAt: String(NOW - 30 * DAY_MS),
      backedUpAt: String(NOW - 6 * DAY_MS),
    });
    edit();
    expect(await remind(record)).toBe(false);
  });

  it("Remind me later puts it away and it does not return within the snooze period", async () => {
    const { record, edit } = project({ createdAt: String(NOW - 9 * DAY_MS) });
    edit();
    await remind(record);
    dismissSnackbar(snackbar.value);
    expect(snackbar.value).toBeNull();

    expect(await remind(record, { now: NOW + 60_000 })).toBe(false);
    expect(
      await remind(record, { now: NOW + BACKUP_REMINDER_SNOOZE_MS - 1 }),
    ).toBe(false);
    expect(snackbar.value).toBeNull();
    expect(
      await remind(record, { now: NOW + BACKUP_REMINDER_SNOOZE_MS }),
    ).toBe(true);
  });

  it("exports from the reminder and reports a failed export", async () => {
    const exportProject = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("OPFS read failed"));
    const { record, edit } = project({ createdAt: String(NOW - 9 * DAY_MS) });
    edit();
    await remind(record, { exportProject });
    const reminder = snackbar.value;
    reminder?.onAction?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(exportProject).toHaveBeenCalledTimes(1);
    expect(snackbar.value?.message).toBe(DEVICE_STORAGE_COPY.exportFailed);
    reminder?.onAction?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(exportProject).toHaveBeenCalledTimes(2);
    expect(snackbar.value?.message).toBe(DEVICE_STORAGE_COPY.exportFailed);
  });

  it("keeps the last backup time across a reload", async () => {
    const created = NOW - 30 * DAY_MS;
    const before = project({ createdAt: String(created) });
    await recordBackup(before.record, NOW - 2 * DAY_MS);

    const reloaded = project(Object.fromEntries(before.files));
    reloaded.edit();
    expect(await remind(reloaded.record)).toBe(false);
    expect(
      await remind(reloaded.record, { now: NOW + 6 * DAY_MS }),
    ).toBe(true);
    expect(snackbar.value?.message).toBe("8 days since your last backup.");
  });
});
