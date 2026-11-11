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
  projectFingerprint,
  recordBackup,
  remindBackupIfDue,
  settleStorage,
  type BackupFacts,
  type BackupField,
  type PersistencePermission,
  type ProjectBackupRecord,
  type ProjectContent,
  type StorageProbe,
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

const STORY: ProjectContent = {
  files: [
    { path: "main.sd", digest: "main-v1" },
    { path: "scenes/intro.sd", digest: "intro-v1" },
    { path: "art/forest.png", digest: "forest-v1" },
  ],
  folders: ["chapters"],
  settings: "{}",
};

const without = (content: ProjectContent, path: string): ProjectContent => ({
  ...content,
  files: content.files.filter((file) => file.path !== path),
});

const withFile = (
  content: ProjectContent,
  path: string,
  digest: string,
): ProjectContent => ({
  ...without(content, path),
  files: [...without(content, path).files, { path, digest }],
});

const project = (initial: Partial<Record<BackupField, string>> = {}) => {
  const files = new Map<BackupField, string>(
    Object.entries(initial) as [BackupField, string][],
  );
  let content = STORY;
  const fingerprint = vi.fn(async () => projectFingerprint(content));
  const record: ProjectBackupRecord = {
    read: async (field) => files.get(field) ?? "",
    write: async (field, value) => {
      files.set(field, value);
    },
    fingerprint,
  };
  return {
    files,
    record,
    fingerprint,
    current: () => projectFingerprint(content),
    change: (next: (content: ProjectContent) => ProjectContent) => {
      content = next(content);
    },
  };
};

const checked = (initial: Partial<Record<BackupField, string>>) =>
  project({ backedUpFingerprint: projectFingerprint(STORY), ...initial });

const backUp = (
  p: ReturnType<typeof project>,
  startedAt: number,
) => recordBackup(p.record, startedAt, p.current());

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

describe("the fingerprint of what a backup contains", () => {
  const base = projectFingerprint(STORY);
  const move = (content: ProjectContent, from: string, to: string) => {
    const file = content.files.find((f) => f.path === from)!;
    return withFile(without(content, from), to, file.digest);
  };

  it.each<[string, ProjectContent, "changed" | "unchanged"]>([
    ["an edit", withFile(STORY, "main.sd", "main-v2"), "changed"],
    ["a rename", move(STORY, "scenes/intro.sd", "scenes/opening.sd"), "changed"],
    ["a move between folders", move(STORY, "scenes/intro.sd", "chapters/intro.sd"), "changed"],
    ["a deletion to the bin", without(STORY, "scenes/intro.sd"), "changed"],
    ["an outright deletion", without(STORY, "art/forest.png"), "changed"],
    ["a restore from the bin", withFile(without(STORY, "scenes/intro.sd"), "scenes/intro.sd", "intro-v1"), "unchanged"],
    ["a settings change", { ...STORY, settings: '[["screenplayTitlePage",false]]' }, "changed"],
    ["an empty folder created", { ...STORY, folders: ["chapters", "notes"] }, "changed"],
    ["an empty folder removed", { ...STORY, folders: [] }, "changed"],
    ["a file added and removed again", without(withFile(STORY, "notes.sd", "notes-v1"), "notes.sd"), "unchanged"],
    ["the same content re-saved", withFile(STORY, "main.sd", "main-v1"), "unchanged"],
    ["an asset replaced by different bytes of the same size", withFile(STORY, "art/forest.png", "forest-v2"), "changed"],
    ["the same files listed in another order", { ...STORY, files: [...STORY.files].reverse(), folders: [...STORY.folders].reverse() }, "unchanged"],
  ])("%s leaves the project %s", (_case, after, expected) => {
    expect(projectFingerprint(after) === base ? "unchanged" : "changed").toBe(expected);
  });
});

