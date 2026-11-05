import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  routeOfHash,
  routeOfState,
  stateForRoute,
  transitionRoute,
} from "../../src/modules/spark-editor/workspace/routes";

const base = (): WorkspaceCache => ({
  project: { id: "local" },
  pane: "logic",
  panes: {
    logic: { view: "list", panel: "main", panels: {} },
    assets: { panel: "files", panels: {} },
    share: { panel: "game", panels: {} },
  },
  preview: { mode: "game", modes: { page: {}, game: {}, screenplay: {}, file: {} } },
  screen: {},
  sync: {},
  debug: {},
});

describe("routeOfHash", () => {
  it.each([
    ["#write", "write"],
    ["#scripts", "scripts"],
    ["#collection", "collection"],
    ["#share", "share"],
    ["#project", "project"],
    ["#project?section=save-sync", "project"],
    ["#logic", "write"],
    ["#assets", "collection"],
    ["#nowhere", undefined],
    ["", undefined],
  ])("reads %s as %s", (hash, route) => {
    expect(routeOfHash(hash)).toBe(route);
  });
});

describe("routeOfState and stateForRoute", () => {
  it("maps each pane to its route", () => {
    expect(routeOfState(base())).toBe("write");
    expect(routeOfState({ ...base(), pane: "assets" })).toBe("collection");
    expect(routeOfState({ ...base(), pane: "share" })).toBe("share");
  });

  it("reads the logic pane's scripts list as the scripts route, and an open script as write", () => {
    const scripts = stateForRoute(base(), "scripts");
    expect(scripts.pane).toBe("logic");
    expect(scripts.panes.logic.panel).toBe("scripts");
    expect(routeOfState(scripts)).toBe("scripts");
    const editing = {
      ...scripts,
      panes: {
        ...scripts.panes,
        logic: { ...scripts.panes.logic, view: "logic-editor" },
      },
    };
    expect(routeOfState(editing)).toBe("write");
    expect(stateForRoute(editing, "write").panes.logic.panel).toBe("scripts");
  });

  it("goes back to the main script from the scripts list on write", () => {
    const scripts = stateForRoute(base(), "scripts");
    expect(stateForRoute(scripts, "write").panes.logic.panel).toBe("main");
  });

  it("opens settings over the current pane and closes them on any other route", () => {
    const assets = stateForRoute(base(), "collection");
    const project = stateForRoute(assets, "project");
    expect(project.pane).toBe("assets");
    expect(project.screen.settingsOpen).toBe(true);
    expect(routeOfState(project)).toBe("project");
    const share = stateForRoute(project, "share");
    expect(share.screen.settingsOpen).toBe(false);
    expect(routeOfState(share)).toBe("share");
  });
});

describe("transitionRoute", () => {
  const original = {
    matchMedia: window.matchMedia,
    startViewTransition: (document as { startViewTransition?: unknown })
      .startViewTransition,
  };

  afterEach(() => {
    window.matchMedia = original.matchMedia;
    (document as { startViewTransition?: unknown }).startViewTransition =
      original.startViewTransition;
  });

  const stub = (reduce: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce") ? reduce : false,
    })) as typeof window.matchMedia;
    const start = vi.fn((update: () => Promise<void>) => {
      void update();
      return { ready: Promise.resolve() };
    });
    (document as { startViewTransition?: unknown }).startViewTransition = start;
    return start;
  };

  it("applies the route in one view transition when motion is allowed", () => {
    const start = stub(false);
    const apply = vi.fn();
    transitionRoute(apply);
    expect(start).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("applies the route directly under prefers-reduced-motion", () => {
    const start = stub(true);
    const apply = vi.fn();
    transitionRoute(apply);
    expect(start).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
