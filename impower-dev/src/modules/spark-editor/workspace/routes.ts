import type {
  PaneType,
  WorkspaceCache,
} from "@impower/spark-editor-protocol/src/types";

export const ROUTES = [
  "write",
  "scripts",
  "collection",
  "share",
  "project",
] as const;

export type Route = (typeof ROUTES)[number];

const LEGACY_ROUTES: Record<string, Route> = {
  logic: "write",
  main: "write",
  assets: "collection",
};

export const hashOfRoute = (route: Route): string => `#${route}`;

const nameOfHash = (hash: string): string =>
  hash.replace(/^#/, "").split(/[?&]/)[0]!.toLowerCase();

export const routeOfHash = (hash: string): Route | undefined => {
  const name = nameOfHash(hash);
  if ((ROUTES as readonly string[]).includes(name)) {
    return name as Route;
  }
  return LEGACY_ROUTES[name];
};

export const hashNamesRoute = (hash: string, route: Route): boolean =>
  nameOfHash(hash) === route;

export const sectionOfHash = (hash: string): string | undefined => {
  if (routeOfHash(hash) !== "project") {
    return undefined;
  }
  const query = hash.replace(/^#[^?&]*[?&]?/, "");
  return new URLSearchParams(query).get("section") || undefined;
};

export const routeOfPane = (pane: PaneType): Route =>
  pane === "assets" ? "collection" : pane === "share" ? "share" : "write";

export const routeOfState = (state: WorkspaceCache): Route => {
  if (state.screen?.settingsOpen) {
    return "project";
  }
  if (state.pane === "logic" && state.panes.logic.view === SCRIPTS_VIEW) {
    return "scripts";
  }
  return routeOfPane(state.pane);
};

export const SCRIPTS_VIEW = "scripts";
export const SCRIPT_EDITOR_VIEW = "logic-editor";

export const stateForRoute = (
  state: WorkspaceCache,
  route: Route,
): WorkspaceCache => {
  const writingTools =
    route === "write" ? state.screen.writingTools : undefined;
  if (route === "project") {
    return {
      ...state,
      screen: { ...state.screen, settingsOpen: true, writingTools },
    };
  }
  const screen = { ...state.screen, settingsOpen: false, writingTools };
  if (route === "collection") {
    return { ...state, screen, pane: "assets" };
  }
  if (route === "share") {
    return { ...state, screen, pane: "share" };
  }
  const logic = state.panes.logic;
  if (route === "scripts") {
    return {
      ...state,
      screen,
      pane: "logic",
      panes: { ...state.panes, logic: { ...logic, view: SCRIPTS_VIEW } },
    };
  }
  const scriptEditor = logic.panels.scripts?.activeEditor;
  const editingScript =
    logic.view === SCRIPT_EDITOR_VIEW ||
    (logic.view === SCRIPTS_VIEW &&
      logic.panel === "scripts" &&
      !!scriptEditor?.open &&
      !!scriptEditor.filename);
  return {
    ...state,
    screen,
    pane: "logic",
    panes: {
      ...state.panes,
      logic: {
        ...logic,
        view: editingScript ? SCRIPT_EDITOR_VIEW : "list",
        panel: editingScript ? "scripts" : "main",
      },
    },
  };
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export const transitionRoute = (apply: () => void): void => {
  const doc = typeof document === "undefined" ? undefined : document;
  const reduced =
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia(REDUCED_MOTION).matches;
  if (!doc || reduced || typeof doc.startViewTransition !== "function") {
    apply();
    return;
  }
  const transition = doc.startViewTransition(async () => {
    apply();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  transition.ready.catch(() => undefined);
};
