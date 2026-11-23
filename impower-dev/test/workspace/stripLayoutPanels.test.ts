import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ value: "compact" }));

vi.mock("@impower/impower-ui/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@impower/impower-ui/layout")>();
  return {
    ...actual,
    layoutState: { ...actual.layoutState, current: () => layout.value },
  };
});

import problems, {
  PANEL_BAR_HEIGHT,
} from "../../src/modules/spark-editor/workspace/problems/ProblemsStore";
import route from "../../src/modules/spark-editor/workspace/route/RouteStore";
import workspaceSettings from "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings";

const panelHeight = () =>
  workspaceSettings.projectSettings.value.previewPanelHeight;

describe("where Problems and the route list open", () => {
  beforeEach(() => {
    problems.dialog.value = null;
    route.sheetOpen.value = false;
    workspaceSettings.setProjectSetting("previewPanelHeight", PANEL_BAR_HEIGHT);
  });

  afterEach(() => {
    problems.dialog.value = null;
    route.sheetOpen.value = false;
    workspaceSettings.setProjectSetting("previewPanelHeight", PANEL_BAR_HEIGHT);
  });

  it.each(["phone", "compact"])(
    "opens Problems as a dialog and the route as a sheet in the %s layout, where the preview is a strip",
    (name) => {
      layout.value = name;
      problems.togglePanel();
      expect(problems.dialog.value?.scope).toEqual({ kind: "story" });
      expect(panelHeight()).toBe(PANEL_BAR_HEIGHT);
      expect(problems.showPanel("route")).toBe(false);
      route.show();
      expect(route.sheetOpen.value).toBe(true);
      expect(panelHeight()).toBe(PANEL_BAR_HEIGHT);
    },
  );

  it("opens Problems and the route in the docked preview's panel on the desktop layout", () => {
    layout.value = "desktop";
    problems.togglePanel();
    expect(problems.dialog.value).toBeNull();
    expect(panelHeight()).toBeGreaterThan(PANEL_BAR_HEIGHT);
    problems.collapsePanel();
    route.show();
    expect(route.sheetOpen.value).toBe(false);
    expect(problems.routeShown.value).toBe(true);
  });
});