describe("the backup record", () => {
  it("records what the backup contains, and never moves back to an earlier backup", async () => {
    const p = project();
    await backUp(p, NOW);
    const first = p.current();
    p.change((c) => withFile(c, "main.sd", "main-v2"));
    await recordBackup(p.record, NOW - DAY_MS, p.current());
    expect(p.files.get("backedUpAt")).toBe(String(NOW));
    expect(p.files.get("backedUpFingerprint")).toBe(first);
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
      stillDue?: () => boolean;
    } = {},
  ) =>
    remindBackupIfDue({
      local: options.local ?? true,
      persisted: options.persisted ?? false,
      project: record,
      now: options.now ?? NOW,
      exportProject: options.exportProject ?? vi.fn(async () => true),
      stillDue: options.stillDue ?? (() => true),
    });

  const edited = () => {
    const p = checked({ createdAt: String(NOW - 9 * DAY_MS) });
    p.change((c) => withFile(c, "main.sd", "main-v2"));
    return p;
  };

  it("claims and shows nothing once the reminder stops being due before it shows", async () => {
    const { files, record } = edited();
    expect(await remind(record, { stillDue: () => false })).toBe(false);
    expect(snackbar.value).toBeNull();
    expect(files.has("remindedAt")).toBe(false);
    expect(await remind(record)).toBe(true);
  });

  it("records a new project's content at its first check, shows nothing, and starts its clock", async () => {
    const p = project();
    expect(await remind(p.record)).toBe(false);
    expect(snackbar.value).toBeNull();
    expect(p.files.get("createdAt")).toBe(String(NOW));
    expect(p.files.get("backedUpFingerprint")).toBe(p.current());
  });

  it("compares a project never backed up with its content at its first check", async () => {
    const p = project();
    await remind(p.record, { now: NOW - 30 * DAY_MS });
    expect(await remind(p.record)).toBe(false);
    p.change((c) => withFile(c, "notes.sd", "notes-v1"));
    expect(await remind(p.record)).toBe(true);
    expect(snackbar.value?.message).toBe("30 days and no backup yet.");
  });

  it("never reminds about a project with no edits, however old", async () => {
    const { record } = checked({ createdAt: String(NOW - 30 * DAY_MS) });
    expect(await remind(record)).toBe(false);
    expect(snackbar.value).toBeNull();
  });

  it("reminds with the fact, an Export action and Remind me later, once the four conditions hold", async () => {
    const { files, record } = edited();
    expect(await remind(record)).toBe(true);
    expect(snackbar.value?.message).toBe("9 days and no backup yet.");
    expect(snackbar.value?.actionLabel).toBe("Export");
    expect(snackbar.value?.dismissLabel).toBe("Remind me later");
    expect(files.get("remindedAt")).toBe(String(NOW));
  });

  it("does not compute the fingerprint when another condition already rules the reminder out", async () => {
    for (const [options, initial] of [
      [{ local: false }, {}],
      [{ persisted: true }, {}],
      [{}, { backedUpAt: String(NOW - 6 * DAY_MS) }],
      [{}, { remindedAt: String(NOW - DAY_MS) }],
    ] as const) {
      const p = checked({ createdAt: String(NOW - 30 * DAY_MS), ...initial });
      p.change((c) => withFile(c, "main.sd", "main-v2"));
      expect(await remind(p.record, options)).toBe(false);
      expect(p.fingerprint).not.toHaveBeenCalled();
    }
  });

  it.each<[string, { local?: boolean; persisted?: boolean }]>([
    ["synced to Drive", { local: false }],
    ["kept by the browser", { persisted: true }],
  ])(
    "records nothing and computes no fingerprint for a project %s, even with no baseline yet (round 4 finding 7)",
    async (_case, options) => {
      const p = project({ createdAt: String(NOW - 30 * DAY_MS) });
      expect(await remind(p.record, options)).toBe(false);
      expect(p.fingerprint).not.toHaveBeenCalled();
      expect(p.files.has("backedUpFingerprint")).toBe(false);
    },
  );

  it("starts the clock with the baseline for a record that has a creation time but no baseline (round 4 finding 6)", async () => {
    const p = project({ createdAt: String(NOW - 30 * DAY_MS) });
    expect(await remind(p.record)).toBe(false);
    expect(p.files.get("createdAt")).toBe(String(NOW));
    p.change((c) => withFile(c, "main.sd", "main-v2"));
    expect(await remind(p.record, { now: NOW + 60_000 })).toBe(false);
    expect(await remind(p.record, { now: NOW + 8 * DAY_MS })).toBe(true);
    expect(snackbar.value?.message).toBe("8 days and no backup yet.");
  });

  it.each<[string, string, (c: ProjectContent) => ProjectContent]>([
    [
      "a deletion with no other file edited",
      "round 1 author-experience finding 1: deletion-only changes suppress the backup reminder",
      (c) => without(c, "scenes/intro.sd"),
    ],
    [
      "an asset replaced by different bytes of the same size",
      "round 1 undirected finding 1: same-size binary replacements never make the reminder due",
      (c) => withFile(c, "art/forest.png", "forest-v2"),
    ],
    [
      "a saved file, whatever happened to any record of the save",
      "round 2 blast finding 1: reloading after a saved edit can permanently omit that edit",
      (c) => withFile(c, "notes.sd", "notes-v1"),
    ],
    [
      "a deletion, whether or not the trash is emptied afterwards",
      "round 2 undirected finding 1 and round 3 blast finding 1: emptying the trash erases an unbacked deletion",
      (c) => without(c, "scenes/intro.sd"),
    ],
    [
      "an empty folder created",
      "round 3 blast finding 3: exported directory changes never count",
      (c) => ({ ...c, folders: [...c.folders, "notes"] }),
    ],
    [
      "a project setting changed",
      "round 3 blast finding 3: exported settings changes never count",
      (c) => ({ ...c, settings: '[["screenplayTitlePage",false]]' }),
    ],
  ])("counts %s as a change (%s)", async (_case, _finding, change) => {
    const p = checked({ createdAt: String(NOW - 30 * DAY_MS) });
    await backUp(p, NOW - 9 * DAY_MS);
    expect(await remind(p.record)).toBe(false);
    p.change(change);
    expect(await remind(p.record)).toBe(true);
    expect(snackbar.value?.message).toBe("9 days since your last backup.");
  });

  it("counts a change made after the backup, and not one made before it", async () => {
    const p = checked({ createdAt: String(NOW - 30 * DAY_MS) });
    p.change((c) => withFile(c, "main.sd", "main-v2"));
    await backUp(p, NOW - 9 * DAY_MS);
    expect(await remind(p.record)).toBe(false);
    p.change((c) => withFile(c, "main.sd", "main-v3"));
    expect(await remind(p.record)).toBe(true);
  });

  it("does not count a change undone before the next check", async () => {
    const p = checked({ createdAt: String(NOW - 30 * DAY_MS) });
    await backUp(p, NOW - 9 * DAY_MS);
    p.change((c) => withFile(c, "notes.sd", "notes-v1"));
    p.change((c) => without(c, "notes.sd"));
    expect(await remind(p.record)).toBe(false);
  });

  it("counts from the last backup when there is one", async () => {
    const p = checked({ createdAt: String(NOW - 40 * DAY_MS) });
    await backUp(p, NOW - 12 * DAY_MS);
    p.change((c) => withFile(c, "main.sd", "main-v2"));
    expect(await remind(p.record)).toBe(true);
    expect(snackbar.value?.message).toBe("12 days since your last backup.");
  });

  it.each<[string, { local?: boolean; persisted?: boolean }]>([
    ["synced to Drive", { local: false }],
    ["persistent storage", { persisted: true }],
  ])("stays silent for a project %s", async (_case, options) => {
    const { files, record } = edited();
    expect(await remind(record, options)).toBe(false);
    expect(snackbar.value).toBeNull();
    expect(files.has("remindedAt")).toBe(false);
  });

  it("stays silent when nothing changed since the last backup", async () => {
    const p = checked({ createdAt: String(NOW - 30 * DAY_MS) });
    p.change((c) => withFile(c, "main.sd", "main-v2"));
    await backUp(p, NOW - 10 * DAY_MS);
    expect(await remind(p.record)).toBe(false);
  });

  it("stays silent within seven days of the last backup", async () => {
    const p = checked({ createdAt: String(NOW - 30 * DAY_MS) });
    await backUp(p, NOW - 6 * DAY_MS);
    p.change((c) => withFile(c, "main.sd", "main-v2"));
    expect(await remind(p.record)).toBe(false);
  });

  it("Remind me later puts it away and it does not return within the snooze period", async () => {
    const { record } = edited();
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
    const { record } = edited();
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

  it("keeps the last backup across a reload", async () => {
    const before = checked({ createdAt: String(NOW - 30 * DAY_MS) });
    await backUp(before, NOW - 2 * DAY_MS);

    const reloaded = project(Object.fromEntries(before.files));
    reloaded.change((c) => withFile(c, "main.sd", "main-v2"));
    expect(await remind(reloaded.record)).toBe(false);
    expect(
      await remind(reloaded.record, { now: NOW + 6 * DAY_MS }),
    ).toBe(true);
    expect(snackbar.value?.message).toBe("8 days since your last backup.");
  });
});
