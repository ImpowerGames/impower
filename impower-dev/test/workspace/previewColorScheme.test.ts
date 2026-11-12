import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signal } from "@preact/signals";
import { beforeEach, describe, expect, it } from "vitest";
import { createPlayerPreferenceSync } from "../../src/modules/spark-editor/components/preview-game/playerPreferences";
import {
  colorSchemeOfTheme,
  THEMES,
} from "../../src/modules/spark-editor/workspace/settings/applyTheme";
import {
  PROJECT_SETTINGS_SCHEMA,
  type PreviewColorScheme,
  type ProjectSettings,
} from "../../src/modules/spark-editor/workspace/settings/settingsSchema";
import workspaceSettings, {
  WorkspaceSettings,
} from "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings";

const METHOD = "game/setSimulatedColorScheme";

const themeCss = readFileSync(
  resolve(__dirname, "../../../packages/impower-ui/src/theme.css"),
  "utf8",
);

const declaredScheme = (theme: string) => {
  const m = new RegExp(`\\[data-theme="${theme}"\\] \\{\\s*color-scheme: (light|dark);`).exec(themeCss);
  return m?.[1];
};

const connected = { jsonrpc: "2.0", method: "preview/connected", params: { type: "game" } };
const started = { jsonrpc: "2.0", method: "game/started", params: {} };

const open = (theme: string, choice: PreviewColorScheme) => {
  const themeSignal = signal(theme);
  const project = signal<ProjectSettings>({
    ...workspaceSettings.projectSettings.peek(),
    previewColorScheme: choice,
  });
  const posted: { method: string; params: any }[] = [];
  const sync = createPlayerPreferenceSync(
    (m) => posted.push(m as any),
    () => [],
    themeSignal,
    workspaceSettings.preferences,
    project,
  );
  const sent = () => posted.filter((m) => m.method === METHOD);
  return {
    sync,
    sent,
    schemes: () => sent().map((m) => m.params.color_scheme),
    setTheme: (next: string) => (themeSignal.value = next),
    choose: (next: PreviewColorScheme) =>
      (project.value = { ...project.value, previewColorScheme: next }),
  };
};

beforeEach(() => {
  localStorage.clear();
});

describe("the editor theme's colour scheme (#2062)", () => {
  it.each(THEMES)("%s maps to the color-scheme its theme.css block declares", (theme) => {
    expect(declaredScheme(theme)).toBeDefined();
    expect(colorSchemeOfTheme(theme)).toBe(declaredScheme(theme));
  });
});

describe("the preview's simulated colour scheme (#2062)", () => {
  it("defaults to Match editor for a project", () => {
    expect(PROJECT_SETTINGS_SCHEMA.previewColorScheme.default).toBe("editor");
  });

  it.each([
    ["charcoal", "dark"],
    ["chalk", "light"],
  ])("Match editor sends %s's scheme, %s, when the player connects and when a run starts", (theme, scheme) => {
    const preview = open(theme, "editor");
    preview.sync.received(connected);
    preview.sync.received(started);
    expect(preview.schemes()).toEqual([scheme, scheme]);
    preview.sync.dispose();
  });

  it("Match editor sends again when the editor's theme changes, and nothing when the scheme stays the same", () => {
    const preview = open("charcoal", "editor");
    preview.sync.received(connected);
    preview.setTheme("chalk");
    preview.setTheme("paper");
    preview.setTheme("midnight");
    preview.sync.dispose();
    preview.setTheme("chalk");
    expect(preview.schemes()).toEqual(["dark", "light", "dark"]);
  });

  it.each(["light", "dark"] as const)("%s sends that scheme in either editor theme", (choice) => {
    const preview = open("charcoal", choice);
    preview.sync.received(connected);
    preview.setTheme("chalk");
    preview.sync.received(started);
    expect(preview.schemes()).toEqual([choice, choice]);
    preview.sync.dispose();
  });

  it("a new choice is sent at once", () => {
    const preview = open("charcoal", "editor");
    preview.sync.received(connected);
    preview.choose("light");
    preview.choose("dark");
    preview.choose("editor");
    expect(preview.schemes()).toEqual(["dark", "light", "dark"]);
    preview.sync.dispose();
  });

  it("the message carries only the scheme", () => {
    const preview = open("chalk", "editor");
    preview.sync.received(connected);
    expect(preview.sent().map((m) => m.params)).toEqual([{ color_scheme: "light" }]);
    preview.sync.dispose();
  });
});

describe("the choice is kept per project (#2062)", () => {
  it("is restored after reopening its project, and a second project keeps its own", () => {
    const projectId = signal("p1");
    const store = new WorkspaceSettings(projectId, localStorage);
    store.setProjectSetting("previewColorScheme", "light");
    projectId.value = "p2";
    expect(store.projectSettings.value.previewColorScheme).toBe("editor");
    store.setProjectSetting("previewColorScheme", "dark");
    store.dispose();
    const reopened = new WorkspaceSettings(signal("p1"), localStorage);
    expect(reopened.projectSettings.value.previewColorScheme).toBe("light");
    reopened.dispose();
    const second = new WorkspaceSettings(signal("p2"), localStorage);
    expect(second.projectSettings.value.previewColorScheme).toBe("dark");
    second.dispose();
  });
});
