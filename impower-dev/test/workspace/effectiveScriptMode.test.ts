import { afterEach, describe, expect, it } from "vitest";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

afterEach(() => {
  workspace.layout.value = "desktop";
  workspace.scriptMode.value = "reading";
});

describe("the script's effective mode", () => {
  it.each([
    ["phone", "reading", "reading"],
    ["phone", "editing", "editing"],
    ["compact", "reading", undefined],
    ["compact", "editing", undefined],
    ["desktop", "reading", undefined],
    ["desktop", "editing", undefined],
  ] as const)(
    "on a %s layout with the stored mode %s is %s",
    (layout, stored, expected) => {
      workspace.layout.value = layout;
      workspace.scriptMode.value = stored;
      expect(workspace.effectiveScriptMode.value).toBe(expected);
    },
  );

  it("follows a layout change without a write to the stored mode", () => {
    workspace.scriptMode.value = "reading";
    workspace.layout.value = "phone";
    expect(workspace.effectiveScriptMode.value).toBe("reading");
    workspace.layout.value = "desktop";
    expect(workspace.effectiveScriptMode.value).toBeUndefined();
  });
});
