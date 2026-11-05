import { describe, expect, it } from "vitest";
import {
  localSaveLabel,
  saveStatusOf,
} from "../../src/modules/spark-editor/workspace/saveStatus";

describe("the save status line and the rail foot", () => {
  it("reads a saved local draft as saved", () => {
    expect(saveStatusOf("cached", true)).toEqual({
      text: "Draft saved",
      tone: "saved",
    });
    expect(localSaveLabel("cached", true)).toBe("Saved locally");
  });

  it.each(["load_error", "import_error"] as const)(
    "reads a local project's %s as a draft that is not saved",
    (status) => {
      expect(saveStatusOf(status, true)).toEqual({
        text: "Draft not saved",
        tone: "error",
      });
      expect(localSaveLabel(status, true)).toBe("Not saved locally");
    },
  );

  it("keeps a failed export apart from the saved draft", () => {
    expect(saveStatusOf("export_error", true)).toEqual({
      text: "Error: Could not export project",
      tone: "error",
    });
    expect(localSaveLabel("export_error", true)).toBe("Saved locally");
  });

  it("keeps today's wording for a Drive project's states", () => {
    expect(saveStatusOf("load_error", false)?.text).toBe(
      "Error: Could not load project",
    );
    expect(localSaveLabel("load_error", false)).toBe("Saved locally");
    expect(saveStatusOf("synced", false)?.text).toBe("Synced online ✓");
    expect(saveStatusOf("unsynced", false)).toEqual({
      text: "Unsynced changes",
      tone: "pending",
    });
    expect(saveStatusOf("sync_conflict", false)).toEqual({
      text: "Sync conflict detected",
      tone: "warning",
    });
  });

  it("shows import progress over any status, and nothing before the first status", () => {
    expect(saveStatusOf("cached", true, { loaded: 2, total: 5 })?.text).toBe(
      "Importing 2 of 5...",
    );
    expect(saveStatusOf(undefined, true)).toBeNull();
  });
});
