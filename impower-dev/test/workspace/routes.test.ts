import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { describe, expect, it } from "vitest";
import {
  SETTINGS_SECTION_IDS,
  settingsSectionHref,
} from "../../src/modules/spark-editor/components/settings/sections";
import {
  LEGACY_ROUTES,
  LEGACY_ROUTES_REMOVAL_DATE,
  ROUTES,
  routeOfHash,
  routeOfState,
  sectionOfHash,
  stateForRoute,
} from "../../src/modules/spark-editor/workspace/routes";

const base = (): WorkspaceCache => ({
  project: { id: "local" },
  pane: "logic",
  panes: {
    logic: { view: "list", panel: "main", panels: {} },
    assets: { panel: "files", panels: {} },
    share: { panel: "game", panels: {} },
  },
  preview: {
    mode: "game",
    modes: { page: {}, game: {}, screenplay: {}, file: {} },
  },
  screen: {},
  sync: {},
  debug: {},
});

describe("routeOfHash", () => {
  it.each([
    ["#story", "story"],
    ["#scripts", "scripts"],
    ["#assets", "assets"],
    ["#share", "share"],
    ["#settings", "settings"],
    ["#settings?section=save-sync", "settings"],
    ["#write", "story"],
    ["#logic", "story"],
    ["#main", "story"],
    ["#collection", "assets"],
    ["#project", "settings"],
    ["#project?section=save-sync", "settings"],
    ["#nowhere", undefined],
    ["", undefined],
  ])("reads %s as %s", (hash, route) => {
    expect(routeOfHash(hash)).toBe(route);
  });
});

describe("LEGACY_ROUTES", () => {
  it("redirects every old name to a current route and carries its removal date", () => {
    expect(Object.keys(LEGACY_ROUTES).sort()).toEqual(
      ["collection", "logic", "main", "project", "write"],
    );
    for (const route of Object.values(LEGACY_ROUTES)) {
      expect(ROUTES).toContain(route);
    }
    expect(LEGACY_ROUTES_REMOVAL_DATE).toBe("2027-02-18");
  });
});

describe("sectionOfHash", () => {
  it.each([
    ["#settings?section=save-settings", "save-settings"],
    ["#SETTINGS?section=file-types", "file-types"],
    ["#project?section=save-settings", "save-settings"],
    ["#settings&section=file-types", "file-types"],
    ["#settings", undefined],
    ["#settings?section=", undefined],
    ["#story?section=save-settings", undefined],
    ["", undefined],
  ])("reads %s as %s", (hash, section) => {
    expect(sectionOfHash(hash)).toBe(section);
  });

  it.each(SETTINGS_SECTION_IDS)("reads the settings href of %s back as that section", (id) => {
    expect(sectionOfHash(settingsSectionHref(id))).toBe(id);
  });
});

describe("routeOfState and stateForRoute", () => {
  it("maps each pane to its route", () => {
    expect(routeOfState(base())).toBe("story");
    expect(routeOfState({ ...base(), pane: "assets" })).toBe("assets");
    expect(routeOfState({ ...base(), pane: "share" })).toBe("share");
  });

  it("reads the logic pane's Scripts page as the scripts route, and an open script as story", () => {
    const scripts = stateForRoute(base(), "scripts");
    expect(scripts.pane).toBe("logic");
    expect(scripts.panes.logic.view).toBe("scripts");
    expect(routeOfState(scripts)).toBe("scripts");
    const editing = {
      ...scripts,
      panes: {
        ...scripts.panes,
        logic: { ...scripts.panes.logic, view: "logic-editor", panel: "scripts" as const },
      },
    };
    expect(routeOfState(editing)).toBe("story");
    expect(stateForRoute(editing, "story").panes.logic.panel).toBe("scripts");
  });

  it("goes back to the main script from the Scripts page when Main was the last open", () => {
    const scripts = stateForRoute(base(), "scripts");
    const write = stateForRoute(scripts, "story");
    expect(write.panes.logic.panel).toBe("main");
    expect(write.panes.logic.view).toBe("list");
  });

  it("goes back to the script that was open when the Scripts page was reached from it", () => {
    const editing: WorkspaceCache = {
      ...base(),
      panes: {
        ...base().panes,
        logic: {
          view: "logic-editor",
          panel: "scripts",
          panels: {
            scripts: { activeEditor: { open: true, filename: "Scripts/intro.sd" } },
          },
        },
      },
    };
    const scripts = stateForRoute(editing, "scripts");
    expect(routeOfState(scripts)).toBe("scripts");
    const write = stateForRoute(scripts, "story");
    expect(write.panes.logic.view).toBe("logic-editor");
    expect(write.panes.logic.panel).toBe("scripts");
    expect(routeOfState(write)).toBe("story");
  });

  it("opens settings over the current pane and closes them on any other route", () => {
    const assets = stateForRoute(base(), "assets");
    const project = stateForRoute(assets, "settings");
    expect(project.pane).toBe("assets");
    expect(project.screen.settingsOpen).toBe(true);
    expect(routeOfState(project)).toBe("settings");
    const share = stateForRoute(project, "share");
    expect(share.screen.settingsOpen).toBe(false);
    expect(routeOfState(share)).toBe("share");
  });
});
