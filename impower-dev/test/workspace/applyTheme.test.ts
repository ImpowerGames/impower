import { signal } from "@preact/signals";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  LIGHT_SCHEME_QUERY,
  resolveTheme,
  THEME_PREFERENCES,
  type Theme,
} from "../../src/modules/spark-editor/workspace/settings/applyTheme";
import {
  PREFERENCES_STORAGE_KEY,
  WorkspaceSettings,
} from "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings";

const fakeScheme = (prefersLight: boolean) => {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const media = {
    media: LIGHT_SCHEME_QUERY,
    matches: prefersLight,
    addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) =>
      listeners.add(l),
    removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) =>
      listeners.delete(l),
  };
  return {
    media: media as unknown as MediaQueryList,
    listeners,
    change(next: boolean) {
      media.matches = next;
      for (const l of listeners) l({ matches: next } as MediaQueryListEvent);
    },
  };
};

describe("theme preference resolution", () => {
  it("resolves Automatic and anything unknown by the device scheme, and a named theme to itself", () => {
    const cases: [string, boolean, Theme][] = [
      ["automatic", true, "chalk"],
      ["automatic", false, "charcoal"],
      ["charcoal", true, "charcoal"],
      ["charcoal", false, "charcoal"],
      ["chalk", true, "chalk"],
      ["chalk", false, "chalk"],
      ["midnight", true, "midnight"],
      ["midnight", false, "midnight"],
      ["ink", true, "chalk"],
      ["", false, "charcoal"],
    ];
    for (const [preference, prefersLight, theme] of cases) {
      expect(resolveTheme(preference, prefersLight), `${preference} ${prefersLight}`).toBe(theme);
    }
  });

  it("offers Automatic, Charcoal, Chalk and Midnight", () => {
    expect([...THEME_PREFERENCES]).toEqual([
      "automatic",
      "charcoal",
      "chalk",
      "midnight",
    ]);
  });
});

describe("theme on the document root", () => {
  afterEach(() => {
    delete document.documentElement.dataset["theme"];
    localStorage.clear();
  });

  it("sets data-theme from the resolved theme and follows it until disposed", () => {
    const root = document.documentElement;
    const theme = signal<Theme>("charcoal");

    const dispose = applyTheme(root, theme);
    expect(root.dataset["theme"]).toBe("charcoal");

    root.dataset["theme"] = "stale";
    theme.value = "chalk";
    expect(root.dataset["theme"]).toBe("chalk");

    dispose();
    theme.value = "midnight";
    expect(root.dataset["theme"]).toBe("chalk");
  });

  it("follows the device scheme under Automatic without a reload, and stops listening when disposed", () => {
    const scheme = fakeScheme(false);
    const settings = new WorkspaceSettings(signal("p"), localStorage, scheme.media);
    const root = document.documentElement;
    const dispose = applyTheme(root, settings.theme);

    expect(root.dataset["theme"]).toBe("charcoal");
    scheme.change(true);
    expect(root.dataset["theme"]).toBe("chalk");

    settings.setPreference("theme", "charcoal");
    expect(root.dataset["theme"]).toBe("charcoal");
    scheme.change(false);
    scheme.change(true);
    expect(root.dataset["theme"]).toBe("charcoal");

    settings.setPreference("theme", "automatic");
    expect(root.dataset["theme"]).toBe("chalk");

    dispose();
    settings.dispose();
    expect(scheme.listeners.size).toBe(0);
  });

  it("reads a stored choice and refuses a theme it does not offer", () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ theme: "chalk" }));
    const dark = new WorkspaceSettings(signal("p"), localStorage, fakeScheme(false).media);
    expect(dark.theme.value).toBe("chalk");
    expect(() => dark.setPreference("theme", "ink" as "chalk")).toThrow(/theme/);
    dark.dispose();

    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ theme: "ink" }));
    const light = new WorkspaceSettings(signal("p"), localStorage, fakeScheme(true).media);
    expect(light.preferences.value.theme).toBe("automatic");
    expect(light.theme.value).toBe("chalk");
    light.dispose();
  });
});
