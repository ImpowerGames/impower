import { signal } from "@preact/signals";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  LIGHT_SCHEME_QUERY,
  resolveAppearance,
  resolveTheme,
  THEME_PREFERENCES,
  type Appearance,
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
      ["ink", true, "ink"],
      ["paper", false, "paper"],
      ["graphite", true, "graphite"],
      ["warm", true, "warm"],
      ["dusk", true, "dusk"],
      ["sepia", true, "chalk"],
      ["auto", false, "charcoal"],
      ["", false, "charcoal"],
    ];
    for (const [preference, prefersLight, theme] of cases) {
      expect(
        resolveTheme(preference, prefersLight),
        `${preference} ${prefersLight}`,
      ).toBe(theme);
    }
  });

  it("offers Automatic and the eight themes", () => {
    expect([...THEME_PREFERENCES]).toEqual([
      "automatic",
      "charcoal",
      "chalk",
      "ink",
      "paper",
      "graphite",
      "warm",
      "midnight",
      "dusk",
    ]);
  });
});

describe("theme on the document root", () => {
  afterEach(() => {
    delete document.documentElement.dataset["theme"];
    delete document.documentElement.dataset["surfaces"];
    delete document.documentElement.dataset["syntax"];
    localStorage.clear();
  });

  it("sets data-theme from the resolved theme and follows it until disposed", () => {
    const root = document.documentElement;
    const theme = signal<Appearance>({ theme: "charcoal" });

    const dispose = applyTheme(root, theme);
    expect(root.dataset["theme"]).toBe("charcoal");

    root.dataset["theme"] = "stale";
    theme.value = { theme: "chalk" };
    expect(root.dataset["theme"]).toBe("chalk");

    dispose();
    theme.value = { theme: "midnight" };
    expect(root.dataset["theme"]).toBe("chalk");
  });

  it("keeps the theme-color meta on the build's colour for the applied theme", () => {
    const meta = document.head.appendChild(document.createElement("meta"));
    meta.name = "theme-color";
    meta.content = "#202123";
    meta.dataset["themeColors"] = JSON.stringify({
      charcoal: "#202123",
      chalk: "#ececee",
      midnight: "#052d57",
    });
    const theme = signal<Appearance>({ theme: "chalk" });
    try {
      const dispose = applyTheme(document.documentElement, theme);
      expect(meta.content).toBe("#ececee");
      theme.value = { theme: "midnight" };
      expect(meta.content).toBe("#052d57");
      dispose();
      theme.value = { theme: "charcoal" };
      expect(meta.content).toBe("#052d57");
    } finally {
      meta.remove();
    }
  });

  it("follows the device scheme under Automatic without a reload, and stops listening when disposed", () => {
    const scheme = fakeScheme(false);
    const settings = new WorkspaceSettings(
      signal("p"),
      localStorage,
      scheme.media,
    );
    const root = document.documentElement;
    const dispose = applyTheme(root, settings.appearance);

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
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ theme: "chalk" }),
    );
    const dark = new WorkspaceSettings(
      signal("p"),
      localStorage,
      fakeScheme(false).media,
    );
    expect(dark.theme.value).toBe("chalk");
    expect(() => dark.setPreference("theme", "sepia" as "chalk")).toThrow(
      /theme/,
    );
    dark.dispose();

    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ theme: "sepia" }),
    );
    const light = new WorkspaceSettings(
      signal("p"),
      localStorage,
      fakeScheme(true).media,
    );
    expect(light.preferences.value.theme).toBe("automatic");
    expect(light.theme.value).toBe("chalk");
    light.dispose();
  });

  it("sets data-surfaces and data-syntax for Graphite and Warm Folio only, and restores them after another theme", () => {
    const settings = new WorkspaceSettings(
      signal("p"),
      localStorage,
      fakeScheme(false).media,
    );
    const root = document.documentElement;
    const dispose = applyTheme(root, settings.appearance);

    settings.setPreference("theme", "graphite");
    expect(root.dataset["surfaces"]).toBe("unified");
    expect(root.dataset["syntax"]).toBe("softened");

    settings.setPreference("surfaces", "layered");
    settings.setPreference("syntaxPalette", "original");
    expect(root.dataset["surfaces"]).toBe("layered");
    expect(root.dataset["syntax"]).toBe("original");

    for (const theme of ["charcoal", "midnight", "paper"] as const) {
      settings.setPreference("theme", theme);
      expect(root.dataset["theme"]).toBe(theme);
      expect(root.dataset["surfaces"], theme).toBeUndefined();
      expect(root.dataset["syntax"], theme).toBeUndefined();
      expect(settings.preferences.value.surfaces).toBe("layered");
      expect(settings.preferences.value.syntaxPalette).toBe("original");
    }

    settings.setPreference("theme", "graphite");
    expect(root.dataset["surfaces"]).toBe("layered");
    expect(root.dataset["syntax"]).toBe("original");

    settings.setPreference("theme", "warm");
    expect(root.dataset["surfaces"]).toBe("layered");
    expect(root.dataset["syntax"]).toBe("original");

    expect(() =>
      settings.setPreference("surfaces", "lighter" as "layered"),
    ).toThrow(/surfaces/);

    dispose();
    settings.dispose();
  });

  it("resolves the two sub-preferences only for the themes that offer them", () => {
    expect(resolveAppearance("graphite", "layered", "original")).toEqual({
      theme: "graphite",
      surfaces: "layered",
      syntax: "original",
    });
    expect(resolveAppearance("charcoal", "layered", "original")).toEqual({
      theme: "charcoal",
    });
  });
});
