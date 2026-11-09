import type { SyncStatus } from "@impower/spark-editor-protocol/src/types";
import { describe, expect, it } from "vitest";
import {
  localSaveLabel,
  relativeTime,
  saveStatusOf,
  type SaveStatus,
} from "../../src/modules/spark-editor/workspace/saveStatus";

const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const MINUTE = 60_000;

const DRIVE_CAPTIONS: [SyncStatus, SaveStatus][] = [
  ["cached", { text: "Draft saved", tone: "saved", action: "menu" }],
  ["loading", { text: "Loading…", tone: "neutral", action: "menu" }],
  ["importing", { text: "Importing…", tone: "neutral", action: "menu" }],
  ["exporting", { text: "Exporting…", tone: "neutral", action: "menu" }],
  ["syncing", { text: "Syncing…", tone: "neutral", action: "menu" }],
  ["unsynced", { text: "Changes not synced", tone: "pending", action: "menu" }],
  [
    "synced",
    { text: "Saved to Google Drive 2m ago", tone: "saved", action: "menu" },
  ],
  [
    "offline",
    {
      text: "Offline · will sync when connected",
      tone: "warning",
      action: "menu",
    },
  ],
  [
    "load_error",
    {
      text: "Could not load project",
      tone: "error",
      glyph: "error",
      action: "settings",
    },
  ],
  [
    "import_error",
    {
      text: "Could not import project",
      tone: "error",
      glyph: "error",
      action: "settings",
    },
  ],
  [
    "export_error",
    {
      text: "Could not export project",
      tone: "error",
      glyph: "error",
      action: "settings",
    },
  ],
  [
    "sync_error",
    {
      text: "Could not sync project",
      tone: "error",
      glyph: "error",
      action: "settings",
    },
  ],
  [
    "sync_conflict",
    {
      text: "Sync conflict",
      tone: "warning",
      glyph: "warning",
      action: "conflict",
    },
  ],
];

describe("the save status caption map", () => {
  it.each(DRIVE_CAPTIONS)(
    "captions a Drive project's %s state",
    (status, caption) => {
      expect(saveStatusOf(status, false, null, NOW - 2 * MINUTE, NOW)).toEqual(
        caption,
      );
    },
  );

  it("covers every sync state", () => {
    const states: Record<SyncStatus, true> = {
      cached: true,
      unsynced: true,
      synced: true,
      offline: true,
      loading: true,
      importing: true,
      exporting: true,
      syncing: true,
      load_error: true,
      import_error: true,
      export_error: true,
      sync_error: true,
      sync_conflict: true,
    };
    expect(DRIVE_CAPTIONS.map(([status]) => status).sort()).toEqual(
      Object.keys(states).sort(),
    );
  });

  it.each(["load_error", "import_error"] as const)(
    "reads a local project's %s as a draft that is not saved, linking to Save & sync",
    (status) => {
      expect(saveStatusOf(status, true)).toEqual({
        text: "Draft not saved",
        tone: "error",
        glyph: "error",
        action: "settings",
      });
      expect(localSaveLabel(status, true)).toBe("Not saved locally");
    },
  );

  it("keeps a failed export apart from the saved draft", () => {
    expect(saveStatusOf("export_error", true)?.text).toBe(
      "Could not export project",
    );
    expect(localSaveLabel("export_error", true)).toBe("Saved locally");
    expect(localSaveLabel("cached", true)).toBe("Saved locally");
    expect(localSaveLabel("load_error", false)).toBe("Saved locally");
  });

  it("gives every error and conflict caption a glyph, so colour is never alone", () => {
    for (const [, caption] of DRIVE_CAPTIONS) {
      if (caption.tone === "error" || caption.action === "conflict") {
        expect(caption.glyph).toBeDefined();
      }
    }
  });

  it("reads a synced project without a sync time as saved without an age", () => {
    expect(saveStatusOf("synced", false, null, null, NOW)?.text).toBe(
      "Saved to Google Drive",
    );
  });

  it("shows import progress over any status, and nothing before the first status", () => {
    expect(saveStatusOf("cached", true, { loaded: 2, total: 5 })?.text).toBe(
      "Importing 2 of 5…",
    );
    expect(saveStatusOf(undefined, true)).toBeNull();
  });
});

describe("the relative time of the last sync", () => {
  it.each([
    [0, "just now"],
    [59_999, "just now"],
    [MINUTE, "1m ago"],
    [59 * MINUTE, "59m ago"],
    [60 * MINUTE, "1h ago"],
    [23 * 60 * MINUTE + 59 * MINUTE, "23h ago"],
    [24 * 60 * MINUTE, "1d ago"],
    [-5 * MINUTE, "just now"],
  ])("reads %d ms ago as %s", (elapsed, text) => {
    expect(relativeTime(NOW - elapsed, NOW)).toBe(text);
  });
});
